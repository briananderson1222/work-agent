import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import { type MutationOptions, type QueryConfig, useApiQuery } from '../query-core';

export interface GlobalKnowledgeStatus {
  vectorDb: { id: string; name: string; type: string; enabled: boolean } | null;
  embedding: {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
  } | null;
  stats: { totalDocuments: number; totalChunks: number; projectCount: number };
}

export interface ConnectionMutationInput {
  connection: ConnectionConfig;
  isNew?: boolean;
}

export interface ConnectionTestResult {
  healthy: boolean;
  status?: ConnectionConfig['status'];
}

export function useConnectionsQuery(config?: QueryConfig<ConnectionConfig[]>) {
  return useApiQuery(
    ['connections'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/connections`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as ConnectionConfig[];
    },
    config,
  );
}

export function useModelConnectionsQuery(
  config?: QueryConfig<ConnectionConfig[]>,
) {
  return useApiQuery(
    ['connections', 'models'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/connections/models`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as ConnectionConfig[];
    },
    config,
  );
}

export function useRuntimeConnectionsQuery(
  config?: QueryConfig<ConnectionConfig[]>,
) {
  return useApiQuery(
    ['connections', 'runtimes'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/connections/runtimes`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as ConnectionConfig[];
    },
    config,
  );
}

export function useConnectionQuery(
  id: string | undefined,
  config?: QueryConfig<ConnectionConfig | null>,
) {
  return useApiQuery(
    ['connections', id ?? ''],
    async () => {
      if (!id) {
        return null;
      }
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(id)}`,
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load connection');
      }
      return result.data as ConnectionConfig;
    },
    { ...config, enabled: !!id && (config?.enabled ?? true) },
  );
}

export function useSaveConnectionMutation(
  options?: MutationOptions<ConnectionConfig, ConnectionMutationInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ connection, isNew }: ConnectionMutationInput) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        isNew
          ? `${apiBase}/api/connections`
          : `${apiBase}/api/connections/${encodeURIComponent(connection.id)}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(connection),
        },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save connection');
      }
      return result.data as ConnectionConfig;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['connections', data.id] });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useDeleteConnectionMutation(
  options?: MutationOptions<void, string>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete connection');
      }
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.removeQueries({ queryKey: ['connections', id] });
      options?.onSuccess?.(undefined, id);
    },
    onError: (error, id) => {
      options?.onError?.(error as Error, id);
    },
  });
}

export function useTestConnectionMutation(
  options?: MutationOptions<ConnectionTestResult, string>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(id)}/test`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Connection test failed');
      }
      return result.data as ConnectionTestResult;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['connections', id] });
      options?.onSuccess?.(data, id);
    },
    onError: (error, id) => {
      options?.onError?.(error as Error, id);
    },
  });
}

export function useGlobalKnowledgeStatusQuery(
  config?: QueryConfig<GlobalKnowledgeStatus | null>,
) {
  return useApiQuery(
    ['knowledge-status-global'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/knowledge/status`);
      const result = await response.json();
      if (!result.success) {
        return null;
      }
      return result.data as GlobalKnowledgeStatus;
    },
    config,
  );
}

export function useTestVectorDbConnectionMutation(
  options?: MutationOptions<{ healthy: boolean }, string>,
) {
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/providers/${encodeURIComponent(id)}/test-vectordb`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Vector database test failed');
      }
      return result.data as { healthy: boolean };
    },
    onSuccess: (data, id) => {
      options?.onSuccess?.(data, id);
    },
    onError: (error, id) => {
      options?.onError?.(error as Error, id);
    },
  });
}
