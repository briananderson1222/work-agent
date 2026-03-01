import { useAgentTools as useAgentToolsContext } from '@/contexts/AgentToolsContext';

/**
 * Hook to fetch and access agent tools
 * Automatically fetches on mount, uses cached data on subsequent calls
 */
export function useAgentTools(_apiBase: string, agentSlug: string | undefined) {
  const { tools } = useAgentToolsContext(agentSlug);
  return tools;
}
