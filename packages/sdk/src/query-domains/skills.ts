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

export function useCreateLocalSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      body: string;
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/skills/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.message || 'Create failed');
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useUpdateLocalSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      ...updates
    }: {
      name: string;
      body?: string;
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/skills/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.message || 'Update failed');
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });
}

export function useConvertSkillToPlaybookMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      playbookName,
    }: {
      name: string;
      playbookName?: string;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/skills/${encodeURIComponent(name)}/convert-to-playbook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(playbookName ? { name: playbookName } : {}),
        },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.message || 'Conversion failed');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
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

export function useSkillQuery(
  name: string | undefined,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['skills', 'detail', name ?? ''],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/skills/${name}`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load skill');
      }
      return result.data;
    },
    { ...config, enabled: !!name && (config?.enabled ?? true) },
  );
}
