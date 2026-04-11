/**
 * Framework-agnostic agent lifecycle hooks.
 *
 * These implement the BUSINESS LOGIC for tool approval, usage tracking,
 * and conversation stats. They work with IAgent/IMemory/ITool — no
 * framework imports. Each adapter wires them into its native hook system.
 *
 * This file replaces the VoltAgent-specific hook logic that was in
 * tool-executor.ts createToolApprovalHooks().
 */

import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import { estimateCost, findModelPricing } from '../utils/pricing.js';
import { isAutoApproved } from './tool-executor.js';
import type {
  IAgentHooks,
  InvocationContext,
  TokenUsage,
  ToolCallContext,
} from './types.js';

// ── Hook factory dependencies ──────────────────────────

export interface AgentHooksDeps {
  spec: AgentSpec;
  appConfig: AppConfig;
  configLoader: ConfigLoader;
  modelCatalog?: BedrockModelCatalog;
  agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  approvalRegistry: ApprovalRegistry;
  logger: any;
}

// ── Factory ────────────────────────────────────────────

/**
 * Create framework-agnostic hook implementations.
 * Pass the returned hooks to the adapter via config.hooks.
 *
 * The returned object has a mutable `requestApproval` slot that the
 * chat handler sets per-request (it needs the InjectableStream which
 * only exists during streaming).
 */
export function createAgentHooks(deps: AgentHooksDeps): IAgentHooks & {
  requestApproval?: (tool: ToolCallContext) => Promise<boolean>;
} {
  const autoApprove = deps.spec.tools?.autoApprove || [];

  const hooks: IAgentHooks & {
    requestApproval?: (tool: ToolCallContext) => Promise<boolean>;
  } = {
    beforeToolCall: async (tool, _invocation) => {
      if (isAutoApproved(tool.toolName, autoApprove)) {
        return true;
      }
      if (hooks.requestApproval) {
        return hooks.requestApproval(tool);
      }
      // No approval mechanism (e.g. silent invocation) — auto-approve
      return true;
    },

    afterToolCall: (tool, _result, invocation) => {
      deps.logger.debug('[Hook] Tool executed', {
        toolName: tool.toolName,
        agentSlug: invocation.agentSlug,
      });
    },

    afterInvocation: async (ctx) => {
      const { invocation, usage, toolCallCount } = ctx;
      if (!invocation.conversationId) return;

      try {
        const adapter = deps.memoryAdapters.get(invocation.agentSlug);
        if (!adapter) return;

        if (!usage) return;

        const conversation = await adapter.getConversation(
          invocation.conversationId,
        );
        if (!conversation) return;

        const agentSpec = await deps.configLoader.loadAgent(
          invocation.agentSlug,
        );
        const modelId = agentSpec.model || deps.appConfig.defaultModel;
        const cost = await calculateCost(
          modelId,
          usage,
          deps.modelCatalog,
          deps.appConfig,
          deps.logger,
        );

        // Get existing stats
        const existingStats = (conversation.metadata?.stats as any) || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          contextTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCost: null,
        };

        const fixedTokens = deps.agentFixedTokens.get(invocation.agentSlug);
        const systemPromptTokens = fixedTokens?.systemPromptTokens || 0;
        const mcpServerTokens = fixedTokens?.mcpServerTokens || 0;

        // Calculate new token totals
        const newOutputTokens =
          existingStats.outputTokens + (usage.completionTokens || 0);
        const newInputTokens =
          existingStats.inputTokens + (usage.promptTokens || 0);

        // Estimate user message tokens from latest message
        const messages = await adapter.getMessages(
          invocation.userId || '',
          invocation.conversationId,
        );
        const userMessages = messages.filter((m: any) => m.role === 'user');
        const existingUserTokens =
          existingStats.tokenBreakdown?.userMessageTokens || 0;

        let newUserTokens = 0;
        const latest = userMessages[userMessages.length - 1];
        if (latest) {
          const parts = (latest as any).parts || [];
          const text = parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text || '')
            .join('');
          newUserTokens = Math.ceil(text.length / 4);
        }

        const userMessageTokens = existingUserTokens + newUserTokens;
        const contextTokens =
          systemPromptTokens +
          mcpServerTokens +
          userMessageTokens +
          newOutputTokens;

        const updatedStats = {
          inputTokens: newInputTokens,
          outputTokens: newOutputTokens,
          totalTokens: newInputTokens + newOutputTokens,
          contextTokens,
          turns: existingStats.turns + 1,
          toolCalls: existingStats.toolCalls + toolCallCount,
          estimatedCost:
            cost !== null && existingStats.estimatedCost !== null
              ? existingStats.estimatedCost + cost
              : null,
          tokenBreakdown: {
            systemPromptTokens,
            mcpServerTokens,
            userMessageTokens,
            assistantMessageTokens: newOutputTokens,
          },
        };

        // Per-model stats
        const modelStats = {
          ...(conversation.metadata?.modelStats || {}),
        } as Record<string, any>;
        const ms = modelStats[modelId] || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCost: null,
        };
        modelStats[modelId] = {
          inputTokens: ms.inputTokens + (usage.promptTokens || 0),
          outputTokens: ms.outputTokens + (usage.completionTokens || 0),
          totalTokens:
            ms.totalTokens +
            (usage.promptTokens || 0) +
            (usage.completionTokens || 0),
          turns: ms.turns + 1,
          toolCalls: ms.toolCalls + toolCallCount,
          estimatedCost:
            cost !== null && ms.estimatedCost !== null
              ? ms.estimatedCost + cost
              : null,
        };

        await adapter.updateConversation(invocation.conversationId, {
          metadata: {
            ...conversation.metadata,
            stats: updatedStats,
            modelStats,
          },
        });

        await enrichLastMessage(
          adapter,
          invocation,
          modelId,
          usage,
          cost,
          deps,
        );
      } catch (error) {
        deps.logger.error('Failed to update conversation stats', { error });
      }
    },
  };

  return hooks;
}

