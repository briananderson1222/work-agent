/**
 * Built-in lightweight scheduler — no external dependencies.
 * In-process cron matching, JSON file persistence, spawns kiro-cli for runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import type {
  ISchedulerProvider,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
  SchedulerCapability,
  AddJobOpts,
} from '../providers/types.js';

const DATA_DIR = join(homedir(), '.stallion-ai', 'scheduler');
const JOBS_FILE = join(DATA_DIR, 'jobs.json');
const LOGS_DIR = join(DATA_DIR, 'logs');

// ── Minimal cron engine (standard 5-field: min hour dom month dow) ──

function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangeStr, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (rangeStr === '*') {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-').map(Number);
      for (let i = a; i <= b; i += step) values.add(i);
    } else {
      values.add(parseInt(rangeStr, 10));
    }
  }
  return [...values].sort((a, b) => a - b);
}

function cronMatches(cron: string, date: Date): boolean {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const m = date.getUTCMinutes(), h = date.getUTCHours();
  const d = date.getUTCDate(), mo = date.getUTCMonth() + 1, w = date.getUTCDay();
  return (
    parseCronField(min, 0, 59).includes(m) &&
    parseCronField(hour, 0, 23).includes(h) &&
    parseCronField(dom, 1, 31).includes(d) &&
    parseCronField(mon, 1, 12).includes(mo) &&
    parseCronField(dow, 0, 6).includes(w)
  );
}

export function nextCronTimes(cron: string, count: number, after = new Date()): Date[] {
  const results: Date[] = [];
  const cursor = new Date(after);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (results.length < count && cursor.getTime() < limit) {
    if (cronMatches(cron, cursor)) results.push(new Date(cursor));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return results;
}

// ── Persistence ──

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

function ensureDirs() { mkdirSync(LOGS_DIR, { recursive: true }); }

function readJobs(): StoredJob[] {
  if (!existsSync(JOBS_FILE)) return [];
  try { return JSON.parse(readFileSync(JOBS_FILE, 'utf-8')); } catch { return []; }
}

function writeJobs(jobs: StoredJob[]) {
  ensureDirs();
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

function readLogs(jobName: string): SchedulerLogEntry[] {
  const file = join(LOGS_DIR, `${jobName}.json`);
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
}

function appendLog(jobName: string, entry: SchedulerLogEntry) {
  const logs = readLogs(jobName);
  logs.push(entry);
  ensureDirs();
  writeFileSync(join(LOGS_DIR, `${jobName}.json`), JSON.stringify(logs.slice(-100), null, 2));
}

// ── Provider ──

export class BuiltinScheduler implements ISchedulerProvider {
  readonly id = 'built-in';
  readonly displayName = 'Built-in Scheduler';
  readonly capabilities: SchedulerCapability[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();
  private sseClients = new Set<(data: string) => void>();

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
    for (const job of readJobs()) {
      if (!job.enabled || !job.cron || this.running.has(job.name)) continue;
      if (cronMatches(job.cron, now)) this.executeJob(job);
    }
  }

  private async executeJob(job: StoredJob) {
    const id = `${job.name}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    this.running.add(job.name);
    this.broadcast({ event: 'job.started', job: job.name, id });

    const outFile = join(LOGS_DIR, `${id}.log`);
    ensureDirs();

    try {
      const args = ['chat', '--prompt', job.prompt];
      if (job.agent) args.push('--agent', job.agent);

      const result = await new Promise<{ code: number; output: string }>((resolve) => {
        let output = '';
        const child = spawn('kiro-cli', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
        child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });
        child.on('close', (code) => resolve({ code: code ?? 1, output }));
        child.on('error', (e) => resolve({ code: 1, output: e.message }));
      });

      writeFileSync(outFile, result.output);
      const completedAt = new Date().toISOString();
      const durationSecs = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
      const success = result.code === 0;

      appendLog(job.name, { id, job: job.name, startedAt, completedAt, success, durationSecs, output: outFile });
      this.broadcast({ event: success ? 'job.completed' : 'job.failed', job: job.name, id, success, duration_secs: durationSecs, ...(success ? {} : { error: `exit code ${result.code}` }) });
    } catch (e: any) {
      appendLog(job.name, { id, job: job.name, startedAt, success: false, error: e.message });
      this.broadcast({ event: 'job.failed', job: job.name, id, error: e.message });
    } finally {
      this.running.delete(job.name);
    }
  }

  private broadcast(event: Record<string, unknown>) {
    const data = JSON.stringify(event);
    for (const send of this.sseClients) {
      try { send(data); } catch { this.sseClients.delete(send); }
    }
  }

  // ── ISchedulerProvider ──

  async listJobs(): Promise<SchedulerJob[]> {
    return readJobs().map((j) => {
      const logs = readLogs(j.name);
      const lastLog = logs[logs.length - 1];
      const nextTimes = j.cron && j.enabled ? nextCronTimes(j.cron, 1) : [];
      return { ...j, provider: this.id, lastRun: lastLog?.startedAt, nextRun: nextTimes[0]?.toISOString() };
    });
  }

  async addJob(opts: AddJobOpts): Promise<string> {
    const jobs = readJobs();
    if (jobs.some((j) => j.name === opts.name)) throw new Error(`Job '${opts.name}' already exists`);
    jobs.push({ name: opts.name, cron: opts.cron, prompt: opts.prompt, agent: opts.agent, openArtifact: opts.openArtifact, notifyStart: opts.notifyStart, enabled: true, createdAt: new Date().toISOString() });
    writeJobs(jobs);
    return `Job '${opts.name}' created`;
  }

  async editJob(target: string, opts: Record<string, string | boolean>): Promise<string> {
    const jobs = readJobs();
    const job = jobs.find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    for (const [k, v] of Object.entries(opts)) (job as any)[k] = v;
    writeJobs(jobs);
    return `Job '${target}' updated`;
  }

  async removeJob(target: string): Promise<void> { writeJobs(readJobs().filter((j) => j.name !== target)); }
  async runJob(target: string): Promise<string> {
    const job = readJobs().find((j) => j.name === target);
    if (!job) throw new Error(`Job '${target}' not found`);
    this.executeJob(job);
    return `Job '${target}' triggered`;
  }
  async enableJob(target: string): Promise<void> { await this.editJob(target, { enabled: true }); }
  async disableJob(target: string): Promise<void> { await this.editJob(target, { enabled: false }); }
  async getJobLogs(target: string, count = 20): Promise<SchedulerLogEntry[]> { return readLogs(target).slice(-count); }

  async getRunOutput(target: string): Promise<string> {
    const logs = readLogs(target);
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
      jobs: readJobs().map((j) => {
        const logs = readLogs(j.name);
        const successes = logs.filter((l) => l.success).length;
        const total = logs.length;
        return { name: j.name, total, successes, failures: total - successes, success_rate: total ? Math.round((successes / total) * 100) : 0 };
      }),
    };
  }

  async getStatus(): Promise<SchedulerProviderStatus> {
    return { running: this.timer !== null, jobCount: readJobs().length };
  }

  async previewSchedule(cron: string, count = 5): Promise<string[]> {
    return nextCronTimes(cron, count).map((d) => d.toISOString());
  }

  subscribe(send: (data: string) => void): () => void {
    this.sseClients.add(send);
    return () => this.sseClients.delete(send);
  }
}
