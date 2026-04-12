import {
  calculateContextWindowPercentage,
  getMessageTextContent,
} from './usage-stats.js';

export interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens?: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
  tokenBreakdown?: {
    userMessageTokens?: number;
    assistantMessageTokens?: number;
    systemPromptTokens?: number;
    mcpServerTokens?: number;
  };
}

export interface ConversationStatsViewInput {
  stats?: ConversationStats;
  conversationId?: string;
  modelId: string;
  modelStats?: Record<string, unknown>;
  systemPromptTokens: number;
  mcpServerTokens: number;
  userMessageTokens?: number;
  assistantMessageTokens?: number;
  notFound?: boolean;
}

export function buildEmptyConversationStatsView({
  modelId,
  systemPromptTokens,
  mcpServerTokens,
  notFound = false,
}: {
  modelId: string;
  systemPromptTokens: number;
  mcpServerTokens: number;
  notFound?: boolean;
}) {
  const contextTokens = systemPromptTokens + mcpServerTokens;
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    contextTokens,
    turns: 0,
    toolCalls: 0,
    estimatedCost: 0,
    contextWindowPercentage: calculateContextWindowPercentage(
      modelId,
      contextTokens,
    ),
    modelId,
    systemPromptTokens,
    mcpServerTokens,
    userMessageTokens: 0,
    assistantMessageTokens: 0,
    contextFilesTokens: 0,
    ...(notFound ? { notFound: true } : {}),
  };
}

export function resolveConversationUserMessageTokens(messages: any[] = []): number {
  return messages
    .filter((message) => message.role === 'user')
    .reduce((sum, message) => {
      const content = getMessageTextContent(message);
      return sum + Math.ceil(content.length / 4);
    }, 0);
}

export function buildConversationStatsView({
  stats,
  conversationId,
  modelId,
  modelStats = {},
  systemPromptTokens,
  mcpServerTokens,
  userMessageTokens = 0,
  assistantMessageTokens,
  notFound,
}: ConversationStatsViewInput) {
  if (!stats) {
    return buildEmptyConversationStatsView({
      modelId,
      systemPromptTokens,
      mcpServerTokens,
      notFound,
    });
  }

  return {
    ...stats,
    contextWindowPercentage: calculateContextWindowPercentage(
      modelId,
      stats.contextTokens || stats.totalTokens,
    ),
    conversationId,
    modelId,
    modelStats,
    systemPromptTokens,
    mcpServerTokens,
    userMessageTokens,
    assistantMessageTokens:
      assistantMessageTokens ?? stats.outputTokens ?? 0,
    contextFilesTokens: 0,
  };
}
