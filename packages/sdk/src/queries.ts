/**
 * SDK Query Hooks - Wraps React Query for API calls
 * Plugins use these instead of raw useQuery
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { transformTool, invokeAgent, invoke, _getApiBase } from './api';

// Re-export useQueryClient for contexts that need it
export { useQueryClient } from '@tanstack/react-query';

interface QueryConfig<T> {
  staleTime?: number;
  gcTime?: number; // Renamed from cacheTime in React Query v5
  enabled?: boolean;
}

/**
 * Transform tool data using an agent
 * Auto-generates cache key from agent + tool + args
 */
export function useTransformTool<T = any>(
  agentSlug: string,
  toolName: string,
  toolArgs: any,
  transformFn: string,
  config?: QueryConfig<T>
) {
  return useQuery({
    queryKey: ['transform', agentSlug, toolName, toolArgs],
    queryFn: () => transformTool(agentSlug, toolName, toolArgs, transformFn),
    staleTime: config?.staleTime ?? 5 * 60 * 1000,
    gcTime: config?.gcTime ?? 10 * 60 * 1000,
    enabled: config?.enabled ?? true,
  });
}

/**
 * Invoke agent with structured output
 * Auto-generates cache key from agent + input + schema
 */
export function useInvokeAgent<T = any>(
  agentSlug: string,
  content: string,
  options?: { schema?: any; model?: string },
  config?: QueryConfig<T>
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
  config?: QueryConfig<T>
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
  }
) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      options?.onSuccess?.(data);
      options?.invalidateKeys?.forEach(key => {
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
 * Fetch workspace by slug
 */
export function useWorkspaceQuery(slug: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['workspace', slug],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/workspaces/${slug}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config
  );
}

/**
 * Fetch all workspaces
 */
export function useWorkspacesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['workspaces'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/workspaces`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    config
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
    config
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
    config
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
    config
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
    config
  );
}

/**
 * Fetch tools for an agent
 */
export function useAgentToolsQuery(agentSlug: string | undefined, config?: QueryConfig<any>) {
  return useApiQuery(
    agentSlug ? ['agentTools', agentSlug] : ['agentTools'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { ...config, enabled: !!agentSlug && (config?.enabled ?? true) }
  );
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
      const result = await response.json();
      return result.data;
    },
    config
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
    config
  );
}

/**
 * Fetch conversations for an agent
 */
export function useConversationsQuery(agentSlug: string | undefined, config?: QueryConfig<any>) {
  return useApiQuery(
    agentSlug ? ['conversations', agentSlug] : ['conversations'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { ...config, enabled: !!agentSlug && (config?.enabled ?? true) }
  );
}
