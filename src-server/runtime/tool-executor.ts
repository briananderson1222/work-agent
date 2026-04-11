/**
 * Tool execution functions
 * Handles tool invocation, approval flow, and elicitation
 */

import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { createHooks } from '@voltagent/core';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import {
  contextTokens as otelContextTokens,
  costEstimated as otelCost,
} from '../telemetry/metrics.js';
import { findModelPricing } from '../utils/pricing.js';
import { isAutoApproved } from './tool-approval.js';
import {
  buildConversationStatsUpdate,
  type ConversationStats,
  calculateUsageCost,
  estimateMessageTextTokens,
  getMessageTextContent,
  getUsageInputTokens,
  getUsageOutputTokens,
  getUsageTotalTokens,
} from './usage-stats.js';

interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: string;
  parts?: UIMessagePart[];
}

/**
 * Create tool approval hooks based on agent configuration
 * Tools in autoApprove list execute automatically, others require user confirmation
 */
export function createToolApprovalHooks(
  spec: AgentSpec,
  appConfig: AppConfig,
  configLoader: ConfigLoader,
  modelCatalog: BedrockModelCatalog | undefined,
  agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >,
  memoryAdapters: Map<string, FileMemoryAdapter>,
  logger: any,
) {
  const autoApprove = spec.tools?.autoApprove || [];

  return createHooks({
    onToolStart: async ({ tool, context }) => {
      // Track tool call count in context Map
      const currentCount =
        (context.context.get('toolCallCount') as number) || 0;
      context.context.set('toolCallCount', currentCount + 1);

      logger.debug('Tool execution starting', {
        toolName: tool.name,
        conversationId: context.conversationId,
      });

      // Check if this is a silent invocation (no conversationId means silent mode)
      const isSilentInvocation = !context.conversationId;

      if (isSilentInvocation) {
        return;
      }

      // Check if tool is in autoApprove list
      const isAutoApprovedTool = isAutoApproved(tool.name, autoApprove);

      logger.info('[Tool] Executing', {
        toolName: tool.name,
        isAutoApproved: isAutoApprovedTool,
      });
    },
    onEnd: async ({ context, output, agent }) => {
      // Only track stats for conversations (not silent invocations)
      if (!context.conversationId || !output) {
        return;
      }

      try {
        const memory = agent.getMemory();
        if (!memory) return;

        // Get current conversation
        const conversation = await memory.getConversation(
          context.conversationId,
        );
        if (!conversation) return;

        // Extract usage data (may be undefined if aborted)
        const usage = 'usage' in output ? output.usage : undefined;

        // Count tool calls from context (tracked in onToolStart)
        const toolCallCount =
          (context.context.get('toolCallCount') as number) || 0;

        // Get messages for this conversation
        const messages = await memory.getMessages(
          context.userId || '',
          context.conversationId,
        );

        // Log stats (even if usage is incomplete due to abortion)
        logger.info('[Usage Stats]', {
          conversationId: context.conversationId,
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0,
          messageCount: messages.length,
          toolCallCount,
          aborted: !usage,
        });

        // Only update conversation stats if we have usage data
        if (!usage) return;

        // Get existing stats or initialize
        const existingStats = conversation.metadata?.stats as
          | ConversationStats
          | undefined;

        // Get agent spec for model info
        const agentSlug = conversation.resourceId;
        const agentSpec = await configLoader.loadAgent(agentSlug);
        const modelId = agentSpec.model || appConfig.defaultModel;
        const cost = await calculateUsageCost(
          modelId,
          usage,
          modelCatalog,
          appConfig,
          logger,
        );

        // Calculate context tokens: accumulated outputs + latest input
        // Context represents what's in memory (grows with conversation)
        const fixedTokens = agentFixedTokens.get(agentSlug);
        const userMessages = messages.filter((m: any) => m.role === 'user');

        logger.info('[Token Calculation Debug]', {
          conversationId: context.conversationId,
          totalMessages: messages.length,
          userMessageCount: userMessages.length,
          existingUserMessageTokens:
            existingStats?.tokenBreakdown?.userMessageTokens || 0,
          turn: (existingStats?.turns || 0) + 1,
        });

        // Find the latest user message (should be the last one added)
        const latestUserMessage = userMessages[userMessages.length - 1];
        const latestUserMessageText = latestUserMessage
          ? getMessageTextContent(latestUserMessage as UIMessage)
          : '';

        if (!latestUserMessage) {
          logger.warn('[No User Message Found]', {
            conversationId: context.conversationId,
            userMessageCount: userMessages.length,
          });
        } else {
          logger.info('[New User Message]', {
            conversationId: context.conversationId,
            contentLength: latestUserMessageText.length,
            tokens: estimateMessageTextTokens(latestUserMessageText),
          });
        }
        const { updatedStats, modelStats } = buildConversationStatsUpdate({
          existingStats,
          existingModelStats: (conversation.metadata?.modelStats ||
            {}) as Record<string, ConversationStats | undefined>,
          usage,
          toolCallCount,
          modelId,
          latestUserMessageText,
          fixedTokens,
          cost,
        });

        logger.info('[Token Breakdown]', {
          conversationId: context.conversationId,
          turn: (existingStats?.turns || 0) + 1,
          newUserMessageTokens: estimateMessageTextTokens(
            latestUserMessageText,
          ),
          totalUserMessageTokens:
            updatedStats.tokenBreakdown?.userMessageTokens || 0,
          systemPromptTokens:
            updatedStats.tokenBreakdown?.systemPromptTokens || 0,
          mcpServerTokens: updatedStats.tokenBreakdown?.mcpServerTokens || 0,
          assistantMessageTokens:
            updatedStats.tokenBreakdown?.assistantMessageTokens || 0,
        });

        // Update conversation metadata
        await memory.updateConversation(context.conversationId, {
          metadata: {
            ...conversation.metadata,
            stats: updatedStats,
            modelStats,
          },
        });

        // Record OTel context and cost metrics
        otelContextTokens.add(
          (updatedStats.tokenBreakdown?.systemPromptTokens || 0) +
            (updatedStats.tokenBreakdown?.mcpServerTokens || 0),
          {
            agent: agentSlug,
          },
        );
        otelCost.add(cost ?? 0, { agent: agentSlug });

        // Enrich the last assistant message with model metadata and usage
        try {
          const adapter = memoryAdapters.get(agentSlug);
          if (!adapter) {
            logger.warn('No adapter found for agent', { agent: agentSlug });
            return;
          }

          const messages = await adapter.getMessages(
            `agent:${agentSlug}`,
            context.conversationId,
          );
          const lastMessage = messages[messages.length - 1];

          if (lastMessage && lastMessage.role === 'assistant') {
            if (!modelId) {
              return;
            }
            // Get model capabilities
            const models = await modelCatalog?.listModels();
            const modelInfo = models?.find((m) => m.modelId === modelId);
            const pricingInfo = await findModelPricing(
              modelCatalog,
              modelId,
              appConfig.region || 'us-east-1',
            );

            // Remove and re-add with metadata
            await adapter.removeLastMessage(
              `agent:${agentSlug}`,
              context.conversationId,
            );
            await adapter.addMessage(
              lastMessage,
              `agent:${agentSlug}`,
              context.conversationId,
              {
                model: modelId,
                modelMetadata: modelInfo
                  ? {
                      capabilities: {
                        inputModalities: modelInfo.inputModalities,
                        outputModalities: modelInfo.outputModalities,
                        supportsStreaming: modelInfo.responseStreamingSupported,
                      },
                      pricing: pricingInfo
                        ? {
                            inputTokenPrice: pricingInfo.inputTokenPrice,
                            outputTokenPrice: pricingInfo.outputTokenPrice,
                            currency: 'USD',
                            region: appConfig.region,
                          }
                        : undefined,
                    }
                  : undefined,
                usage: {
                  inputTokens: getUsageInputTokens(usage),
                  outputTokens: getUsageOutputTokens(usage),
                  totalTokens: getUsageTotalTokens(usage),
                  estimatedCost: cost,
                },
              },
            );
          }
        } catch (error) {
          logger.error('Failed to enrich message with model metadata', {
            error,
          });
        }
      } catch (error) {
        logger.error('Failed to update conversation stats', { error });
      }
    },
  });
}

export {
  calculateContextWindowPercentage,
  calculateUsageCost as calculateCost,
} from './usage-stats.js';
export { isAutoApproved, wrapToolWithElicitation } from './tool-approval.js';
