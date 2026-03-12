/**
 * Scheduler Service — multi-provider router.
 * Aggregates jobs/stats from all registered providers.
 * Routes CRUD to the provider that owns each job.
 */

import type {
  AddJobOpts,
  ISchedulerProvider,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '../providers/types.js';
import {
  schedulerJobDuration,
  schedulerJobRuns,
} from '../telemetry/metrics.js';
import {
  BuiltinScheduler,
  type ChatFn,
  nextCronTimes,
} from './builtin-scheduler.js';
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

  /** Wire the chat function once the runtime is ready */
  setChatFn(fn: ChatFn) {
    this.builtin.setChatFn(fn);
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
      } catch {
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
      } catch {
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

  async getRunOutput(target: string): Promise<string> {
    const p = await this.findJobProvider(target);
    return p.getRunOutput?.(target) ?? '';
  }

  async readRunFile(path: string): Promise<string> {
    // Try each provider
    for (const p of this.providers.values()) {
      try {
        if (p.readRunFile) return await p.readRunFile(path);
      } catch {
        /* not this provider */
      }
    }
    throw new Error('No provider could read this file');
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
