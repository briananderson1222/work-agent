import type {
  InstallResult,
  Playbook,
  PlaybookOutcome,
} from '@stallion-ai/contracts/catalog';
import { _getApiBase } from '../api';
import type { RegistryCatalogTab } from './catalog';

type CatalogResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

async function fetchCatalogResponse<T>(
  path: string,
  init?: RequestInit,
): Promise<CatalogResponse<T>> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}${path}`, init);
  return (await response.json()) as CatalogResponse<T>;
}

async function requestCatalog<T>(
  path: string,
  init?: RequestInit,
  fallbackError?: string,
): Promise<T> {
  const result = await fetchCatalogResponse<T>(path, init);
  if (!result.success) {
    throw new Error(result.error || fallbackError);
  }
  return result.data as T;
}

export async function fetchPlaybooks(): Promise<Playbook[]> {
  const result = await fetchCatalogResponse<Playbook[]>('/api/playbooks');
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data as Playbook[];
}

export async function requestPlaybookRun(id: string): Promise<Playbook> {
  return requestCatalog<Playbook>(
    `/api/playbooks/${encodeURIComponent(id)}/run`,
    {
      method: 'POST',
    },
  );
}

export async function requestPlaybookOutcome({
  id,
  outcome,
}: {
  id: string;
  outcome: PlaybookOutcome;
}): Promise<Playbook> {
  return requestCatalog<Playbook>(
    `/api/playbooks/${encodeURIComponent(id)}/outcome`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    },
  );
}

export async function fetchRegistryItems<T>(
  tab: RegistryCatalogTab,
  installed: boolean,
): Promise<T[]> {
  const suffix = installed ? '/installed' : '';
  const result = await fetchCatalogResponse<T[]>(
    `/api/registry/${tab}${suffix}`,
  );
  if (!result.success) {
    throw new Error(result.error || `Failed to fetch ${tab} registry items`);
  }
  return (result.data || []) as T[];
}

export async function requestPlaybook<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestCatalog<T>(
    `/api/playbooks${path}`,
    init,
    'Playbook request failed',
  );
}

export async function requestIntegration<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestCatalog<T>(
    `/integrations${path}`,
    init,
    'Integration request failed',
  );
}

export async function requestRegistryIntegrationAction({
  id,
  action,
}: {
  id: string;
  action: 'install' | 'uninstall';
}): Promise<InstallResult> {
  return requestRegistryCatalogAction('integrations', { id, action });
}

export async function requestRegistryCatalogAction(
  tab: RegistryCatalogTab,
  {
    id,
    action,
  }: {
    id: string;
    action: 'install' | 'uninstall';
  },
): Promise<InstallResult> {
  const apiBase = await _getApiBase();
  const response =
    action === 'install'
      ? await fetch(`${apiBase}/api/registry/${tab}/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      : await fetch(
          `${apiBase}/api/registry/${tab}/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        );
  const result = (await response.json()) as InstallResult & {
    error?: string;
    message?: string;
  };
  if (!result.success) {
    throw new Error(result.error || result.message || `${action} failed`);
  }
  return result as InstallResult;
}
