/**
 * Query Factories - Single source of truth for query definitions
 * Used by both hooks and imperative fetching (e.g., slash commands)
 */

import { _getApiBase } from './api';

export const agentQueries = {
  /**
   * Get agent details
   */
  agent: (agentSlug: string) => ({
    queryKey: ['agent', agentSlug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${agentSlug}`);
      if (!response.ok) throw new Error('Failed to fetch agent');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  }),

  /**
   * Get agent tools
   */
  tools: (agentSlug: string) => ({
    queryKey: ['agent-tools', agentSlug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools`);
      if (!response.ok) throw new Error('Failed to fetch tools');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  }),

  /**
   * Get conversation stats
   */
  stats: (agentSlug: string, conversationId: string) => ({
    queryKey: ['stats', agentSlug, conversationId],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/agents/${agentSlug}/conversations/${conversationId}/stats`,
      );
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  }),
};

export const knowledgeQueries = {
  namespaces: (projectSlug: string) => ({
    queryKey: ['knowledge', 'namespaces', projectSlug],
    queryFn: async () => {
      const { fetchKnowledgeNamespaces } = await import('./api');
      return fetchKnowledgeNamespaces(projectSlug);
    },
    staleTime: 5 * 60 * 1000,
  }),

  list: (projectSlug: string, namespace?: string) => ({
    queryKey: ['knowledge', 'docs', projectSlug, namespace ?? 'all'],
    queryFn: async () => {
      const { fetchKnowledgeDocs } = await import('./api');
      return fetchKnowledgeDocs(projectSlug, namespace);
    },
    staleTime: 2 * 60 * 1000,
  }),

  search: (
    projectSlug: string,
    query: string,
    namespace?: string,
    topK?: number,
  ) => ({
    queryKey: [
      'knowledge',
      'search',
      projectSlug,
      query,
      namespace ?? 'all',
      topK,
    ],
    queryFn: async () => {
      const { searchKnowledge } = await import('./api');
      return searchKnowledge(projectSlug, query, namespace, topK);
    },
    staleTime: 60 * 1000,
  }),
};
