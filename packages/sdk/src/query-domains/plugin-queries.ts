import { _getApiBase } from '../api';
import type { QueryConfig } from '../query-core';
import { useApiQuery } from '../query-core';
import type {
  AgentHealthStatus,
  PluginChangelogData,
  PluginProviderDetail,
  PluginSettingsData,
} from './plugin-types';

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
