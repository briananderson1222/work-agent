import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

interface Agent {
  slug: string;
  name: string;
  source?: string;
  icon?: string;
}

interface Conversation {
  id: string;
  agentSlug: string;
  agentName?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

/**
 * ViewModel for session management
 * Fetches conversations for all agents and combines them
 */
export function useSessionManagementViewModel(
  agents: Agent[],
  enabled: boolean = true,
) {
  const { apiBase } = useApiBase();
  // Fetch conversations for all agents using useQueries
  const queries = useQueries({
    queries: agents.map((agent) => ({
      queryKey: ['conversations', agent.slug],
      queryFn: async () => {
        const response = await fetch(
          `${apiBase}/agents/${agent.slug}/conversations`,
        );
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.data;
      },
      enabled: enabled && !!agent.slug,
      staleTime: 0,
    })),
  });

  // Combine and sort all conversations
  const conversations = useMemo(() => {
    const allConversations: Conversation[] = [];

    queries.forEach((query, index) => {
      if (!query.data) return;

      const agent = agents[index];
      const agentConvos = query.data.map((conv: Conversation) => {
        let agentType: 'acp' | 'workspace' | 'global' = 'global';
        let agentLabel = agent.name;
        let agentContext = '';

        if (agent.source === 'acp') {
          agentType = 'acp';
          const dash = agent.slug.indexOf('-');
          agentContext = dash > 0 ? agent.slug.substring(0, dash) : 'acp';
          agentLabel = dash > 0 ? agent.slug.substring(dash + 1) : agent.name;
        } else if (agent.slug.includes(':')) {
          agentType = 'workspace';
          const [ws, ag] = agent.slug.split(':', 2);
          agentContext = ws;
          agentLabel = ag || agent.name;
        }

        return {
          ...conv,
          agentSlug: agent.slug,
          agentName: agent.name,
          agentType,
          agentLabel,
          agentContext,
          agentIcon: agent.icon,
        };
      });
      allConversations.push(...agentConvos);
    });

    // Sort by updatedAt descending
    allConversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return allConversations;
  }, [queries, agents]);

  const loading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;

  return {
    conversations,
    loading,
    error,
  };
}
