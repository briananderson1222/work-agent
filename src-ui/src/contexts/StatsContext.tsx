import { useStatsQuery } from '@stallion-ai/sdk';

type StatsData = {
  contextWindowPercentage?: number;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  turns?: number;
  toolCalls?: number;
  estimatedCost?: number;
  systemPromptTokens?: number;
  mcpServerTokens?: number;
  userMessageTokens?: number;
  assistantMessageTokens?: number;
  contextFilesTokens?: number;
  modelStats?: Record<string, any>;
};

export function useStats(
  agentSlug: string,
  conversationId: string,
  _apiBase?: string,
  shouldFetch: boolean = true,
) {
  const {
    data: stats,
    refetch,
    isLoading,
  } = useStatsQuery(agentSlug, conversationId, {
    enabled: shouldFetch && !!agentSlug,
  });

  return {
    stats: stats || null,
    refetch,
    loading: isLoading,
  };
}
