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
 * Fire-and-forget agent invocation (side effects: enhance, sync, etc.)
 */
export function useAgentInvokeMutation(agentSlug: string) {
  return useMutation({
    mutationFn: (input: string) => invokeAgent(agentSlug, input),
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
      icon?: string;
      description?: string;
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
 * Fetch usage analytics with date range (for ActivityTimeline)
 */
export function useActivityUsageQuery(
  from: string,
  to: string,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['analytics', 'usage', from, to],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(
        `${apiBase}/api/analytics/usage?from=${from}&to=${to}`,
      );
      if (!r.ok) throw new Error('Failed to fetch activity usage');
      return (await r.json()).data;
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
 * Fetch insights (hourly activity, tool/agent usage)
 */
export function useInsightsQuery(days = 14, config?: QueryConfig<any>) {
  return useApiQuery(
    ['insights', days],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(`${apiBase}/api/insights?days=${days}`);
      if (!r.ok) throw new Error('Failed to fetch insights');
      return (await r.json()).data;
    },
    config,
  );
}

/**
 * Fetch feedback ratings
 */
export function useFeedbackRatingsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'ratings'],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(`${apiBase}/api/feedback/ratings`);
      if (!r.ok) throw new Error('Failed to fetch ratings');
      return (await r.json()).data || [];
    },
    config,
  );
}

/**
 * Fetch feedback behavior guidelines
 */
export function useFeedbackGuidelinesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'guidelines'],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(`${apiBase}/api/feedback/guidelines`);
      if (!r.ok) throw new Error('Failed to fetch guidelines');
      return (await r.json()).data?.summary || null;
    },
    config,
  );
}

/**
 * Fetch feedback analysis status
 */
export function useFeedbackStatusQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'status'],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(`${apiBase}/api/feedback/status`);
      if (!r.ok) throw new Error('Failed to fetch feedback status');
      return (await r.json()).data || null;
    },
    config,
  );
}

/**
 * Fetch user details by alias
 */
export function useUserQuery(alias: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['user', alias],
    async () => {
      const apiBase = await _getApiBase();
      const r = await fetch(
        `${apiBase}/api/users/${encodeURIComponent(alias)}`,
      );
      const data = await r.json();
      if (data.error && !data.name) throw new Error(data.error);
      return data;
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
    lastCommit: {
      sha: string;
      author: string;
      relativeTime: string;
      message: string;
    } | null;
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
  return useApiQuery<
    Array<{
      sha: string;
      author: string;
      relativeTime: string;
      message: string;
    }>
  >(
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

export function useKnowledgeNamespacesQuery(
  projectSlug: string,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...knowledgeQueries.namespaces(projectSlug),
    ...config,
    enabled: !!projectSlug && (config?.enabled ?? true),
  });
}

export function useKnowledgeDocsQuery(
  projectSlug: string,
  namespace?: string,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...knowledgeQueries.list(projectSlug, namespace),
    ...config,
    enabled: !!projectSlug && (config?.enabled ?? true),
  });
}

export function useKnowledgeSearchQuery(
  projectSlug: string,
  query: string,
  namespace?: string,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...knowledgeQueries.search(projectSlug, query, namespace),
    ...config,
    enabled: !!projectSlug && !!query && (config?.enabled ?? true),
  });
}

export function useKnowledgeSaveMutation(
  projectSlug: string,
  namespace?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      filename,
      content,
      metadata,
    }: {
      filename: string;
      content: string;
      metadata?: Record<string, any>;
    }) => {
      const { uploadKnowledge } = await import('./api');
      return uploadKnowledge(
        projectSlug,
        filename,
        content,
        namespace,
        metadata,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
    },
  });
}

