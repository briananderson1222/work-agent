/**
 * Scheduler hooks — integration for Schedule view
 *
 * Query/mutation hooks are re-exported from @stallion-ai/sdk.
 * SSE event handling stays local (UI-specific: toast, navigation).
 */

import type {
  SchedulerEvent,
  SchedulerFormField,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '@stallion-ai/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';

export type { SchedulerEvent } from '@stallion-ai/shared';

// Re-export SDK hooks so existing imports from '../hooks/useScheduler' keep working
export {
  useAddJob,
  useDeleteJob,
  useEditJob,
  useFetchRunOutput,
  useJobLogs,
  useOpenArtifact,
  usePreviewSchedule,
  useRunJob,
  useSchedulerJobs,
  useSchedulerProviders,
  useSchedulerStats,
  useSchedulerStatus,
  useToggleJob,
} from '@stallion-ai/sdk';

/** Aggregated stats shape returned by GET /scheduler/stats */
export interface SchedulerStatsResponse {
  providers: Record<string, SchedulerProviderStats>;
  summary: { totalJobs: number; totalRuns: number; successRate: number };
}

/** Aggregated status shape returned by GET /scheduler/status */
export interface SchedulerStatusResponse {
  providers: Record<string, SchedulerProviderStatus & { id: string; displayName: string }>;
}

/** Provider info returned by GET /scheduler/providers */
export interface SchedulerProviderInfo {
  id: string;
  displayName: string;
  capabilities: string[];
  formFields?: SchedulerFormField[];
}

/** Subscribe to scheduler SSE events with exponential backoff reconnection. */
export function useSchedulerEvents(enabled = true) {
  const { apiBase } = useApiBase();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { navigate } = useNavigation();
  const runningRef = useRef(new Set<string>());
  const timeoutRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const recentErrorRef = useRef(new Set<string>());
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let closed = false;

    const clearRunTimeout = (job: string) => {
      const t = timeoutRef.current.get(job);
      if (t) { clearTimeout(t); timeoutRef.current.delete(job); }
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${apiBase}/scheduler/events`);

      es.onopen = () => { backoffRef.current = 1000; };

      es.onmessage = (e) => {
        if (!e.data) return;
        try {
          const evt: SchedulerEvent = JSON.parse(e.data);
          if (evt.event === 'job.started') {
            runningRef.current.add(evt.job);
            clearRunTimeout(evt.job);
            timeoutRef.current.set(evt.job, setTimeout(() => {
              runningRef.current.delete(evt.job);
              timeoutRef.current.delete(evt.job);
              qc.invalidateQueries({ queryKey: ['scheduler'] });
            }, 5 * 60_000));
            showToast(`🚀 Job '${evt.job}' started`);
          } else if (evt.event === 'job.completed') {
            runningRef.current.delete(evt.job);
            clearRunTimeout(evt.job);
            const dur = evt.duration_secs ? ` (${evt.duration_secs.toFixed(1)}s)` : '';
            showToast(`✓ Job '${evt.job}' completed${dur}`, undefined, 8000, [
              { label: 'View Output', onClick: () => navigate('/schedule', { job: evt.job, run: evt.id || null }), variant: 'primary' },
            ]);
          } else if (evt.event === 'job.failed') {
            runningRef.current.delete(evt.job);
            clearRunTimeout(evt.job);
            if (!recentErrorRef.current.has(evt.job)) {
              showToast(`✗ Job '${evt.job}' failed: ${evt.error || 'unknown error'}`, undefined, 8000, [
                { label: 'View Output', onClick: () => navigate('/schedule', { job: evt.job, run: evt.id || null }), variant: 'secondary' },
              ]);
            }
            recentErrorRef.current.delete(evt.job);
          }
          qc.invalidateQueries({ queryKey: ['scheduler'] });
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es?.close();
        if (closed) return;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 30_000);
        retryRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      es?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
      for (const t of timeoutRef.current.values()) clearTimeout(t);
      timeoutRef.current.clear();
    };
  }, [apiBase, qc, showToast, navigate, enabled]);

  const isRunning = useCallback(
    (jobName: string) => runningRef.current.has(jobName),
    [],
  );

  const markErrorShown = useCallback((name: string) => {
    recentErrorRef.current.add(name);
    setTimeout(() => recentErrorRef.current.delete(name), 10_000);
  }, []);

  return { isRunning, runningJobs: runningRef, markErrorShown };
}
