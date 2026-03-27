/**
 * Built-in lightweight scheduler — no external dependencies.
 * In-process cron matching, JSON file persistence, calls local agent chat API for runs.
 */

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AddJobOpts,
  ISchedulerProvider,
  SchedulerCapability,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '../providers/types.js';
import {
  schedulerHealthy,
  schedulerJobDuration,
  schedulerJobRuns,
} from '../telemetry/metrics.js';
import { resolveHomeDir } from '../utils/paths.js';
import { cronMatches, nextCronTimes } from './cron.js';
import { JsonFileStore } from './json-store.js';
import type { NotificationService } from './notification-service.js';
import { SSEBroadcaster } from './sse-broadcaster.js';

export { nextCronTimes } from './cron.js';

const DATA_DIR = join(resolveHomeDir(), 'scheduler');
const JOBS_FILE = join(DATA_DIR, 'jobs.json');
const LOGS_DIR = join(DATA_DIR, 'logs');

interface StoredJob {
  name: string;
  cron?: string;
  prompt: string;
  agent?: string;
  enabled: boolean;
  openArtifact?: string;
  notifyStart?: boolean;
  retryCount?: number;
  retryDelaySecs?: number;
  createdAt: string;
}

const jobStore = new JsonFileStore<StoredJob[]>(JOBS_FILE, []);

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
    for (const job of jobStore.read()) {
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

    const outFile = join(LOGS_DIR, `${id}.log`);
    const logStore = new JsonFileStore<SchedulerLogEntry[]>(
      join(LOGS_DIR, `${job.name}.json`),
      [],
    );

    try {
      if (!this.chatFn)
        throw new Error('Scheduler not connected to agent runtime');
      const agent =
        job.agent && job.agent !== 'default' ? job.agent : 'default';
      const JOB_TIMEOUT = 10 * 60_000;
      const output = await Promise.race([
        this.chatFn(agent, job.prompt),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Job timed out after ${JOB_TIMEOUT / 60_000}m`)),
            JOB_TIMEOUT,
          ),
        ),
      ]);

      writeFileSync(outFile, output);
      const completedAt = new Date().toISOString();
      const durationSecs =
        (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;

      schedulerJobRuns.add(1, { job: job.name, status: 'success' });
      schedulerJobDuration.record(durationSecs * 1000, { job: job.name });
      logStore.append({
        id,
        job: job.name,
        startedAt,
        completedAt,
        success: true,
        durationSecs,
        missedCount: this.missed.get(job.name) || 0,
        manual,
        output: outFile,
        attempt,
        maxAttempts,
      });
      this.broadcast({
        event: 'job.completed',
        job: job.name,
        id,
        success: true,
        duration_secs: durationSecs,
      });
    } catch (e: any) {
      writeFileSync(outFile, e.message);
      const completedAt = new Date().toISOString();
      const durationSecs =
        (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
      schedulerJobRuns.add(1, { job: job.name, status: 'error' });
      schedulerJobDuration.record(durationSecs * 1000, { job: job.name });

      const willRetry = (job.retryCount ?? 0) > 0 && attempt < maxAttempts;

      logStore.append({
        id,
        job: job.name,
        startedAt,
        completedAt,
        success: false,
        durationSecs,
        missedCount: this.missed.get(job.name) || 0,
        manual,
        output: outFile,
        error: e.message,
        attempt,
        maxAttempts,
      });

      if (willRetry) {
        const delaySecs = job.retryDelaySecs ?? 0;
        this.broadcast({
          event: 'job.retrying',
          job: job.name,
          id,
          error: e.message,
          attempt,
          maxAttempts,
        });
        setTimeout(
          () => this.executeJob(job, manual, attempt + 1),
          delaySecs * 1000,
        );
      } else {
        this.broadcast({
          event: 'job.failed',
          job: job.name,
          id,
          error: e.message,
        });
        this.notificationService?.schedule('scheduler', {
          category: 'job-failure',
          title: `Job "${job.name}" failed`,
          body: e.message,
          priority: 'high',
          dedupeTag: `scheduler:fail:${job.name}`,
          actions: [{ id: 'view-logs', label: 'View Logs' }],
          metadata: { jobName: job.name, link: `/schedule?job=${job.name}` },
        });
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
    return jobStore.read().map((j) => {
      const logs = new JsonFileStore<SchedulerLogEntry[]>(
        join(LOGS_DIR, `${j.name}.json`),
        [],
      ).read();
      const lastLog = logs[logs.length - 1];
      const nextTimes = j.cron && j.enabled ? nextCronTimes(j.cron, 1) : [];
      return {
        ...j,
        provider: this.id,
        lastRun: lastLog?.startedAt,
        nextRun: nextTimes[0]?.toISOString(),
      };
    });
  }

  async addJob(opts: AddJobOpts): Promise<string> {
    if (!opts.name?.trim()) throw new Error('Job name is required');
    if (!opts.prompt?.trim()) throw new Error('Job prompt is required');
    const jobs = jobStore.read();
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
    jobStore.write(jobs);
    return `Job '${opts.name}' created`;
  }

  async editJob(
    target: string,
    opts: Record<string, string | boolean>,
  ): Promise<string> {
    const jobs = jobStore.read();
    const job = jobs.find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    const PROTECTED = new Set(['name', 'createdAt']);
    for (const [k, v] of Object.entries(opts)) {
      if (PROTECTED.has(k)) continue;
      (job as any)[k] = v;
    }
    jobStore.write(jobs);
    return `Job '${target}' updated`;
  }

  async removeJob(target: string): Promise<void> {
    const jobs = jobStore.read();
    if (!jobs.some((j) => j.name === target))
      throw new Error(`Job '${target}' not found`);
    jobStore.write(jobs.filter((j) => j.name !== target));
  }

  async runJob(target: string): Promise<string> {
    const job = jobStore.read().find((j) => j.name === target);
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
    return new JsonFileStore<SchedulerLogEntry[]>(
      join(LOGS_DIR, `${target}.json`),
      [],
    )
      .read()
      .slice(-count);
  }

  async getRunOutput(target: string): Promise<string> {
    const logs = new JsonFileStore<SchedulerLogEntry[]>(
      join(LOGS_DIR, `${target}.json`),
      [],
    ).read();
    const last = logs[logs.length - 1];
    if (!last?.output) return '';
    return readFileSync(last.output, 'utf-8');
  }

  async readRunFile(path: string): Promise<string> {
    const real = realpathSync(path);
    const logsReal = realpathSync(LOGS_DIR);
    if (!real.startsWith(logsReal)) throw new Error('Invalid path');
    return readFileSync(real, 'utf-8');
  }

  async getStats(): Promise<SchedulerProviderStats> {
    return {
      jobs: jobStore.read().map((j) => {
        const logs = new JsonFileStore<SchedulerLogEntry[]>(
          join(LOGS_DIR, `${j.name}.json`),
          [],
        ).read();
        const successes = logs.filter((l) => l.success).length;
        const total = logs.length;
        return {
          name: j.name,
          total,
          successes,
          failures: total - successes,
          success_rate: total ? Math.round((successes / total) * 100) : 0,
        };
      }),
    };
  }

  async getStatus(): Promise<SchedulerProviderStatus> {
    const tickAge = this.lastTickAt ? Date.now() - this.lastTickAt : null;
    return {
      running: this.timer !== null,
      jobCount: jobStore.read().length,
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