export function useKnowledgeDeleteMutation(
  projectSlug: string,
  namespace?: string,
) {
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

export function useKnowledgeBulkDeleteMutation(
  projectSlug: string,
  namespace?: string,
) {
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

export function useKnowledgeStatusQuery(
  projectSlug: string,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['knowledge', 'status', projectSlug],
    async () => {
      const { fetchKnowledgeStatus } = await import('./api');
      return fetchKnowledgeStatus(projectSlug);
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

export function useKnowledgeDocContentQuery(
  projectSlug: string,
  docId: string | null,
  namespace?: string,
  config?: QueryConfig<string>,
) {
  return useApiQuery(
    ['knowledge', 'doc-content', projectSlug, docId ?? ''],
    async () => {
      const { fetchKnowledgeDocContent } = await import('./api');
      return fetchKnowledgeDocContent(projectSlug, docId!, namespace);
    },
    {
      ...config,
      enabled: !!projectSlug && !!docId && (config?.enabled ?? true),
    },
  );
}

export function useKnowledgeScanMutation(projectSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (options?: {
      extensions?: string[];
      includePatterns?: string[];
      excludePatterns?: string[];
    }) => {
      const { scanKnowledgeDirectory } = await import('./api');
      return scanKnowledgeDirectory(projectSlug, options);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
      qc.invalidateQueries({ queryKey: ['knowledge', 'status', projectSlug] });
    },
  });
}

export function useKnowledgeTreeQuery(
  projectSlug: string,
  namespace: string,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...knowledgeQueries.tree(projectSlug, namespace),
    ...config,
    enabled: !!projectSlug && !!namespace && (config?.enabled ?? true),
  });
}

export function useKnowledgeFilteredQuery(
  projectSlug: string,
  namespace: string,
  filters: Record<string, any>,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...knowledgeQueries.filtered(projectSlug, namespace, filters),
    ...config,
    enabled: !!projectSlug && !!namespace && (config?.enabled ?? true),
  });
}

export function useKnowledgeUpdateMutation(
  projectSlug: string,
  namespace?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docId,
      content,
      metadata,
    }: {
      docId: string;
      content?: string;
      metadata?: Record<string, any>;
    }) => {
      const { updateKnowledgeDoc } = await import('./api');
      return updateKnowledgeDoc(
        projectSlug,
        docId,
        { content, metadata },
        namespace,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', projectSlug] });
      qc.invalidateQueries({ queryKey: ['knowledge', 'tree', projectSlug] });
      qc.invalidateQueries({
        queryKey: ['knowledge', 'filtered', projectSlug],
      });
    },
  });
}

export function useProjectConversationsQuery(
  projectSlug: string,
  limit = 10,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['project-conversations', projectSlug],
    async () => {
      const { fetchProjectConversations } = await import('./api');
      return fetchProjectConversations(projectSlug, limit);
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

// ── Plugin Hooks ───────────────────────────────────────────────────

export function usePluginsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['plugins'],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/plugins`);
      const json = await res.json();
      return json.plugins || [];
    },
    config,
  );
}

export function usePluginUpdatesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['plugin-updates'],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/plugins/check-updates`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.updates || [];
    },
    config,
  );
}

export function useRegistryPluginsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['registry-plugins'],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/plugins`);
      const data = await res.json();
      return data.success ? data.data || [] : [];
    },
    config,
  );
}

export function usePluginInstallMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      source,
      skip,
    }: {
      source: string;
      skip?: string[];
    }) => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, skip }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Install failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins'] });
      qc.invalidateQueries({ queryKey: ['plugin-updates'] });
      qc.invalidateQueries({ queryKey: ['layouts'] });
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function usePluginPreviewMutation() {
  return useMutation({
    mutationFn: async (source: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/plugins/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      return res.json();
    },
  });
}

export function usePluginUpdateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}/update`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Update failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins'] });
      qc.invalidateQueries({ queryKey: ['plugin-updates'] });
    },
  });
}

export function usePluginRemoveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Remove failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins'] });
      qc.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function usePluginProviderToggleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginName,
      disabled,
    }: {
      pluginName: string;
      disabled: string[];
    }) => {
      const apiBase = await _getApiBase();
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled }),
        },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function usePluginRegistryInstallMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'install' | 'uninstall';
    }) => {
      const apiBase = await _getApiBase();
      const res =
        action === 'install'
          ? await fetch(`${apiBase}/api/registry/plugins/install`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            })
          : await fetch(
              `${apiBase}/api/registry/plugins/${encodeURIComponent(id)}`,
              { method: 'DELETE' },
            );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || `${action} failed`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registry-plugins'] });
      qc.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
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

