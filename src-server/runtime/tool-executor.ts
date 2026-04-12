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
import { isAutoApproved } from './tool-approval.js';
import { recordToolExecutionUsage } from './tool-execution-usage.js';

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
      await recordToolExecutionUsage({
        context,
        output,
        agent,
        appConfig,
        configLoader,
        modelCatalog,
        agentFixedTokens,
        memoryAdapters,
        logger,
      });
    },
  });
}

export { isAutoApproved, wrapToolWithElicitation } from './tool-approval.js';
export {
  calculateContextWindowPercentage,
  calculateUsageCost as calculateCost,
  estimateMessageTextTokens,
  getMessageTextContent,
  getUsageInputTokens,
  getUsageOutputTokens,
  getUsageTotalTokens,
} from './usage-stats.js';
