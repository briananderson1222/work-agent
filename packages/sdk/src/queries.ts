/**
 * SDK Query Hooks - Wraps React Query for API calls
 * Plugins use these instead of raw useQuery
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { _getApiBase, invokeAgent } from './api';
import { agentQueries, knowledgeQueries } from './queryFactories';

interface QueryConfig<_T> {
  staleTime?: number;
  gcTime?: number; // Renamed from cacheTime in React Query v5
  enabled?: boolean;
}

/**
 * Invoke agent with structured output
 * Auto-generates cache key from agent + input + schema
 */
export function useInvokeAgent<T = any>(
  agentSlug: string,
  content: string,
  options?: { schema?: any; model?: string },
  config?: QueryConfig<T>,
) {
  return useQuery({
    queryKey: ['invoke', agentSlug, content, options],
    queryFn: () => invokeAgent(agentSlug, content, options),
    staleTime: config?.staleTime ?? 5 * 60 * 1000,
    enabled: config?.enabled ?? true,
  });
}

/**
 * Generic API query hook
 * For custom API calls with manual cache key
 */
export function useApiQuery<T = any>(
  queryKey: (string | number | object)[],
  queryFn: () => Promise<T>,
  config?: QueryConfig<T>,
) {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: config?.staleTime ?? 5 * 60 * 1000,
    gcTime: config?.gcTime ?? 10 * 60 * 1000,
    enabled: config?.enabled ?? true,
  });
}

/**
 * Mutation hook for API updates
 */
export function useApiMutation<TData = any, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateKeys?: (string | number)[][];
  },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      options?.onSuccess?.(data);
      options?.invalidateKeys?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: options?.onError,
  });
}

/**
 * Invalidate query cache
 */
export function useInvalidateQuery() {
  const queryClient = useQueryClient();
  return (queryKey: (string | number | object)[]) => {
    queryClient.invalidateQueries({ queryKey });
  };
}

/**
 * Fetch layout by slug
 */
