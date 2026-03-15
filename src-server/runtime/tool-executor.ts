/**
 * Tool execution functions
 * Handles tool invocation, approval flow, and elicitation
 */

import { createHooks, type Tool } from '@voltagent/core';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { AgentSpec, AppConfig } from '../domain/types.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import { estimateCost, findModelPricing } from '../utils/pricing.js';
import {
  contextTokens as otelContextTokens,
  costEstimated as otelCost,
} from '../telemetry/metrics.js';

// Type extensions for tool executor
interface ToolWithDescription extends Omit<Tool<any>, 'description'> {
  description?: string;
}

interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number | null;
  tokenBreakdown?: {
    systemPromptTokens?: number;
    mcpServerTokens?: number;
    userMessageTokens?: number;
    assistantMessageTokens?: number;
  };
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
        const existingStats = (conversation.metadata
          ?.stats as ConversationStats) || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          contextTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCost: null,
        };

        // Get agent spec for model info
        const agentSlug = conversation.resourceId;
        const agentSpec = await configLoader.loadAgent(agentSlug);
        const modelId = agentSpec.model || appConfig.defaultModel;
        const cost = await calculateCost(
          modelId,
          usage,
          modelCatalog,
          appConfig,
          logger,
        );

        // Calculate context tokens: accumulated outputs + latest input
        // Context represents what's in memory (grows with conversation)
        const newOutputTokens =
          existingStats.outputTokens +
          (usage.completionTokens || (usage as any).outputTokens || 0);
        const newInputTokens =
          existingStats.inputTokens +
          (usage.promptTokens || (usage as any).inputTokens || 0);

        // Get fixed token counts from cache (calculated once at agent initialization)
        const fixedTokens = agentFixedTokens.get(agentSlug);
        const systemPromptTokens = fixedTokens?.systemPromptTokens || 0;
        const mcpServerTokens = fixedTokens?.mcpServerTokens || 0;

        // Get existing breakdown for incremental calculation
        const existingBreakdown = existingStats.tokenBreakdown || {};

        // Context = system prompt + tools + all user messages + all assistant responses
        // Optimize: only calculate new user message tokens, not all messages
        const existingUserMessageTokens =
          existingBreakdown.userMessageTokens || 0;

        // Get messages for user message token calculation
        const userMessages = messages.filter((m: any) => m.role === 'user');

        logger.info('[Token Calculation Debug]', {
          conversationId: context.conversationId,
          totalMessages: messages.length,
          userMessageCount: userMessages.length,
          existingUserMessageTokens,
          turn: existingStats.turns + 1,
        });

        // Find the latest user message (should be the last one added)
        const latestUserMessage = userMessages[userMessages.length - 1];

        let newUserMessageTokens = 0;
        if (latestUserMessage) {
          // UIMessage uses 'parts' array with text parts
          const parts = (latestUserMessage as UIMessage).parts || [];
          const content = parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text || '')
            .join('');
          newUserMessageTokens = Math.ceil(content.length / 4);

          logger.info('[New User Message]', {
            conversationId: context.conversationId,
            contentLength: content.length,
            tokens: newUserMessageTokens,
          });
        } else {
          logger.warn('[No User Message Found]', {
            conversationId: context.conversationId,
            userMessageCount: userMessages.length,
          });
        }

        const userMessageTokens =
          existingUserMessageTokens + newUserMessageTokens;
        const assistantMessageTokens = newOutputTokens;

        logger.info('[Token Breakdown]', {
          conversationId: context.conversationId,
          turn: existingStats.turns + 1,
          newUserMessageTokens,
          totalUserMessageTokens: userMessageTokens,
          systemPromptTokens,
          mcpServerTokens,
          assistantMessageTokens,
        });

        const contextTokens =
          systemPromptTokens +
          mcpServerTokens +
          userMessageTokens +
          assistantMessageTokens;

        // Store breakdown for stats endpoint
        const tokenBreakdown = {
          systemPromptTokens,
          mcpServerTokens,
          userMessageTokens,
          assistantMessageTokens,
        };

        // Update stats
        const updatedStats = {
          inputTokens: newInputTokens, // Total consumed across all LLM calls
          outputTokens: newOutputTokens, // Total generated
          totalTokens: newInputTokens + newOutputTokens,
          contextTokens, // Current memory size
          turns: existingStats.turns + 1,
          toolCalls: existingStats.toolCalls + toolCallCount,
          estimatedCost:
            cost !== null && existingStats.estimatedCost !== null
              ? existingStats.estimatedCost + cost
              : null,
          tokenBreakdown,
        };

        // Track per-model stats
        const modelStats = (conversation.metadata?.modelStats || {}) as Record<
          string,
          any
        >;
        const currentModelStats = modelStats[modelId] || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          contextTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCost: null,
        };

        const newModelOutputTokens =
          currentModelStats.outputTokens +
          (usage.completionTokens || (usage as any).outputTokens || 0);
        const newModelInputTokens =
          currentModelStats.inputTokens +
          (usage.promptTokens || (usage as any).inputTokens || 0);

        // Per-model context is harder to track accurately, use accumulated outputs as approximation
        const modelContextTokens =
          systemPromptTokens +
          mcpServerTokens +
          userMessageTokens +
          newModelOutputTokens;

        modelStats[modelId] = {
          inputTokens: newModelInputTokens,
          outputTokens: newModelOutputTokens,
          totalTokens: newModelInputTokens + newModelOutputTokens,
          contextTokens: modelContextTokens,
          turns: currentModelStats.turns + 1,
          toolCalls: currentModelStats.toolCalls + toolCallCount,
          estimatedCost:
            cost !== null && currentModelStats.estimatedCost !== null
              ? currentModelStats.estimatedCost + cost
              : null,
        };

        // Update conversation metadata
        await memory.updateConversation(context.conversationId, {
          metadata: {
            ...conversation.metadata,
            stats: updatedStats,
            modelStats,
          },
        });

        // Record OTel context and cost metrics
        otelContextTokens.add(systemPromptTokens + mcpServerTokens, {
          agent: agentSlug,
        });
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
            // Get model capabilities
            const models = await modelCatalog?.listModels();
            const modelInfo = models?.find((m) => m.modelId === modelId);
            const pricingInfo = await findModelPricing(modelCatalog, modelId, appConfig.region);

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
                  inputTokens:
                    usage.promptTokens || (usage as any).inputTokens || 0,
                  outputTokens:
                    usage.completionTokens || (usage as any).outputTokens || 0,
                  totalTokens: usage.totalTokens || 0,
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

