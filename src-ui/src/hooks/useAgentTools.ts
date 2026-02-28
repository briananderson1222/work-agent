import { useEffect } from 'react';
import { useAgentToolsWithState } from '@/contexts/AgentToolsContext';

/**
 * Hook to fetch and access agent tools
 * Automatically fetches on mount, uses cached data on subsequent calls
 */
export function useAgentTools(apiBase: string, agentSlug: string | undefined) {
  const { tools, fetch } = useAgentToolsWithState(apiBase, agentSlug);

  useEffect(() => {
    if (agentSlug) {
      fetch();
    }
  }, [agentSlug, fetch]);

  return tools;
}