export function useLayoutQuery(slug: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['layout', slug],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/layouts/${slug}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch all layouts
 */
export function useLayoutsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['layouts'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/layouts`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch all projects
 */
export function useProjectsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['projects'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch project by slug
 */
export function useProjectQuery(slug: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['projects', slug],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { ...config, enabled: !!slug && (config?.enabled ?? true) },
  );
}

/**
 * Fetch layouts for a project
 */
export function useProjectLayoutsQuery(
  projectSlug: string,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['projects', projectSlug, 'layouts'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${projectSlug}/layouts`,
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

/**
 * Create a new project
 */
export function useCreateProjectMutation() {
  return useApiMutation(
    async (data: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      workingDirectory?: string;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { invalidateKeys: [['projects']] },
  );
}

/**
 * Update an existing project
 */
export function useUpdateProjectMutation() {
  return useApiMutation(
    async ({ slug, ...data }: { slug: string; [key: string]: any }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { invalidateKeys: [['projects']] },
  );
}

/**
 * Delete a project
 */
export function useDeleteProjectMutation() {
  return useApiMutation(
    async (slug: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { invalidateKeys: [['projects']] },
  );
}

/**
 * Create a layout within a project
 */
export function useCreateLayoutMutation(projectSlug: string) {
  return useApiMutation(
    async (data: {
      name: string;
      slug: string;
      type: string;
      config?: Record<string, unknown>;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${projectSlug}/layouts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { invalidateKeys: [['projects', projectSlug, 'layouts']] },
  );
}

/**
 * Fetch usage analytics
 */
export function useUsageQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['analytics', 'usage'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/analytics/usage`);
      if (!response.ok) throw new Error('Failed to fetch usage');
      const result = await response.json();
      return result.data;
    },
    config,
  );
}

/**
 * Fetch achievements
 */
export function useAchievementsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['analytics', 'achievements'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/analytics/achievements`);
      if (!response.ok) throw new Error('Failed to fetch achievements');
      const result = await response.json();
      return result.data;
    },
    config,
  );
}

/**
 * Fetch all agents
 */
export function useAgentsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['agents'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/agents`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch Bedrock models
 */
export function useModelsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['models'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/bedrock/models`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch tools for an agent
 */
export function useAgentToolsQuery(
  agentSlug: string | undefined,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...agentQueries.tools(agentSlug!),
    ...config,
    enabled: !!agentSlug && (config?.enabled ?? true),
  });
}

/**
 * Fetch model capabilities
 */
export function useModelCapabilitiesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['modelCapabilities'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/models/capabilities`);
      if (!response.ok) {
        if (response.status === 401) {
          console.warn(
            'AWS credentials not configured - model capabilities unavailable',
          );
          return [];
        }
        throw new Error(
          `Failed to fetch model capabilities: ${response.statusText}`,
        );
      }
      const result = await response.json();
      return result.data || [];
    },
    config,
  );
}

/**
 * Fetch app configuration
 */
export function useConfigQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['config'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/config/app`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch all registered prompts
 */
export function usePromptsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['prompts'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/prompts`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config,
  );
}

/**
 * Fetch conversations for an agent
 */
export function useConversationsQuery(
  agentSlug: string | undefined,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    agentSlug ? ['conversations', agentSlug] : ['conversations'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/agents/${agentSlug}/conversations`,
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { ...config, enabled: !!agentSlug && (config?.enabled ?? true) },
  );
}

/**
 * Fetch git status for a working directory
 */
export function useGitStatusQuery(
  workingDirectory: string | null | undefined,
  config?: QueryConfig<any>,
) {
  return useApiQuery<{
    branch: string;
    changes: string[];
    staged: number;
    unstaged: number;
    untracked: number;
    lastCommit: { sha: string; author: string; relativeTime: string; message: string } | null;
    ahead: number;
    behind: number;
  } | null>(
    ['git-status', workingDirectory ?? ''],
    async () => {
      if (!workingDirectory) return null;
      const apiBase = await _getApiBase();
      const res = await fetch(
        `${apiBase}/api/coding/git/status?path=${encodeURIComponent(workingDirectory)}`,
      );
      const json = await res.json();
      if (!json.success) return null;
      return json.data;
    },
    {
      ...config,
      enabled: !!workingDirectory && (config?.enabled ?? true),
      staleTime: config?.staleTime ?? 10_000,
    },
  );
}

/**
 * Fetch recent git commits for a working directory
 */
export function useGitLogQuery(
  workingDirectory: string | null | undefined,
  count = 5,
  config?: QueryConfig<any>,
) {
  return useApiQuery<Array<{ sha: string; author: string; relativeTime: string; message: string }>>(
    ['git-log', workingDirectory ?? '', count],
    async () => {
      if (!workingDirectory) return [];
      const apiBase = await _getApiBase();
      const res = await fetch(
        `${apiBase}/api/coding/git/log?path=${encodeURIComponent(workingDirectory)}&count=${count}`,
      );
      const json = await res.json();
      if (!json.success) return [];
      return json.data;
    },
    {
      ...config,
      enabled: !!workingDirectory && (config?.enabled ?? true),
      staleTime: config?.staleTime ?? 30_000,
    },
  );
}

/**
 * Fetch conversation stats
 */
export function useStatsQuery(
  agentSlug: string | undefined,
  conversationId: string | undefined,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...agentQueries.stats(agentSlug || '', conversationId || ''),
    ...config,
    enabled: !!agentSlug && !!conversationId && (config?.enabled ?? true),
  });
}

// ── Knowledge Hooks ────────────────────────────────────────────────

export function useKnowledgeNamespacesQuery(projectSlug: string, config?: QueryConfig<any>) {
  return useQuery({
    ...knowledgeQueries.namespaces(projectSlug),
    ...config,
    enabled: !!projectSlug && (config?.enabled ?? true),
  });
}

export function useKnowledgeDocsQuery(projectSlug: string, namespace?: string, config?: QueryConfig<any>) {
  return useQuery({
    ...knowledgeQueries.list(projectSlug, namespace),
    ...config,
    enabled: !!projectSlug && (config?.enabled ?? true),
  });
}

export function useKnowledgeSearchQuery(projectSlug: string, query: string, namespace?: string, config?: QueryConfig<any>) {
  return useQuery({
    ...knowledgeQueries.search(projectSlug, query, namespace),
    ...config,
    enabled: !!projectSlug && !!query && (config?.enabled ?? true),
  });
}

export function useKnowledgeSaveMutation(projectSlug: string, namespace?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filename, content, metadata }: { filename: string; content: string; metadata?: Record<string, any> }) => {
      const { uploadKnowledge } = await import('./api');
      return uploadKnowledge(projectSlug, filename, content, namespace, metadata);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
    },
  });
}

export function useKnowledgeDeleteMutation(projectSlug: string, namespace?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const { deleteKnowledgeDoc } = await import('./api');
      return deleteKnowledgeDoc(projectSlug, docId, namespace);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
    },
  });
}

export function useKnowledgeBulkDeleteMutation(projectSlug: string, namespace?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { bulkDeleteKnowledgeDocs } = await import('./api');
      return bulkDeleteKnowledgeDocs(projectSlug, ids, namespace);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
    },
  });
}

export function useKnowledgeStatusQuery(projectSlug: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['knowledge', 'status', projectSlug],
    async () => {
      const { fetchKnowledgeStatus } = await import('./api');
      return fetchKnowledgeStatus(projectSlug);
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

export function useKnowledgeScanMutation(projectSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (options?: { extensions?: string[]; includePatterns?: string[]; excludePatterns?: string[] }) => {
      const { scanKnowledgeDirectory } = await import('./api');
      return scanKnowledgeDirectory(projectSlug, options);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
      qc.invalidateQueries({ queryKey: ['knowledge', 'status', projectSlug] });
    },
  });
}

export function useProjectConversationsQuery(projectSlug: string, limit = 10, config?: QueryConfig<any>) {
  return useApiQuery(
    ['project-conversations', projectSlug],
    async () => {
      const { fetchProjectConversations } = await import('./api');
      return fetchProjectConversations(projectSlug, limit);
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

export function useAddLayoutFromPluginMutation(projectSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plugin: string) => {
      const { addProjectLayoutFromPlugin } = await import('./api');
      return addProjectLayoutFromPlugin(projectSlug, plugin);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectSlug, 'layouts'] });
    },
  });
}
