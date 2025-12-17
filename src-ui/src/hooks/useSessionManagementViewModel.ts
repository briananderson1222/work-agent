import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

interface Agent {
  slug: string;
  name: string;
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
export function useSessionManagementViewModel(agents: Agent[], enabled: boolean = true) {
  // Fetch conversations for all agents using useQueries
  const queries = useQueries({
    queries: agents.map(agent => ({
      queryKey: ['conversations', agent.slug],
      queryFn: async () => {
        const apiBase = (window as any).__API_BASE__ || 'http://localhost:3141';
        const response = await fetch(`${apiBase}/agents/${agent.slug}/conversations`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.data;
      },
      enabled: enabled && !!agent.slug,
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Combine and sort all conversations
  const conversations = useMemo(() => {
    const allConversations: Conversation[] = [];
    
    queries.forEach((query, index) => {
      if (!query.data) return;
      
      const agent = agents[index];
      const agentConvos = query.data.map((conv: any) => ({
        ...conv,
        agentSlug: agent.slug,
        agentName: agent.name,
      }));
      allConversations.push(...agentConvos);
    });
    
    // Sort by updatedAt descending
    allConversations.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    return allConversations;
  }, [queries, agents]);

  const loading = queries.some(q => q.isLoading);
  const error = queries.find(q => q.error)?.error;

  return {
    conversations,
    loading,
    error,
  };
}