/**
 * Calculate estimated cost based on model and token usage
 * Uses dynamic pricing from AWS Pricing API
 */
export async function calculateCost(
  modelId: string,
  usage: { promptTokens?: number; completionTokens?: number },
  modelCatalog: BedrockModelCatalog | undefined,
  appConfig: AppConfig,
  logger: any,
): Promise<number | null> {
  const inputTokens = usage.promptTokens || (usage as any).inputTokens || 0;
  const outputTokens =
    usage.completionTokens || (usage as any).outputTokens || 0;

  if (!modelCatalog) {
    logger.warn('No model catalog available, cost unavailable', { modelId });
    return null;
  }

  try {
    const pricing = await modelCatalog.getModelPricing(appConfig.region);
    const modelPricing = pricing.find(
      (p) =>
        p.modelId === modelId ||
        modelId.includes(p.modelId.toLowerCase().replace(/\s+/g, '-')),
    );

    if (modelPricing) {
      return estimateCost(modelPricing, inputTokens, outputTokens);
    }
    logger.warn('No pricing found for model, cost unavailable', { modelId });
    return null;
  } catch (error) {
    logger.warn('Failed to fetch pricing, cost unavailable', {
      modelId,
      error,
    });
    return null;
  }
}

/**
 * Calculate context window usage percentage
 * Note: Context window size is not available via API, using 200k default
 */
export function calculateContextWindowPercentage(
  _modelId: string,
  totalTokens: number,
): number {
  const maxTokens = 200000; // Default context window
  return Math.round((totalTokens / maxTokens) * 100 * 100) / 100;
}
