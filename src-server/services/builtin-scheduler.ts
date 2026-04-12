import type {
  AddJobOpts,
  SchedulerCapability,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '../providers/provider-contracts.js';
import type { ISchedulerProvider } from '../providers/provider-interfaces.js';
import { schedulerHealthy } from '../telemetry/metrics.js';
import {
  type StoredJob,
  getStoredJobStats,
  getStoredJobView,
  readSchedulerJobLogs,
  readSchedulerRunFile,
  readSchedulerRunOutput,
  readStoredJobs,
  writeStoredJobs,
} from './builtin-scheduler-storage.js';
import { executeSchedulerJobAttempt } from './builtin-scheduler-execution.js';
import { cronMatches, nextCronTimes } from './cron.js';
import type { NotificationService } from './notification-service.js';
import { SSEBroadcaster } from './sse-broadcaster.js';

export { nextCronTimes } from './cron.js';

// ── Provider ──

/** Function that invokes an agent and returns the response text */
export type ChatFn = (agentSlug: string, prompt: string) => Promise<string>;

export class BuiltinScheduler implements ISchedulerProvider {
  readonly id = 'built-in';
  readonly displayName = 'Built-in Scheduler';
  readonly capabilities: SchedulerCapability[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();
  private runningJobs = new Map<string, Promise<void>>();
  private missed = new Map<string, number>();
  private sse = new SSEBroadcaster();
  private chatFn: ChatFn | null = null;
  private notificationService: NotificationService | null = null;
  private lastTickAt = 0;

  /** Provide the chat function once the runtime is ready */
  setChatFn(fn: ChatFn) {
    this.chatFn = fn;
  }

  /** Provide the notification service for failure alerts */
  setNotificationService(ns: NotificationService) {
    this.notificationService = ns;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 60_000);
    this.watchdog = setInterval(() => this.checkHealth(), 120_000);
    schedulerHealthy.addCallback((obs) => {
      const age = this.lastTickAt ? Date.now() - this.lastTickAt : null;
      obs.observe(
        this.timer !== null && (age === null || age < 120_000) ? 1 : 0,
      );
    });
    this.tick();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    await Promise.all(this.runningJobs.values());
  }

  private trackJob(name: string): () => void {
    let resolve: () => void;
    const p = new Promise<void>((r) => {
      resolve = r;
    });
    this.runningJobs.set(name, p);
    return () => {
      this.runningJobs.delete(name);
      resolve!();
    };
  }

  private tick() {
    this.lastTickAt = Date.now();
    const now = new Date();
    for (const job of readStoredJobs()) {
      if (!job.enabled || !job.cron) continue;
      if (!cronMatches(job.cron, now)) continue;
      if (this.running.has(job.name)) {
        const count = (this.missed.get(job.name) || 0) + 1;
        this.missed.set(job.name, count);
        this.broadcast({
          event: 'job.missed',
          job: job.name,
          missedCount: count,
        });
        this.notificationService?.schedule('scheduler', {
          category: 'job-missed',
          title: `Job "${job.name}" missed schedule`,
          body: `Still running from previous execution (${count} missed)`,
          priority: 'normal',
          dedupeTag: `scheduler:miss:${job.name}`,
          actions: [{ id: 'view-job', label: 'View Job' }],
          metadata: {
            jobName: job.name,
            missedCount: count,
            link: `/schedule?job=${job.name}`,
          },
        });
        continue;
      }
      this.executeJob(job);
    }
  }

  private async executeJob(job: StoredJob, manual = false, attempt = 1) {
    const maxAttempts = (job.retryCount ?? 0) + 1;
    const done = this.trackJob(job.name);
    const id = `${job.name}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    this.running.add(job.name);
    this.broadcast({ event: 'job.started', job: job.name, id });

    try {
      if (!this.chatFn)
        throw new Error('Scheduler not connected to agent runtime');
      const result = await executeSchedulerJobAttempt({
        job,
        id,
        manual,
        attempt,
        maxAttempts,
        startedAt,
        chatFn: this.chatFn,
        notificationService: this.notificationService,
        broadcast: (event) => this.broadcast(event),
        getMissedCount: () => this.missed.get(job.name) || 0,
      });

      if (
        !result.success &&
        (job.retryCount ?? 0) > 0 &&
        attempt < maxAttempts
      ) {
        const delaySecs = job.retryDelaySecs ?? 0;
        setTimeout(
          () => this.executeJob(job, manual, attempt + 1),
          delaySecs * 1000,
        );
      }
    } finally {
      this.missed.delete(job.name);
      this.running.delete(job.name);
      done();
    }
  }

  private broadcast(event: Record<string, unknown>) {
    this.sse.broadcast(event);
  }

  private checkHealth() {
    if (!this.lastTickAt) return;
    const age = Date.now() - this.lastTickAt;
    if (age > 120_000) {
      this.notificationService?.schedule('scheduler', {
        category: 'scheduler-unhealthy',
        title: 'Scheduler heartbeat stale',
        body: `Last tick was ${Math.round(age / 1000)}s ago`,
        priority: 'high',
        dedupeTag: 'scheduler:heartbeat-stale',
        actions: [{ id: 'view-scheduler', label: 'View Scheduler' }],
        metadata: {
          lastTickAt: new Date(this.lastTickAt).toISOString(),
          link: '/schedule',
        },
      });
    }
  }

  // ── ISchedulerProvider ──

  async listJobs(): Promise<SchedulerJob[]> {
    return readStoredJobs().map((job) => ({
      ...getStoredJobView(job),
      provider: this.id,
    }));
  }

  async addJob(opts: AddJobOpts): Promise<string> {
    if (!opts.name?.trim()) throw new Error('Job name is required');
    if (!opts.prompt?.trim()) throw new Error('Job prompt is required');
    const jobs = readStoredJobs();
    if (jobs.some((j) => j.name === opts.name))
      throw new Error(`Job '${opts.name}' already exists`);
    jobs.push({
      name: opts.name,
      cron: opts.cron,
      prompt: opts.prompt,
      agent: opts.agent,
      openArtifact: opts.openArtifact,
      notifyStart: opts.notifyStart,
      retryCount: opts.retryCount,
      retryDelaySecs: opts.retryDelaySecs,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    writeStoredJobs(jobs);
    return `Job '${opts.name}' created`;
  }

  async editJob(
    target: string,
    opts: Record<string, string | boolean>,
  ): Promise<string> {
    const jobs = readStoredJobs();
    const job = jobs.find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    const PROTECTED = new Set(['name', 'createdAt']);
    for (const [k, v] of Object.entries(opts)) {
      if (PROTECTED.has(k)) continue;
      (job as any)[k] = v;
    }
    writeStoredJobs(jobs);
    return `Job '${target}' updated`;
  }

  async removeJob(target: string): Promise<void> {
    const jobs = readStoredJobs();
    if (!jobs.some((j) => j.name === target))
      throw new Error(`Job '${target}' not found`);
    writeStoredJobs(jobs.filter((j) => j.name !== target));
  }

  async runJob(target: string): Promise<string> {
    const job = readStoredJobs().find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    await this.executeJob(job, true);
    return `Job '${target}' completed`;
  }

  async enableJob(target: string): Promise<void> {
    await this.editJob(target, { enabled: true });
  }
  async disableJob(target: string): Promise<void> {
    await this.editJob(target, { enabled: false });
  }

  async getJobLogs(target: string, count = 20): Promise<SchedulerLogEntry[]> {
    return readSchedulerJobLogs(target, count);
  }

  async getRunOutput(target: string): Promise<string> {
    const logs = readSchedulerJobLogs(target);
    const last = logs[logs.length - 1];
    if (!last?.output) return '';
    return readSchedulerRunOutput(last.output);
  }

  async readRunFile(path: string): Promise<string> {
    return readSchedulerRunFile(path);
  }

  async getStats(): Promise<SchedulerProviderStats> {
    return getStoredJobStats();
  }

  async getStatus(): Promise<SchedulerProviderStatus> {
    const tickAge = this.lastTickAt ? Date.now() - this.lastTickAt : null;
    return {
      running: this.timer !== null,
      jobCount: readStoredJobs().length,
      lastTickAt: this.lastTickAt
        ? new Date(this.lastTickAt).toISOString()
        : null,
      healthy: this.timer !== null && (tickAge === null || tickAge < 120_000),
    };
  }

  async previewSchedule(cron: string, count = 5): Promise<string[]> {
    return nextCronTimes(cron, count).map((d) => d.toISOString());
  }

  subscribe(send: (data: string) => void): () => void {
    return this.sse.subscribe(send);
  }
}
