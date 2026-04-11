/**
 * Tool execution functions
 * Handles tool invocation, approval flow, and elicitation
 */

import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { createHooks, type Tool } from '@voltagent/core';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import {
  contextTokens as otelContextTokens,
  costEstimated as otelCost,
} from '../telemetry/metrics.js';
import { findModelPricing } from '../utils/pricing.js';
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

// Type extensions for tool executor
interface ToolWithDescription extends Omit<Tool<any>, 'description'> {
  description?: string;
}

interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: string;
  parts?: UIMessagePart[];
}

/**
 * Check if tool name matches any auto-approve pattern
 * Supports wildcards: "tool_*" matches "tool_read", "tool_write", etc.
 */
export function isAutoApproved(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === '*') return true;
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(toolName);
  });
}

/**
 * Wrap a tool to add elicitation-based approval for non-auto-approved tools
 */
export function wrapToolWithElicitation(
  tool: Tool<any>,
  spec: AgentSpec,
  _toolNameMapping: Map<
    string,
    {
      original: string;
      normalized: string;
      server: string | null;
      tool: string;
    }
  >,
  _approvalRegistry: ApprovalRegistry,
  logger: any,
): Tool<any> {
  if (!spec?.tools) return tool;

  const autoApprove = spec.tools.autoApprove || [];
  const isAutoApprovedTool = autoApprove.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return tool.name.startsWith(pattern.slice(0, -1));
    }
    return tool.name === pattern;
  });

  if (isAutoApprovedTool) {
    logger.debug('[Wrapper] Tool auto-approved, skipping wrapper', {
      toolName: tool.name,
    });
    return tool;
  }

  logger.debug('[Wrapper] Wrapping tool with elicitation', {
    toolName: tool.name,
  });

  // Wrap the execute function
  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  return {
    ...tool,
    execute: async (args: any, options: any) => {
      // Get elicitation from options (VoltAgent passes OperationContext properties directly)
      const elicitation = options?.elicitation;

      logger.debug('[Wrapper] Tool execute called, requesting approval', {
        toolName: tool.name,
        hasElicitation: !!elicitation,
      });

      // Request approval via elicitation
      if (elicitation) {
        logger.debug('[Wrapper] Calling elicitation for approval', {
          toolName: tool.name,
        });

        const approved = await elicitation({
          type: 'tool-approval',
          toolName: tool.name,
          toolDescription: (tool as ToolWithDescription).description || '',
          toolArgs: args,
        });

        logger.info('[Wrapper] Tool approval decision', {
          toolName: tool.name,
          approved,
          reason: approved ? 'user_approved' : 'user_denied',
        });

        if (!approved) {
          // Return a clear message to the LLM instead of throwing an error
          return {
            success: false,
            error: 'USER_DENIED',
            message: `I requested permission to use this tool, but the user explicitly denied the request. I should ask what I should do differently.`,
          };
        }
      } else {
        logger.info('[Wrapper] Tool auto-approved (no elicitation available)', {
          toolName: tool.name,
        });
      }

      // Execute the original tool
      return originalExecute(args, options);
    },
  };
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
