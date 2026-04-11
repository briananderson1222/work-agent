import type { InstallResult } from '@stallion-ai/contracts/catalog';
import type { PluginSettingField } from '@stallion-ai/contracts/plugin';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase, addProjectLayoutFromPlugin } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  useApiQuery,
} from '../query-core';

export type { PluginSettingField } from '@stallion-ai/contracts/plugin';

export interface PluginSettingsData {
  schema: PluginSettingField[];
  values: Record<string, unknown>;
}

export interface PluginChangelogEntry {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}

export interface PluginChangelogData {
  entries: PluginChangelogEntry[];
  source: 'git' | 'local';
  changelog?: string | null;
  error?: string;
}

export interface PluginProviderDetail {
  type: string;
  module: string;
  layout: string | null;
  enabled: boolean;
}

export interface AgentHealthStatus {
  success: boolean;
  healthy: boolean;
  error?: string;
  checks?: Record<string, boolean>;
  status?: string;
}

async function requestPluginSettings(
  name: string,
): Promise<PluginSettingsData> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/api/plugins/${encodeURIComponent(name)}/settings`,
  );
  const result = (await response.json()) as PluginSettingsData & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch plugin settings');
  }
  return result;
}

async function requestPluginChangelog(
  name: string,
): Promise<PluginChangelogData> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/api/plugins/${encodeURIComponent(name)}/changelog`,
  );
  const result = (await response.json()) as PluginChangelogData & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch plugin changelog');
  }
  return result;
}

async function requestPluginProviders(
  name: string,
): Promise<PluginProviderDetail[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/api/plugins/${encodeURIComponent(name)}/providers`,
  );
  const result = (await response.json()) as {
    providers?: PluginProviderDetail[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch plugin providers');
  }
  return result.providers || [];
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

export async function requestAgentHealth(
  slug: string,
): Promise<AgentHealthStatus> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(slug)}/health`,
  );
  const result = (await response.json()) as AgentHealthStatus;
  if (!response.ok || result.success === false) {
    throw new Error(result.error || 'Failed to fetch agent health');
  }
  return result;
}

export async function waitForAgentHealth(
  slug: string,
  options?: { attempts?: number; intervalMs?: number },
): Promise<AgentHealthStatus | null> {
  const attempts = options?.attempts ?? 15;
  const intervalMs = options?.intervalMs ?? 2_000;

  for (let index = 0; index < attempts; index += 1) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    try {
      const health = await requestAgentHealth(slug);
      if (health.healthy) {
        return health;
      }
    } catch {
      // Ignore transient agent boot errors while polling for readiness.
    }
  }

  return null;
}

export function usePluginsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['plugins'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/plugins`);
      const result = await response.json();
      return result.plugins || [];
    },
    config,
  );
}

export function usePluginUpdatesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['plugin-updates'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/plugins/check-updates`);
      if (!response.ok) return [];
      const result = await response.json();
      return result.updates || [];
    },
    config,
  );
}

export function usePluginSettingsQuery(
  name: string | undefined,
  config?: QueryConfig<PluginSettingsData>,
) {
  return useApiQuery(
    ['plugin-settings', name ?? 'unknown'],
    () => requestPluginSettings(name!),
    { ...config, enabled: !!name && (config?.enabled ?? true) },
  );
}

export function usePluginChangelogQuery(
  name: string | undefined,
  config?: QueryConfig<PluginChangelogData>,
) {
  return useApiQuery(
    ['plugin-changelog', name ?? 'unknown'],
    () => requestPluginChangelog(name!),
    { ...config, enabled: !!name && (config?.enabled ?? true) },
  );
}

export function usePluginProvidersQuery(
  name: string | undefined,
  config?: QueryConfig<PluginProviderDetail[]>,
) {
  return useApiQuery(
    ['plugin-providers', name ?? 'unknown'],
    () => requestPluginProviders(name!),
    { ...config, enabled: !!name && (config?.enabled ?? true) },
  );
}

export function useRegistryPluginsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['registry-plugins'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/registry/plugins`);
      const result = await response.json();
      return result.success ? result.data || [] : [];
    },
    config,
  );
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
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
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
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      options?.onSuccess?.(data, undefined);
    },
    onError: (error) => {
      options?.onError?.(error as Error, undefined);
    },
  });
}

export function usePluginRegistryInstallMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    InstallResult,
    Error,
    { id: string; action: 'install' | 'uninstall' }
  >({
    mutationFn: async ({ id, action }) => {
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
              { method: 'DELETE' },
            );
      const result = await response.json();
      if (!result.success) throw new Error(result.error || `${action} failed`);
      return result as InstallResult;
    },
    onSuccess: () => {
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
