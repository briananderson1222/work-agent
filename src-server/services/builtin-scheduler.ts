/**
 * Built-in lightweight scheduler — no external dependencies.
 * In-process cron matching, JSON file persistence, calls local agent chat API for runs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  ISchedulerProvider,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
  SchedulerCapability,
  AddJobOpts,
} from '../providers/types.js';
import { cronMatches, nextCronTimes } from './cron.js';
import { JsonFileStore } from './json-store.js';
import { SSEBroadcaster } from './sse-broadcaster.js';
import { schedulerJobRuns, schedulerJobDuration } from '../telemetry/metrics.js';

export { nextCronTimes } from './cron.js';

const DATA_DIR = join(homedir(), '.stallion-ai', 'scheduler');
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
  private running = new Set<string>();
  private missed = new Map<string, number>();
  private sse = new SSEBroadcaster();
  private chatFn: ChatFn | null = null;

  /** Provide the chat function once the runtime is ready */
  setChatFn(fn: ChatFn) { this.chatFn = fn; }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 60_000);
    this.tick();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tick() {
    const now = new Date();
    for (const job of jobStore.read()) {
      if (!job.enabled || !job.cron) continue;
      if (!cronMatches(job.cron, now)) continue;
      if (this.running.has(job.name)) {
        this.missed.set(job.name, (this.missed.get(job.name) || 0) + 1);
        continue;
      }
      this.executeJob(job);
    }
  }

  private async executeJob(job: StoredJob) {
    const id = `${job.name}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    this.running.add(job.name);
    this.broadcast({ event: 'job.started', job: job.name, id });

    const outFile = join(LOGS_DIR, `${id}.log`);
    const logStore = new JsonFileStore<SchedulerLogEntry[]>(join(LOGS_DIR, `${job.name}.json`), []);

    try {
      if (!this.chatFn) throw new Error('Scheduler not connected to agent runtime');
      const agent = (job.agent && job.agent !== 'default') ? job.agent : 'default';
      const output = await this.chatFn(agent, job.prompt);

      writeFileSync(outFile, output);
      const completedAt = new Date().toISOString();
      const durationSecs = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;

      schedulerJobRuns.add(1, { job: job.name, status: 'success' });
      schedulerJobDuration.record(durationSecs * 1000, { job: job.name });
      logStore.append({ id, job: job.name, startedAt, completedAt, success: true, durationSecs, missedCount: this.missed.get(job.name) || 0, output: outFile });
      this.broadcast({ event: 'job.completed', job: job.name, id, success: true, duration_secs: durationSecs });
    } catch (e: any) {
      writeFileSync(outFile, e.message);
      const completedAt = new Date().toISOString();
      const durationSecs = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
      schedulerJobRuns.add(1, { job: job.name, status: 'error' });
      schedulerJobDuration.record(durationSecs * 1000, { job: job.name });
      logStore.append({ id, job: job.name, startedAt, completedAt, success: false, durationSecs, missedCount: this.missed.get(job.name) || 0, output: outFile, error: e.message });
      this.broadcast({ event: 'job.failed', job: job.name, id, error: e.message });
    } finally {
      this.missed.delete(job.name);
      this.running.delete(job.name);
    }
  }

  private broadcast(event: Record<string, unknown>) {
    this.sse.broadcast(event);
  }

  // ── ISchedulerProvider ──

  async listJobs(): Promise<SchedulerJob[]> {
    return jobStore.read().map((j) => {
      const logs = new JsonFileStore<SchedulerLogEntry[]>(join(LOGS_DIR, `${j.name}.json`), []).read();
      const lastLog = logs[logs.length - 1];
      const nextTimes = j.cron && j.enabled ? nextCronTimes(j.cron, 1) : [];
      return { ...j, provider: this.id, lastRun: lastLog?.startedAt, nextRun: nextTimes[0]?.toISOString() };
    });
  }

  async addJob(opts: AddJobOpts): Promise<string> {
    if (!opts.name?.trim()) throw new Error('Job name is required');
    if (!opts.prompt?.trim()) throw new Error('Job prompt is required');
    const jobs = jobStore.read();
    if (jobs.some((j) => j.name === opts.name)) throw new Error(`Job '${opts.name}' already exists`);
    jobs.push({ name: opts.name, cron: opts.cron, prompt: opts.prompt, agent: opts.agent, openArtifact: opts.openArtifact, notifyStart: opts.notifyStart, enabled: true, createdAt: new Date().toISOString() });
    jobStore.write(jobs);
    return `Job '${opts.name}' created`;
  }

  async editJob(target: string, opts: Record<string, string | boolean>): Promise<string> {
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
    if (!jobs.some((j) => j.name === target)) throw new Error(`Job '${target}' not found`);
    jobStore.write(jobs.filter((j) => j.name !== target));
  }

  async runJob(target: string): Promise<string> {
    const job = jobStore.read().find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    this.executeJob(job);
    return `Job '${target}' triggered`;
  }

  async enableJob(target: string): Promise<void> { await this.editJob(target, { enabled: true }); }
  async disableJob(target: string): Promise<void> { await this.editJob(target, { enabled: false }); }

  async getJobLogs(target: string, count = 20): Promise<SchedulerLogEntry[]> {
    return new JsonFileStore<SchedulerLogEntry[]>(join(LOGS_DIR, `${target}.json`), []).read().slice(-count);
  }

  async getRunOutput(target: string): Promise<string> {
    const logs = new JsonFileStore<SchedulerLogEntry[]>(join(LOGS_DIR, `${target}.json`), []).read();
    const last = logs[logs.length - 1];
    if (!last?.output) return '';
    return readFileSync(last.output, 'utf-8');
  }

  async readRunFile(path: string): Promise<string> {
    const { resolve } = await import('node:path');
    if (!resolve(path).startsWith(resolve(LOGS_DIR))) throw new Error('Invalid path');
    return readFileSync(path, 'utf-8');
  }

  async getStats(): Promise<SchedulerProviderStats> {
    return {
      jobs: jobStore.read().map((j) => {
        const logs = new JsonFileStore<SchedulerLogEntry[]>(join(LOGS_DIR, `${j.name}.json`), []).read();
        const successes = logs.filter((l) => l.success).length;
        const total = logs.length;
        return { name: j.name, total, successes, failures: total - successes, success_rate: total ? Math.round((successes / total) * 100) : 0 };
      }),
    };
  }

  async getStatus(): Promise<SchedulerProviderStatus> {
    return { running: this.timer !== null, jobCount: jobStore.read().length };
  }

  async previewSchedule(cron: string, count = 5): Promise<string[]> {
    return nextCronTimes(cron, count).map((d) => d.toISOString());
  }

  subscribe(send: (data: string) => void): () => void {
    return this.sse.subscribe(send);
  }
}
