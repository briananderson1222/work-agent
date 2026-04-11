import type { AppConfig } from '@stallion-ai/contracts/config';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { estimateCost } from '../utils/pricing.js';

export interface UsageLike {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ConversationTokenBreakdown {
  systemPromptTokens?: number;
  mcpServerTokens?: number;
  userMessageTokens?: number;
  assistantMessageTokens?: number;
}

export interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number | null;
  tokenBreakdown?: ConversationTokenBreakdown;
}

export interface StatsUpdateParams {
  existingStats?: ConversationStats | null;
  existingModelStats?: Record<string, ConversationStats | undefined>;
  usage: UsageLike;
  toolCallCount: number;
  modelId: string;
  latestUserMessageText?: string;
  fixedTokens?: {
    systemPromptTokens: number;
    mcpServerTokens: number;
  };
  cost: number | null;
}

export function createEmptyConversationStats(): ConversationStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    contextTokens: 0,
    turns: 0,
    toolCalls: 0,
    estimatedCost: null,
  };
}

export function getUsageInputTokens(usage: UsageLike): number {
  return usage.promptTokens ?? usage.inputTokens ?? 0;
}

export function getUsageOutputTokens(usage: UsageLike): number {
  return usage.completionTokens ?? usage.outputTokens ?? 0;
}

export function getUsageTotalTokens(usage: UsageLike): number {
  return (
    usage.totalTokens ??
    getUsageInputTokens(usage) + getUsageOutputTokens(usage)
  );
}

export function estimateMessageTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function getMessageTextContent(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return '';
  }

  const candidate = message as {
    parts?: Array<{ type?: string; text?: string }>;
    content?: string | Array<{ text?: string }>;
  };

  if (Array.isArray(candidate.parts)) {
    return candidate.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('');
  }

  if (typeof candidate.content === 'string') {
    return candidate.content;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content.map((part) => part.text || '').join('');
  }

  return '';
}

export function calculateContextWindowPercentage(
  _modelId: string,
  totalTokens: number,
): number {
  const maxTokens = 200000;
  return Math.round((totalTokens / maxTokens) * 100 * 100) / 100;
}

export async function calculateUsageCost(
  modelId: string,
  usage: UsageLike,
  modelCatalog: BedrockModelCatalog | undefined,
  appConfig: AppConfig,
  logger: { warn: (message: string, meta?: unknown) => void },
): Promise<number | null> {
  if (!modelCatalog) {
    logger.warn('No model catalog available, cost unavailable', { modelId });
    return null;
  }

  try {
    const pricing = await modelCatalog.getModelPricing(appConfig.region);
    const match = pricing.find(
      (entry) =>
        entry.modelId === modelId ||
        modelId.includes(entry.modelId.toLowerCase().replace(/\s+/g, '-')),
    );

    if (match) {
      return estimateCost(
        match,
        getUsageInputTokens(usage),
        getUsageOutputTokens(usage),
      );
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

export function buildConversationStatsUpdate({
  existingStats,
  existingModelStats = {},
  usage,
  toolCallCount,
  modelId,
  latestUserMessageText = '',
  fixedTokens,
  cost,
}: StatsUpdateParams): {
  updatedStats: ConversationStats;
  modelStats: Record<string, ConversationStats | undefined>;
} {
  const stats = existingStats ?? createEmptyConversationStats();
  const currentModelStats =
    existingModelStats[modelId] ?? createEmptyConversationStats();
  const inputTokens = getUsageInputTokens(usage);
  const outputTokens = getUsageOutputTokens(usage);
  const systemPromptTokens = fixedTokens?.systemPromptTokens ?? 0;
  const mcpServerTokens = fixedTokens?.mcpServerTokens ?? 0;
  const existingUserMessageTokens =
    stats.tokenBreakdown?.userMessageTokens ?? 0;
  const userMessageTokens =
    existingUserMessageTokens +
    estimateMessageTextTokens(latestUserMessageText);
  const newInputTokens = stats.inputTokens + inputTokens;
  const newOutputTokens = stats.outputTokens + outputTokens;
  const contextTokens =
    systemPromptTokens +
    mcpServerTokens +
    userMessageTokens +
    newOutputTokens;

  const updatedStats: ConversationStats = {
    inputTokens: newInputTokens,
    outputTokens: newOutputTokens,
    totalTokens: newInputTokens + newOutputTokens,
    contextTokens,
    turns: stats.turns + 1,
    toolCalls: stats.toolCalls + toolCallCount,
    estimatedCost:
      cost !== null && stats.estimatedCost !== null
        ? stats.estimatedCost + cost
        : null,
    tokenBreakdown: {
      systemPromptTokens,
      mcpServerTokens,
      userMessageTokens,
      assistantMessageTokens: newOutputTokens,
    },
  };

  const updatedModelStats: ConversationStats = {
    inputTokens: currentModelStats.inputTokens + inputTokens,
    outputTokens: currentModelStats.outputTokens + outputTokens,
    totalTokens:
      currentModelStats.inputTokens +
      inputTokens +
      currentModelStats.outputTokens +
      outputTokens,
    contextTokens:
      systemPromptTokens +
      mcpServerTokens +
      userMessageTokens +
      currentModelStats.outputTokens +
      outputTokens,
    turns: currentModelStats.turns + 1,
    toolCalls: currentModelStats.toolCalls + toolCallCount,
    estimatedCost:
      cost !== null && currentModelStats.estimatedCost !== null
        ? currentModelStats.estimatedCost + cost
        : null,
    tokenBreakdown: updatedStats.tokenBreakdown,
  };

  return {
    updatedStats,
    modelStats: {
      ...existingModelStats,
      [modelId]: updatedModelStats,
    },
  };
}
