/**
 * Scheduler hooks — boo integration for Schedule view
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiBase } from '@stallion-ai/sdk';

function useSchedulerFetch() {
  const { apiBase } = useApiBase();
  return {
    query: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${apiBase}/scheduler${path}`);
      if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown scheduler error');
      return json.data;
    },
    mutate: async (path: string, method: string, body?: any): Promise<any> => {
      const opts: RequestInit = { method };
      if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
      const res = await fetch(`${apiBase}/scheduler${path}`, opts);
      if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown scheduler error');
      return json.data;
    },
  };
}

export function useSchedulerJobs() {
  const { query } = useSchedulerFetch();
  return useQuery({ queryKey: ['scheduler', 'jobs'], queryFn: () => query<any[]>('/jobs'), staleTime: 30_000 });
}

export function useSchedulerStats() {
  const { query } = useSchedulerFetch();
  return useQuery({ queryKey: ['scheduler', 'stats'], queryFn: () => query<any>('/stats'), staleTime: 30_000 });
}

export function useSchedulerStatus() {
  const { query } = useSchedulerFetch();
  return useQuery({ queryKey: ['scheduler', 'status'], queryFn: () => query<any>('/status'), staleTime: 30_000 });
}

export function useJobLogs(target: string | null) {
  const { query } = useSchedulerFetch();
  return useQuery({ queryKey: ['scheduler', 'logs', target], queryFn: () => query<any[]>(`/jobs/${target}/logs`), staleTime: 30_000, enabled: !!target });
}

export function useFetchRunOutput() {
  const { mutate } = useSchedulerFetch();
  return useMutation({ mutationFn: (outputPath: string) => mutate('/runs/output', 'POST', { path: outputPath }) });
}

export function useRunJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({ mutationFn: (target: string) => mutate(`/jobs/${target}/run`, 'POST'), onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }) });
}

export function useToggleJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: ({ target, enabled }: { target: string; enabled: boolean }) => mutate(`/jobs/${target}/${enabled ? 'enable' : 'disable'}`, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({ mutationFn: (target: string) => mutate(`/jobs/${target}`, 'DELETE'), onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }) });
}
