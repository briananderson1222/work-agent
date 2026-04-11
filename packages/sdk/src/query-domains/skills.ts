import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import { type QueryConfig, useApiQuery } from '../query-core';

export function useSkillsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['skills', 'local'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/system/skills`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data ?? [];
    },
    config,
  );
}

export function useRegistrySkillsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['skills', 'registry'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/registry/skills`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data ?? [];
    },
    config,
  );
}

export function useInstallSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/registry/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Install failed');
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useUninstallSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/registry/skills/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Uninstall failed');
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useUpdateSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/registry/skills/${id}/update`,
        {
          method: 'POST',
        },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Update failed');
      }
      return result;
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
      const response = await fetch(
        `${apiBase}/api/registry/skills/${id}/content`,
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as string;
    },
    { ...config, enabled: !!id && (config?.enabled ?? true) },
  );
}
