import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import { useApiQuery } from '../query-core';

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

async function schedulerMutate(
  path: string,
  method: string,
  body?: unknown,
) {
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

export function useJobLogs(target: string | null) {
  return useApiQuery(
    ['scheduler', 'logs', target ?? ''],
    () => schedulerFetch<any[]>(`/jobs/${target}/logs`),
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

export function useRunJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: string) =>
      schedulerMutate(`/jobs/${target}/run`, 'POST'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
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
      openArtifact?: string;
      notifyStart?: boolean;
      trustAllTools?: boolean;
    }) => schedulerMutate('/jobs', 'POST', options),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useFetchRunOutput() {
  return useMutation({
    mutationFn: (outputPath: string) =>
      schedulerMutate('/runs/output', 'POST', { path: outputPath }),
  });
}

export function useOpenArtifact() {
  return useMutation({
    mutationFn: (path: string) => schedulerMutate('/open', 'POST', { path }),
  });
}
