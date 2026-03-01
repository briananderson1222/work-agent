import { useStatsQuery } from '@stallion-ai/sdk';

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