// ── Helpers ────────────────────────────────────────────

async function enrichLastMessage(
  adapter: FileMemoryAdapter,
  invocation: InvocationContext,
  modelId: string,
  usage: TokenUsage,
  cost: number | null,
  deps: AgentHooksDeps,
) {
  try {
    const messages = await adapter.getMessages(
      `agent:${invocation.agentSlug}`,
      invocation.conversationId!,
    );
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;

    const models = await deps.modelCatalog?.listModels();
    const modelInfo = models?.find((m: any) => m.modelId === modelId);
    const pricingInfo = await findModelPricing(
      deps.modelCatalog,
      modelId,
      deps.appConfig.region,
    );

    await adapter.removeLastMessage(
      `agent:${invocation.agentSlug}`,
      invocation.conversationId!,
    );
    await adapter.addMessage(
      last,
      `agent:${invocation.agentSlug}`,
      invocation.conversationId!,
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
                    region: deps.appConfig.region,
                  }
                : undefined,
            }
          : undefined,
        usage: {
          inputTokens: usage.promptTokens || 0,
          outputTokens: usage.completionTokens || 0,
          totalTokens:
            (usage.promptTokens || 0) + (usage.completionTokens || 0),
          estimatedCost: cost,
        },
      },
    );
  } catch (error) {
    deps.logger.error('Failed to enrich message with model metadata', {
      error,
    });
  }
}

async function calculateCost(
  modelId: string,
  usage: TokenUsage,
  modelCatalog: BedrockModelCatalog | undefined,
  appConfig: AppConfig,
  logger: any,
): Promise<number | null> {
  const inputTokens = usage.promptTokens || 0;
  const outputTokens = usage.completionTokens || 0;
  if (!modelCatalog) {
    logger.warn('No model catalog available, cost unavailable', { modelId });
    return null;
  }

  try {
    const pricing = await modelCatalog.getModelPricing(appConfig.region);
    const match = pricing.find(
      (p: any) =>
        p.modelId === modelId ||
        modelId.includes(p.modelId.toLowerCase().replace(/\s+/g, '-')),
    );
    if (match) {
      return estimateCost(match, inputTokens, outputTokens);
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
