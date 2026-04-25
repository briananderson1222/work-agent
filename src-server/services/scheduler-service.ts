/**
 * Scheduler Service — multi-provider router.
 * Aggregates jobs/stats from all registered providers.
 * Routes CRUD to the provider that owns each job.
 */

import type { RunOutputRef, RunSummary } from '@stallion-ai/contracts/runs';
import type {
  AddJobOpts,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '../providers/provider-contracts.js';
import type { ISchedulerProvider } from '../providers/provider-interfaces.js';
import {
  schedulerJobDuration,
  schedulerJobRuns,
} from '../telemetry/metrics.js';
import {
  BuiltinScheduler,
  type ChatFn,
  nextCronTimes,
} from './builtin-scheduler.js';
import type { NotificationService } from './notification-service.js';
import {
  parseScheduleRunId,
  projectSchedulerLogToRun,
} from './run-projection.js';
import { SSEBroadcaster } from './sse-broadcaster.js';

export class SchedulerService {
  private providers = new Map<string, ISchedulerProvider>();
  private sse = new SSEBroadcaster();
  private builtin: BuiltinScheduler;

  constructor(_logger: any) {
    this.builtin = new BuiltinScheduler();
    this.builtin.start();
    this.providers.set(this.builtin.id, this.builtin);
  }

  async stop(): Promise<void> {
    await this.builtin.stop();
  }

  /** Wire the chat function once the runtime is ready */
  setChatFn(fn: ChatFn) {
    this.builtin.setChatFn(fn);
  }

  /** Wire the notification service for failure alerts */
  setNotificationService(ns: NotificationService) {
    this.builtin.setNotificationService(ns);
  }

  /** Register an additional scheduler provider (from plugin) */
  addProvider(provider: ISchedulerProvider) {
    this.providers.set(provider.id, provider);
  }

  /** List registered providers (for UI dropdown) */
  listProviders(): Array<{
    id: string;
    displayName: string;
    capabilities: string[];
    formFields?: any[];
  }> {
    return [...this.providers.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
      capabilities: [...p.capabilities],
      formFields: p.getFormFields?.() ?? [],
    }));
  }

  private getProvider(id: string): ISchedulerProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Scheduler provider '${id}' not found`);
    return p;
  }

  private async findJobProvider(name: string): Promise<ISchedulerProvider> {
    for (const p of this.providers.values()) {
      const jobs = await p.listJobs();
      if (jobs.some((j) => j.name === name)) return p;
    }
    throw new Error(`Job '${name}' not found in any provider`);
  }

  // ── Aggregated reads ──

  async listJobs(): Promise<SchedulerJob[]> {
    const all = await Promise.all(
      [...this.providers.values()].map((p) => p.listJobs().catch(() => [])),
    );
    return all.flat();
  }

  async getStats(): Promise<{
    providers: Record<string, SchedulerProviderStats>;
    summary: { totalJobs: number; totalRuns: number; successRate: number };
  }> {
    const providers: Record<string, SchedulerProviderStats> = {};
    let totalJobs = 0,
      totalRuns = 0,
      totalSuccesses = 0;
    for (const p of this.providers.values()) {
      try {
        const s = await p.getStats();
        providers[p.id] = s;
        for (const j of s.jobs) {
          totalJobs++;
          totalRuns += j.total;
          totalSuccesses += j.successes;
        }
      } catch (e) {
        console.debug('Failed to get stats from scheduler provider:', p.id, e);
        /* provider unavailable */
      }
    }
    return {
      providers,
      summary: {
        totalJobs,
        totalRuns,
        successRate: totalRuns
          ? Math.round((totalSuccesses / totalRuns) * 100)
          : 0,
      },
    };
  }

  async getStatus(): Promise<{
    providers: Record<
      string,
      SchedulerProviderStatus & { id: string; displayName: string }
    >;
  }> {
    const providers: Record<
      string,
      SchedulerProviderStatus & { id: string; displayName: string }
    > = {};
    for (const p of this.providers.values()) {
      try {
        const s = await p.getStatus();
        providers[p.id] = { ...s, id: p.id, displayName: p.displayName };
      } catch (e) {
        console.debug('Failed to get status from scheduler provider:', p.id, e);
        /* provider unavailable */
      }
    }
    return { providers };
  }

  // ── Routed writes ──

  async addJob(opts: AddJobOpts): Promise<string> {
    const providerId = opts.provider || this.builtin.id;
    return this.getProvider(providerId).addJob(opts);
  }

  async editJob(
    target: string,
    opts: Record<string, string | boolean>,
  ): Promise<string> {
    const p = await this.findJobProvider(target);
    return p.editJob(target, opts);
  }

  async removeJob(target: string): Promise<void> {
    const p = await this.findJobProvider(target);
    return p.removeJob(target);
  }

  async runJob(target: string): Promise<string> {
    const p = await this.findJobProvider(target);
    const start = Date.now();
    try {
      const result = await p.runJob(target);
      schedulerJobRuns.add(1, { job: target, status: 'success' });
      schedulerJobDuration.record(Date.now() - start, { job: target });
      return result;
    } catch (e) {
      schedulerJobRuns.add(1, { job: target, status: 'error' });
      schedulerJobDuration.record(Date.now() - start, { job: target });
      throw e;
    }
  }

  async enableJob(target: string): Promise<void> {
    const p = await this.findJobProvider(target);
    return p.enableJob(target);
  }

  async disableJob(target: string): Promise<void> {
    const p = await this.findJobProvider(target);
    return p.disableJob(target);
  }

  async getJobLogs(
    target: string,
    count?: number,
  ): Promise<SchedulerLogEntry[]> {
    const p = await this.findJobProvider(target);
    return p.getJobLogs(target, count);
  }

  async getJobLogsForProvider(
    providerId: string,
    target: string,
    count?: number,
  ): Promise<SchedulerLogEntry[]> {
    return this.getProvider(providerId).getJobLogs(target, count);
  }

  async listRunSummaries(filters?: {
    providerId?: string;
    sourceId?: string;
  }): Promise<RunSummary[]> {
    const providers = filters?.providerId
      ? [this.getProvider(filters.providerId)]
      : [...this.providers.values()];

    const runs = (
      await Promise.all(
        providers.map(async (provider) => {
          const jobs = await provider.listJobs().catch(() => []);
          const matchingJobs = filters?.sourceId
            ? jobs.filter((job) => job.name === filters.sourceId)
            : jobs;
          const jobRuns = await Promise.all(
            matchingJobs.map(async (job) => {
              const logs = await provider.getJobLogs(job.name).catch(() => []);
              return logs.map((log) =>
                projectSchedulerLogToRun(provider.id, log),
              );
            }),
          );
          return jobRuns.flat();
        }),
      )
    ).flat();

    return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async readRunSummary(runId: string): Promise<RunSummary | null> {
    const parsed = parseScheduleRunId(runId);
    if (!parsed) return null;
    const logs = await this.getJobLogsForProvider(
      parsed.providerId,
      parsed.jobName,
    ).catch(() => []);
    const log = logs.find((entry) => entry.id === parsed.logId);
    return log ? projectSchedulerLogToRun(parsed.providerId, log) : null;
  }

  async readOutputRef(ref: RunOutputRef): Promise<string> {
    if (ref.source !== 'schedule') {
      throw new Error(`Unsupported run output source '${ref.source}'`);
    }
    const parsed = parseScheduleRunId(ref.runId);
    if (!parsed || parsed.providerId !== ref.providerId) {
      throw new Error('Invalid schedule run output reference');
    }
    const run = await this.readRunSummary(ref.runId);
    if (!run?.outputRef || run.outputRef.artifactId !== ref.artifactId) {
      throw new Error('Run output reference not found');
    }
    const parsedRun = parseScheduleRunId(ref.runId);
    if (!parsedRun) {
      throw new Error('Invalid schedule run output reference');
    }
    const logs = await this.getJobLogsForProvider(
      parsedRun.providerId,
      parsedRun.jobName,
    );
    const log = logs.find((entry) => entry.id === parsedRun.logId);
    if (!log?.output) {
      throw new Error('Run output not found');
    }
    const provider = this.getProvider(ref.providerId);
    if (!provider.readRunFile) {
      throw new Error(
        `Scheduler provider '${ref.providerId}' cannot read run output`,
      );
    }
    return provider.readRunFile(log.output);
  }

  async previewSchedule(cron: string, count = 5): Promise<string[]> {
    return nextCronTimes(cron, count).map((d) => d.toISOString());
  }

  // ── SSE ──

  subscribe(send: (data: string) => void): () => void {
    const localUnsub = this.sse.subscribe(send);
    const unsubs = [...this.providers.values()]
      .map((p) => p.subscribe?.(send))
      .filter(Boolean) as (() => void)[];
    return () => {
      localUnsub();
      unsubs.forEach((u) => u());
    };
  }

  broadcast(event: Record<string, unknown>) {
    this.sse.broadcast(event);
  }
}
