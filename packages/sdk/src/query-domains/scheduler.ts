import type { RunOutputRef, RunSummary } from '@stallion-ai/contracts/runs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import { type QueryConfig, useApiQuery } from '../query-core';

async function schedulerFetch<T>(path: string): Promise<T> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/scheduler${path}`);
  if (!response.ok) {
    throw new Error(`Scheduler API error: ${response.status}`);
  }
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown scheduler error');
  }
  return result.data;
}

async function schedulerMutate(path: string, method: string, body?: unknown) {
  const apiBase = await _getApiBase();
  const options: RequestInit = { method };
  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${apiBase}/scheduler${path}`, options);
  if (!response.ok) {
    throw new Error(`Scheduler API error: ${response.status}`);
  }
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown scheduler error');
  }
  return result.data;
}

async function runsFetch<T>(path = ''): Promise<T> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/runs${path}`);
  if (!response.ok) {
    throw new Error(`Runs API error: ${response.status}`);
  }
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown runs error');
  }
  return result.data;
}

export const runsQueries = {
  list: () => ({
    queryKey: ['runs'] as const,
    queryFn: () => runsFetch<RunSummary[]>(),
    staleTime: 30_000,
  }),
  detail: (runId: string) => ({
    queryKey: ['runs', runId] as const,
    queryFn: () => runsFetch<RunSummary>(`/${encodeURIComponent(runId)}`),
    staleTime: 30_000,
  }),
};

export function useSchedulerJobs() {
  return useApiQuery(
    ['scheduler', 'jobs'],
    () => schedulerFetch<any[]>('/jobs'),
    { staleTime: 30_000 },
  );
}

export function useSchedulerProviders() {
  return useApiQuery(
    ['scheduler', 'providers'],
    () => schedulerFetch<any[]>('/providers'),
    { staleTime: 60_000 },
  );
}

export function useSchedulerStats() {
  return useApiQuery(
    ['scheduler', 'stats'],
    () => schedulerFetch<any>('/stats'),
    { staleTime: 30_000 },
  );
}

export function useSchedulerStatus() {
  return useApiQuery(
    ['scheduler', 'status'],
    () => schedulerFetch<any>('/status'),
    { staleTime: 30_000 },
  );
}

export function useJobLogs(target: string | null, providerId?: string) {
  const providerQuery = providerId
    ? `?providerId=${encodeURIComponent(providerId)}`
    : '';
  return useApiQuery(
    ['scheduler', 'logs', target ?? '', providerId ?? ''],
    () => schedulerFetch<any[]>(`/jobs/${target}/logs${providerQuery}`),
    { staleTime: 30_000, enabled: !!target },
  );
}

export function usePreviewSchedule(cron: string | null) {
  return useApiQuery(
    ['scheduler', 'preview', cron ?? ''],
    () =>
      schedulerFetch<string[]>(
        `/jobs/preview-schedule?cron=${encodeURIComponent(cron!)}`,
      ),
    { staleTime: 60_000, enabled: !!cron && cron.trim().length > 0 },
  );
}

export function useRunsQuery(config?: QueryConfig<RunSummary[]>) {
  return useQuery({
    ...runsQueries.list(),
    ...config,
  });
}

export function useRunQuery(
  runId: string | null | undefined,
  config?: QueryConfig<RunSummary>,
) {
  return useQuery({
    ...runsQueries.detail(runId ?? ''),
    ...config,
    enabled: !!runId && (config?.enabled ?? true),
  });
}

export function useRunJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: string) =>
      schedulerMutate(`/jobs/${target}/run`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler'] });
      queryClient.invalidateQueries({ queryKey: runsQueries.list().queryKey });
    },
  });
}

export function useToggleJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ target, enabled }: { target: string; enabled: boolean }) =>
      schedulerMutate(
        `/jobs/${target}/${enabled ? 'enable' : 'disable'}`,
        'PUT',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: string) =>
      schedulerMutate(`/jobs/${target}`, 'DELETE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useEditJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      target,
      ...options
    }: {
      target: string;
      [key: string]: unknown;
    }) => schedulerMutate(`/jobs/${target}`, 'PUT', options),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useAddJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: {
      name: string;
      cron?: string;
      prompt?: string;
      agent?: string;
      provider?: string;
      notifyStart?: boolean;
      trustAllTools?: boolean;
    }) => schedulerMutate('/jobs', 'POST', options),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useFetchRunOutputRef() {
  return useMutation({
    mutationFn: async (outputRef: RunOutputRef) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/runs/output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outputRef),
      });
      if (!response.ok) {
        throw new Error(`Runs API error: ${response.status}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Unknown runs error');
      }
      return result.data;
    },
  });
}
