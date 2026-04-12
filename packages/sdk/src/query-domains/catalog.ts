import type {
  InstallResult,
  Playbook,
  PlaybookOutcome,
  RegistryItem,
} from '@stallion-ai/contracts/catalog';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import { _getApiBase } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  useApiMutation,
  useApiQuery,
} from '../query-core';

interface PlaybookMutationInput {
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
}

interface PlaybookImportResult {
  count: number;
  failed: number;
}

interface PlaybookOutcomeInput {
  id: string;
  outcome: PlaybookOutcome;
}

interface IntegrationRegistryActionInput {
  id: string;
  action: 'install' | 'uninstall';
}

export interface IntegrationViewModel extends ToolDef {
  source?: string;
  plugin?: string;
  usedBy?: string[];
  connected?: boolean;
}

export type RegistryCatalogTab =
  | 'agents'
  | 'skills'
  | 'integrations'
  | 'plugins';

async function fetchRegistryItems<T>(
  tab: RegistryCatalogTab,
  installed: boolean,
): Promise<T[]> {
  const apiBase = await _getApiBase();
  const suffix = installed ? '/installed' : '';
  const response = await fetch(`${apiBase}/api/registry/${tab}${suffix}`);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || `Failed to fetch ${tab} registry items`);
  }
  return (result.data || []) as T[];
}

async function requestPlaybook<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/playbooks${path}`, init);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Playbook request failed');
  }
  return result.data as T;
}

export async function requestPlaybookRun(id: string): Promise<Playbook> {
  return requestPlaybook<Playbook>(`/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  });
}

export async function requestPlaybookOutcome({
  id,
  outcome,
}: PlaybookOutcomeInput): Promise<Playbook> {
  return requestPlaybook<Playbook>(`/${encodeURIComponent(id)}/outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
}

async function requestIntegration<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/integrations${path}`, init);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Integration request failed');
  }
  return result.data as T;
}

export function usePlaybooksQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['playbooks'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/playbooks`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    config,
  );
}

/** @deprecated Use usePlaybooksQuery instead */
export function usePromptsQuery(config?: QueryConfig<any>) {
  return usePlaybooksQuery(config);
}

export function useRegistryItemsQuery<T = any>(
  tab: RegistryCatalogTab,
  config?: QueryConfig<T[]>,
) {
  return useApiQuery(
    ['registry', tab],
    () => fetchRegistryItems<T>(tab, false),
    {
      ...config,
    },
  );
}

export function useInstalledRegistryItemsQuery<T = any>(
  tab: RegistryCatalogTab,
  config?: QueryConfig<T[]>,
) {
  return useApiQuery(
    ['registry', tab, 'installed'],
    () => fetchRegistryItems<T>(tab, true),
    { ...config },
  );
}

export function useCreatePlaybookMutation(
  options?: MutationOptions<Playbook, PlaybookMutationInput>,
) {
  return useApiMutation(
    async (data: PlaybookMutationInput) =>
      requestPlaybook<Playbook>('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    {
      invalidateKeys: [['playbooks']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useUpdatePlaybookMutation(
  options?: MutationOptions<Playbook, { id: string } & PlaybookMutationInput>,
) {
  return useApiMutation(
    async ({ id, ...data }: { id: string } & PlaybookMutationInput) =>
      requestPlaybook<Playbook>(`/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    {
      invalidateKeys: [['playbooks']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useDeletePlaybookMutation(
  options?: MutationOptions<void, string>,
) {
  return useApiMutation(
    async (id: string) => {
      await requestPlaybook<void>(`/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    {
      invalidateKeys: [['playbooks']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useTrackPlaybookRunMutation(
  options?: MutationOptions<Playbook, string>,
) {
  return useApiMutation((id: string) => requestPlaybookRun(id), {
    invalidateKeys: [['playbooks']],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useRecordPlaybookOutcomeMutation(
  options?: MutationOptions<Playbook, PlaybookOutcomeInput>,
) {
  return useApiMutation(
    (input: PlaybookOutcomeInput) => requestPlaybookOutcome(input),
    {
      invalidateKeys: [['playbooks']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useImportPlaybooksMutation(
  options?: MutationOptions<
    PlaybookImportResult,
    Array<
      Pick<PlaybookMutationInput, 'name' | 'content'> & {
        description?: string;
      }
    >
  >,
) {
  return useApiMutation(
    async (
      items: Array<
        Pick<PlaybookMutationInput, 'name' | 'content'> & {
          description?: string;
        }
      >,
    ) => {
      const results = await Promise.allSettled(
        items.map((item) =>
          requestPlaybook<Playbook>('', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          }),
        ),
      );
      const count = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      const failed = results.length - count;
      if (failed > 0 && count === 0) {
        throw new Error('All imports failed');
      }
      return { count, failed };
    },
    {
      invalidateKeys: [['playbooks']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useIntegrationsQuery(
  config?: QueryConfig<IntegrationViewModel[]>,
) {
  return useApiQuery(
    ['integrations'],
    () => requestIntegration<IntegrationViewModel[]>(''),
    config,
  );
}

export function useIntegrationQuery(
  id: string | undefined,
  config?: QueryConfig<IntegrationViewModel>,
) {
  return useApiQuery(
    id ? ['integrations', id] : ['integrations'],
    () =>
      requestIntegration<IntegrationViewModel>(`/${encodeURIComponent(id!)}`),
    { ...config, enabled: !!id && (config?.enabled ?? true) },
  );
}

export function useSaveIntegrationMutation(
  options?: MutationOptions<void, IntegrationViewModel & { isNew: boolean }>,
) {
  return useApiMutation(
    async ({
      id,
      isNew,
      ...data
    }: IntegrationViewModel & { isNew: boolean }) => {
      await requestIntegration<void>(
        isNew ? '' : `/${encodeURIComponent(id)}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isNew ? { id, ...data } : data),
        },
      );
    },
    {
      invalidateKeys: [['integrations']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useDeleteIntegrationMutation(
  options?: MutationOptions<void, string>,
) {
  return useApiMutation(
    async (id: string) => {
      await requestIntegration<void>(`/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    {
      invalidateKeys: [['integrations']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useReconnectIntegrationMutation(
  options?: MutationOptions<void, string>,
) {
  return useApiMutation(
    async (id: string) => {
      await requestIntegration<void>(`/${encodeURIComponent(id)}/reconnect`, {
        method: 'POST',
      });
    },
    {
      invalidateKeys: [['integrations']],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useRegistryIntegrationsQuery(
  config?: QueryConfig<RegistryItem[]>,
) {
  return useRegistryItemsQuery<RegistryItem>('integrations', config);
}

export function useRegistryIntegrationActionMutation(
  options?: MutationOptions<InstallResult, IntegrationRegistryActionInput>,
) {
  return useApiMutation(
    async ({ id, action }: IntegrationRegistryActionInput) => {
      const apiBase = await _getApiBase();
      const response =
        action === 'install'
          ? await fetch(`${apiBase}/api/registry/integrations/install`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            })
          : await fetch(
              `${apiBase}/api/registry/integrations/${encodeURIComponent(id)}`,
              { method: 'DELETE' },
            );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || result.message || `${action} failed`);
      }
      return result as InstallResult;
    },
    {
      invalidateKeys: [
        ['registry', 'integrations'],
        ['registry', 'integrations', 'installed'],
        ['integrations'],
      ],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}