// ── Scheduler Hooks ──

async function schedulerFetch<T>(path: string): Promise<T> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/scheduler${path}`);
  if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown scheduler error');
  return json.data;
}

async function schedulerMutate(path: string, method: string, body?: unknown) {
  const apiBase = await _getApiBase();
  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${apiBase}/scheduler${path}`, opts);
  if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown scheduler error');
  return json.data;
}

export function useSchedulerJobs() {
  return useApiQuery(
    ['scheduler', 'jobs'],
    () => schedulerFetch<any[]>('/jobs'),
    { staleTime: 30_000 },
  );
}

export function useSchedulerProviders() {
  return useApiQuery(
    ['scheduler', 'providers'],
    () => schedulerFetch<any[]>('/providers'),
    { staleTime: 60_000 },
  );
}

export function useSchedulerStats() {
  return useApiQuery(
    ['scheduler', 'stats'],
    () => schedulerFetch<any>('/stats'),
    { staleTime: 30_000 },
  );
}

export function useSchedulerStatus() {
  return useApiQuery(
    ['scheduler', 'status'],
    () => schedulerFetch<any>('/status'),
    { staleTime: 30_000 },
  );
}

export function useJobLogs(target: string | null) {
  return useApiQuery(
    ['scheduler', 'logs', target ?? ''],
    () => schedulerFetch<any[]>(`/jobs/${target}/logs`),
    { staleTime: 30_000, enabled: !!target },
  );
}

export function usePreviewSchedule(cron: string | null) {
  return useApiQuery(
    ['scheduler', 'preview', cron ?? ''],
    () =>
      schedulerFetch<string[]>(
        `/jobs/preview-schedule?cron=${encodeURIComponent(cron!)}`,
      ),
    { staleTime: 60_000, enabled: !!cron && cron.trim().length > 0 },
  );
}

export function useRunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: string) =>
      schedulerMutate(`/jobs/${target}/run`, 'POST'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useToggleJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, enabled }: { target: string; enabled: boolean }) =>
      schedulerMutate(
        `/jobs/${target}/${enabled ? 'enable' : 'disable'}`,
        'PUT',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: string) =>
      schedulerMutate(`/jobs/${target}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useEditJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      target,
      ...opts
    }: {
      target: string;
      [key: string]: unknown;
    }) => schedulerMutate(`/jobs/${target}`, 'PUT', opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useAddJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: {
      name: string;
      cron?: string;
      prompt?: string;
      agent?: string;
      provider?: string;
      openArtifact?: string;
      notifyStart?: boolean;
      trustAllTools?: boolean;
    }) => schedulerMutate('/jobs', 'POST', opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useFetchRunOutput() {
  return useMutation({
    mutationFn: (outputPath: string) =>
      schedulerMutate('/runs/output', 'POST', { path: outputPath }),
  });
}

export function useOpenArtifact() {
  return useMutation({
    mutationFn: (path: string) => schedulerMutate('/open', 'POST', { path }),
  });
}

// ── Skills ──────────────────────────────────────────────

export function useSkillsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['skills', 'local'],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/system/skills`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data ?? [];
    },
    config,
  );
}

export function useRegistrySkillsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['skills', 'registry'],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/skills`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data ?? [];
    },
    config,
  );
}

export function useInstallSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Install failed');
      return json;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useUninstallSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/skills/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Uninstall failed');
      return json;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useUpdateSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/skills/${id}/update`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Update failed');
      return json;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useSkillContentQuery(
  id: string | undefined,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['skills', 'content', id ?? ''],
    async () => {
      const apiBase = await _getApiBase();
      const res = await fetch(`${apiBase}/api/registry/skills/${id}/content`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as string;
    },
    { ...config, enabled: !!id && (config?.enabled ?? true) },
  );
}
