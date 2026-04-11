/**
 * Query Factories - Single source of truth for query definitions
 * Used by both hooks and imperative fetching (e.g., slash commands)
 */

import {
  _getApiBase,
  fetchKnowledgeDocs,
  fetchKnowledgeFiltered,
  fetchKnowledgeNamespaces,
  fetchKnowledgeTree,
  searchKnowledge,
} from './api';

export const agentQueries = {
  /**
   * Get agent details
   */
  agent: (agentSlug: string) => ({
    queryKey: ['agent', agentSlug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/agents/${encodeURIComponent(agentSlug)}`,
      );
      if (response.status === 404) throw new Error('Agent not found');
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

export const conversationQueries = {
  list: (agentSlug: string) => ({
    queryKey: ['conversations', agentSlug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/agents/${encodeURIComponent(agentSlug)}/conversations`,
      );
      if (!response.ok) throw new Error('Failed to fetch conversations');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 0,
  }),
};

export const orchestrationQueries = {
  providers: () => ({
    queryKey: ['orchestration-providers'],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/orchestration/providers`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      return result.data;
    },
    staleTime: 30 * 1000,
  }),
};

export const knowledgeQueries = {
  namespaces: (projectSlug: string) => ({
    queryKey: ['knowledge', 'namespaces', projectSlug],
    queryFn: async () => fetchKnowledgeNamespaces(projectSlug),
    staleTime: 5 * 60 * 1000,
  }),

  list: (projectSlug: string, namespace?: string) => ({
    queryKey: ['knowledge', 'docs', projectSlug, namespace ?? 'all'],
    queryFn: async () => fetchKnowledgeDocs(projectSlug, namespace),
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
    queryFn: async () => searchKnowledge(projectSlug, query, namespace, topK),
    staleTime: 60 * 1000,
  }),

  tree: (projectSlug: string, namespace: string) => ({
    queryKey: ['knowledge', 'tree', projectSlug, namespace],
    queryFn: async () => fetchKnowledgeTree(projectSlug, namespace),
    staleTime: 2 * 60 * 1000,
  }),

  filtered: (
    projectSlug: string,
    namespace: string,
    filters: Record<string, any>,
  ) => ({
    queryKey: ['knowledge', 'filtered', projectSlug, namespace, filters],
    queryFn: async () => fetchKnowledgeFiltered(projectSlug, namespace, filters),
    staleTime: 2 * 60 * 1000,
  }),
};
