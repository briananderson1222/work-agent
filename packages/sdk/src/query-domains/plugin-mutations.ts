import type { InstallResult } from '@stallion-ai/contracts/catalog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase, addProjectLayoutFromPlugin } from '../api';
import type { MutationOptions } from '../query-core';

function invalidatePluginQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ['plugins'] });
  queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
}

function invalidatePluginGraphQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ['layouts'] });
  queryClient.invalidateQueries({ queryKey: ['agents'] });
  queryClient.invalidateQueries({ queryKey: ['projects'] });
}

export async function reloadPlugins(): Promise<{
  success: boolean;
  loaded?: number;
}> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/plugins/reload`, {
    method: 'POST',
  });
  const result = (await response.json()) as {
    success: boolean;
    loaded?: number;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to reload plugins');
  }
  return result;
}

export function usePluginInstallMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      source,
      skip,
    }: {
      source: string;
      skip?: string[];
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, skip }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Install failed');
      return result;
    },
    onSuccess: () => {
      invalidatePluginQueries(queryClient);
      invalidatePluginGraphQueries(queryClient);
    },
  });
}

export function usePluginPreviewMutation() {
  return useMutation({
    mutationFn: async (source: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/plugins/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      return response.json();
    },
  });
}

export function usePluginUpdateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}/update`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Update failed');
      return result;
    },
    onSuccess: () => {
      invalidatePluginQueries(queryClient);
    },
  });
}

export function usePluginRemoveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Remove failed');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function usePluginProviderToggleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginName,
      disabled,
    }: {
      pluginName: string;
      disabled: string[];
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled }),
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function usePluginSettingsMutation(
  options?: MutationOptions<
    { success: boolean },
    { name: string; settings: Record<string, unknown> }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    { success: boolean },
    Error,
    { name: string; settings: Record<string, unknown> }
  >({
    mutationFn: async ({ name, settings }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings }),
        },
      );
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!result.success) {
        throw new Error(result.error || 'Failed to save plugin settings');
      }
      return result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['plugin-settings', variables.name],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error, variables);
    },
  });
}

export function useReloadPluginsMutation(
  options?: MutationOptions<{ success: boolean; loaded?: number }, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => reloadPlugins(),
    onSuccess: (data) => {
      invalidatePluginQueries(queryClient);
      invalidatePluginGraphQueries(queryClient);
      options?.onSuccess?.(data, undefined);
    },
    onError: (error) => {
      options?.onError?.(error as Error, undefined);
    },
  });
}

export async function requestPluginRegistryInstallAction(
  id: string,
  action: 'install' | 'uninstall',
): Promise<InstallResult> {
  const apiBase = await _getApiBase();
  const response =
    action === 'install'
      ? await fetch(`${apiBase}/api/registry/plugins/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      : await fetch(
          `${apiBase}/api/registry/plugins/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
          },
        );
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || result.message || `${action} failed`);
  }
  return result as InstallResult;
}

export function usePluginRegistryInstallMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    InstallResult,
    Error,
    { id: string; action: 'install' | 'uninstall' }
  >({
    mutationFn: async ({ id, action }) =>
      requestPluginRegistryInstallAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry', 'plugins'] });
      queryClient.invalidateQueries({
        queryKey: ['registry', 'plugins', 'installed'],
      });
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useAddLayoutFromPluginMutation(projectSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plugin: string) =>
      addProjectLayoutFromPlugin(projectSlug, plugin),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectSlug, 'layouts'],
      });
    },
  });
}

export function useAddProjectLayoutFromPluginMutation(
  options?: MutationOptions<any, { projectSlug: string; plugin: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { projectSlug: string; plugin: string }>({
    mutationFn: async ({ projectSlug, plugin }) =>
      addProjectLayoutFromPlugin(projectSlug, plugin),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.projectSlug, 'layouts'],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error, variables);
    },
  });
}
