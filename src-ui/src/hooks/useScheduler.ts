/**
 * React hooks for the scheduler API
 */

import { useState, useEffect, useCallback } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

// --- Types matching the backend ---

export interface JobSchedule {
  type: 'cron' | 'interval';
  expression?: string;
  intervalMs?: number;
}

export interface AgentConversationAction {
  type: 'agent-conversation';
  agentSlug: string;
  message: string;
  conversationId?: string | null;
}

export interface ToolInvocationAction {
  type: 'tool-invocation';
  toolName: string;
  toolServer: string;
  parameters: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  type: 'agent-conversation' | 'tool-invocation';
  agentSlug?: string;
  message?: string;
  toolName?: string;
  toolServer?: string;
  parameters?: Record<string, unknown>;
  outputVariable?: string;
}

export interface WorkflowAction {
  type: 'workflow';
  steps: WorkflowStep[];
}

export type JobAction = AgentConversationAction | ToolInvocationAction | WorkflowAction;

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: JobSchedule;
  action: JobAction;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure' | 'running';
  lastRunError?: string;
  nextRunAt?: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  jobName: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failure';
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface UpcomingJob {
  jobId: string;
  jobName: string;
  nextRunAt: string;
  schedule: JobSchedule;
}

export interface CreateJobInput {
  name: string;
  description?: string;
  enabled?: boolean;
  schedule: JobSchedule;
  action: JobAction;
}

// --- Hooks ---

export function useScheduledJobs() {
  const { apiBase } = useApiBase();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/scheduler/jobs`);
      const data = await res.json();
      if (data.success) {
        setJobs(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchJobs, 30_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}

export function useSchedulerHistory(jobId?: string) {
  const { apiBase } = useApiBase();
  const [history, setHistory] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const url = jobId
        ? `${apiBase}/api/scheduler/history/${jobId}`
        : `${apiBase}/api/scheduler/history`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setHistory(data.data);
      }
    } catch {
      // Silently fail for history
    } finally {
      setLoading(false);
    }
  }, [apiBase, jobId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, refetch: fetchHistory };
}

export function useSchedulerUpcoming() {
  const { apiBase } = useApiBase();
  const [upcoming, setUpcoming] = useState<UpcomingJob[]>([]);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/scheduler/upcoming?limit=5`);
      const data = await res.json();
      if (data.success) {
        setUpcoming(data.data);
      }
    } catch {
      // Silently fail
    }
  }, [apiBase]);

  useEffect(() => {
    fetchUpcoming();
    const interval = setInterval(fetchUpcoming, 30_000);
    return () => clearInterval(interval);
  }, [fetchUpcoming]);

  return { upcoming, refetch: fetchUpcoming };
}

export function useSchedulerActions() {
  const { apiBase } = useApiBase();

  const createJob = useCallback(async (input: CreateJobInput): Promise<ScheduledJob> => {
    const res = await fetch(`${apiBase}/api/scheduler/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }, [apiBase]);

  const updateJob = useCallback(async (id: string, updates: Partial<CreateJobInput>): Promise<ScheduledJob> => {
    const res = await fetch(`${apiBase}/api/scheduler/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }, [apiBase]);

  const deleteJob = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${apiBase}/api/scheduler/jobs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  }, [apiBase]);

  const enableJob = useCallback(async (id: string): Promise<void> => {
    await fetch(`${apiBase}/api/scheduler/jobs/${id}/enable`, { method: 'POST' });
  }, [apiBase]);

  const disableJob = useCallback(async (id: string): Promise<void> => {
    await fetch(`${apiBase}/api/scheduler/jobs/${id}/disable`, { method: 'POST' });
  }, [apiBase]);

  const runJobNow = useCallback(async (id: string): Promise<JobExecution> => {
    const res = await fetch(`${apiBase}/api/scheduler/jobs/${id}/run`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }, [apiBase]);

  return { createJob, updateJob, deleteJob, enableJob, disableJob, runJobNow };
}
