import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  useApiMutation,
  useApiQuery,
} from '../query-core';
import { agentQueries } from '../queryFactories';
import { useTemplatesQuery as useWorkspaceTemplatesQuery } from './acpWorkspace';

export interface AgentTemplate {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  source?: string;
  form?: Record<string, unknown>;
}

export async function createAgent(
  agent: Record<string, unknown>,
): Promise<unknown> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  });
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to create agent');
  }
  return result.data;
}

export async function updateAgent(
  slug: string,
  agent: Record<string, unknown>,
): Promise<unknown> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(slug)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent),
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to update agent');
  }
  return result.data;
}

export async function deleteAgent(slug: string): Promise<unknown> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(slug)}`,
    {
      method: 'DELETE',
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to delete agent');
  }
  return result.data;
}

export async function submitToolApproval(
  approvalId: string,
  approved: boolean,
): Promise<{ success: boolean; error?: string }> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/tool-approval/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    },
  );
  return (await response.json()) as { success: boolean; error?: string };
}

export function useUserQuery(alias: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['user', alias],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/users/${encodeURIComponent(alias)}`,
      );
      const result = await response.json();
      if (result.error && !result.name) {
        throw new Error(result.error);
      }
      return result;
    },
    config,
  );
}

export function useAgentsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['agents'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/agents`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    config,
  );
}

export function useCreateAgentMutation(
  options?: MutationOptions<unknown, Record<string, unknown>>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agent: Record<string, unknown>) => createAgent(agent),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useUpdateAgentMutation(
  options?: MutationOptions<
    unknown,
    { slug: string; agent: Record<string, unknown> }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      agent,
    }: {
      slug: string;
      agent: Record<string, unknown>;
    }) => updateAgent(slug, agent),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', variables.slug] });
      queryClient.invalidateQueries({
        queryKey: ['agent-tools', variables.slug],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useDeleteAgentMutation(
  options?: MutationOptions<unknown, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => deleteAgent(slug),
    onSuccess: (data, slug) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', slug] });
      queryClient.invalidateQueries({ queryKey: ['agent-tools', slug] });
      options?.onSuccess?.(data, slug);
    },
    onError: (error, slug) => {
      options?.onError?.(error as Error, slug);
    },
  });
}

export function useAgentQuery(
  agentSlug: string | undefined,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...agentQueries.agent(agentSlug!),
    ...config,
    enabled: !!agentSlug && (config?.enabled ?? true),
  });
}

export function useAgentTemplatesQuery(config?: QueryConfig<AgentTemplate[]>) {
  return useWorkspaceTemplatesQuery<AgentTemplate>('agent', config);
}

export function useModelsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['models'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/bedrock/models`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    config,
  );
}

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

export function useConfigQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['config'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/config/app`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    config,
  );
}

export function useUpdateConfigMutation(
  options?: MutationOptions<Record<string, unknown>, Record<string, unknown>>,
) {
  return useApiMutation(
    async (config) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/config/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as Record<string, unknown>;
    },
    {
      invalidateKeys: [['config']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

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
