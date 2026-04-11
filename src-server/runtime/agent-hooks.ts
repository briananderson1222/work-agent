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
import { findModelPricing } from '../utils/pricing.js';
import { isAutoApproved } from './tool-executor.js';
import type {
  IAgentHooks,
  InvocationContext,
  TokenUsage,
  ToolCallContext,
} from './types.js';
import {
  buildConversationStatsUpdate,
  calculateUsageCost,
  getMessageTextContent,
} from './usage-stats.js';

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
        const cost = await calculateUsageCost(
          modelId,
          usage,
          deps.modelCatalog,
          deps.appConfig,
          deps.logger,
        );

        // Get existing stats
        const existingStats = conversation.metadata?.stats as any;

        const fixedTokens = deps.agentFixedTokens.get(invocation.agentSlug);

        // Estimate user message tokens from latest message
        const messages = await adapter.getMessages(
          invocation.userId || '',
          invocation.conversationId,
        );
        const userMessages = messages.filter((m: any) => m.role === 'user');
        const latest = userMessages[userMessages.length - 1];
        const latestUserMessageText = latest
          ? getMessageTextContent(latest)
          : '';
        const { updatedStats, modelStats } = buildConversationStatsUpdate({
          existingStats,
          existingModelStats: (conversation.metadata?.modelStats || {}) as Record<
            string,
            any
          >,
          usage,
          toolCallCount,
          modelId,
          latestUserMessageText,
          fixedTokens,
          cost,
        });

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
