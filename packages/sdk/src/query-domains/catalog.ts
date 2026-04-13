import type {
  InstallResult,
  Playbook,
  PlaybookOutcome,
  RegistryItem,
} from '@stallion-ai/contracts/catalog';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import {
  type MutationOptions,
  type QueryConfig,
  useApiMutation,
  useApiQuery,
} from '../query-core';
import {
  fetchPlaybooks,
  fetchRegistryItems,
  requestIntegration,
  requestPlaybook,
  requestPlaybookOutcome,
  requestPlaybookRun,
  requestRegistryCatalogAction,
  requestRegistryIntegrationAction,
} from './catalogRequests';

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

interface RegistryActionInput {
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

export { requestPlaybookOutcome, requestPlaybookRun } from './catalogRequests';

export function usePlaybooksQuery(config?: QueryConfig<any>) {
  return useApiQuery(['playbooks'], () => fetchPlaybooks(), config);
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
    (input: IntegrationRegistryActionInput) =>
      requestRegistryIntegrationAction(input),
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

export function useRegistryAgentActionMutation(
  options?: MutationOptions<InstallResult, RegistryActionInput>,
) {
  return useApiMutation(
    (input: RegistryActionInput) =>
      requestRegistryCatalogAction('agents', input),
    {
      invalidateKeys: [
        ['registry', 'agents'],
        ['registry', 'agents', 'installed'],
        ['agents'],
      ],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}

export function useRegistrySkillActionMutation(
  options?: MutationOptions<InstallResult, RegistryActionInput>,
) {
  return useApiMutation(
    (input: RegistryActionInput) =>
      requestRegistryCatalogAction('skills', input),
    {
      invalidateKeys: [
        ['registry', 'skills'],
        ['registry', 'skills', 'installed'],
        ['skills'],
      ],
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    },
  );
}
