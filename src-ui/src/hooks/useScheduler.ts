/**
 * Scheduler hooks — boo integration for Schedule view
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useToast } from '../contexts/ToastContext';

export type SchedulerEvent = {
  event: 'job.started' | 'job.completed' | 'job.failed';
  job: string;
  id?: string;
  success?: boolean;
  duration_secs?: number;
  artifact?: string | null;
  error?: string;
};

/** Subscribe to scheduler SSE events. Shows toasts and refreshes queries on events. */
export function useSchedulerEvents() {
  const { apiBase } = useApiBase();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const runningRef = useRef(new Set<string>());

  useEffect(() => {
    const es = new EventSource(`${apiBase}/scheduler/events`);
    es.onmessage = (e) => {
      if (!e.data) return;
      try {
        const evt: SchedulerEvent = JSON.parse(e.data);
        if (evt.event === 'job.started') {
          runningRef.current.add(evt.job);
          showToast(`🚀 Job '${evt.job}' started`);
        } else if (evt.event === 'job.completed') {
          runningRef.current.delete(evt.job);
          const dur = evt.duration_secs
            ? ` (${evt.duration_secs.toFixed(1)}s)`
            : '';
          showToast(`✓ Job '${evt.job}' completed${dur}`);
        } else if (evt.event === 'job.failed') {
          runningRef.current.delete(evt.job);
          showToast(
            `✗ Job '${evt.job}' failed: ${evt.error || 'unknown error'}`,
          );
        }
        qc.invalidateQueries({ queryKey: ['scheduler'] });
      } catch {
        /* ignore parse errors */
      }
    };
    return () => es.close();
  }, [apiBase, qc, showToast]);

  const isRunning = useCallback(
    (jobName: string) => runningRef.current.has(jobName),
    [],
  );
  return { isRunning, runningJobs: runningRef };
}

function useSchedulerFetch() {
  const { apiBase } = useApiBase();
  return {
    query: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${apiBase}/scheduler${path}`);
      if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Unknown scheduler error');
      return json.data;
    },
    mutate: async (path: string, method: string, body?: any): Promise<any> => {
      const opts: RequestInit = { method };
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(`${apiBase}/scheduler${path}`, opts);
      if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Unknown scheduler error');
      return json.data;
    },
  };
}

export function useSchedulerJobs() {
  const { query } = useSchedulerFetch();
  return useQuery({
    queryKey: ['scheduler', 'jobs'],
    queryFn: () => query<any[]>('/jobs'),
    staleTime: 30_000,
  });
}

export function useSchedulerStats() {
  const { query } = useSchedulerFetch();
  return useQuery({
    queryKey: ['scheduler', 'stats'],
    queryFn: () => query<any>('/stats'),
    staleTime: 30_000,
  });
}

export function useSchedulerStatus() {
  const { query } = useSchedulerFetch();
  return useQuery({
    queryKey: ['scheduler', 'status'],
    queryFn: () => query<any>('/status'),
    staleTime: 30_000,
  });
}

export function useJobLogs(target: string | null) {
  const { query } = useSchedulerFetch();
  return useQuery({
    queryKey: ['scheduler', 'logs', target],
    queryFn: () => query<any[]>(`/jobs/${target}/logs`),
    staleTime: 30_000,
    enabled: !!target,
  });
}

export function useFetchRunOutput() {
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: (outputPath: string) =>
      mutate('/runs/output', 'POST', { path: outputPath }),
  });
}

export function useRunJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: (target: string) => mutate(`/jobs/${target}/run`, 'POST'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useToggleJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: ({ target, enabled }: { target: string; enabled: boolean }) =>
      mutate(`/jobs/${target}/${enabled ? 'enable' : 'disable'}`, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: (target: string) => mutate(`/jobs/${target}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useAddJob() {
  const qc = useQueryClient();
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: (opts: {
      name: string;
      cron?: string;
      prompt: string;
      agent?: string;
      openArtifact?: string;
      notifyStart?: boolean;
    }) => mutate('/jobs', 'POST', opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler'] }),
  });
}

export function useOpenArtifact() {
  const { mutate } = useSchedulerFetch();
  return useMutation({
    mutationFn: (path: string) => mutate('/open', 'POST', { path }),
  });
}
