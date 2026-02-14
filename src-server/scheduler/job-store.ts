/**
 * Job persistence layer
 * Stores job definitions in .work-agent/scheduler/jobs.json
 * Stores execution history in .work-agent/scheduler/history-YYYY-MM-DD.ndjson
 */

import { mkdir, readFile, writeFile, appendFile, readdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import type { ScheduledJob, CreateJobInput, UpdateJobInput, JobExecution } from './job-types.js';

export class JobStore {
  private schedulerDir: string;
  private jobsFilePath: string;
  private jobs: Map<string, ScheduledJob> = new Map();

  constructor(workAgentDir: string) {
    this.schedulerDir = join(workAgentDir, 'scheduler');
    this.jobsFilePath = join(this.schedulerDir, 'jobs.json');
  }

  /** Load jobs from disk into memory */
  async initialize(): Promise<void> {
    await mkdir(this.schedulerDir, { recursive: true });

    if (existsSync(this.jobsFilePath)) {
      const raw = await readFile(this.jobsFilePath, 'utf-8');
      const data = JSON.parse(raw) as { jobs: ScheduledJob[] };
      for (const job of data.jobs) {
        this.jobs.set(job.id, job);
      }
    }
  }

  /** Persist current jobs map to disk */
  private async persist(): Promise<void> {
    const data = { jobs: Array.from(this.jobs.values()) };
    await writeFile(this.jobsFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** Create a new job, returns the created job */
  async createJob(input: CreateJobInput): Promise<ScheduledJob> {
    const now = new Date().toISOString();
    const job: ScheduledJob = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      schedule: input.schedule,
      action: input.action,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    await this.persist();
    return job;
  }

  /** Update an existing job */
  async updateJob(id: string, updates: UpdateJobInput): Promise<ScheduledJob | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    if (updates.name !== undefined) job.name = updates.name;
    if (updates.description !== undefined) job.description = updates.description;
    if (updates.enabled !== undefined) job.enabled = updates.enabled;
    if (updates.schedule !== undefined) job.schedule = updates.schedule;
    if (updates.action !== undefined) job.action = updates.action;
    job.updatedAt = new Date().toISOString();

    this.jobs.set(id, job);
    await this.persist();
    return job;
  }

  /** Delete a job */
  async deleteJob(id: string): Promise<boolean> {
    const existed = this.jobs.delete(id);
    if (existed) await this.persist();
    return existed;
  }

  /** Get a single job */
  getJob(id: string): ScheduledJob | null {
    return this.jobs.get(id) ?? null;
  }

  /** Get all jobs */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /** Update runtime state fields (lastRun, nextRun) without changing updatedAt */
  async updateJobRunState(id: string, state: {
    lastRunAt?: string;
    lastRunStatus?: 'success' | 'failure' | 'running';
    lastRunError?: string;
    nextRunAt?: string;
  }): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    if (state.lastRunAt !== undefined) job.lastRunAt = state.lastRunAt;
    if (state.lastRunStatus !== undefined) job.lastRunStatus = state.lastRunStatus;
    if (state.lastRunError !== undefined) job.lastRunError = state.lastRunError;
    if (state.nextRunAt !== undefined) job.nextRunAt = state.nextRunAt;

    this.jobs.set(id, job);
    await this.persist();
  }

  // --- Execution history ---

  private historyPath(date: Date): string {
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    return join(this.schedulerDir, `history-${dateStr}.ndjson`);
  }

  /** Append an execution record to today's history file */
  async appendExecution(execution: JobExecution): Promise<void> {
    const filePath = this.historyPath(new Date());
    await appendFile(filePath, JSON.stringify(execution) + '\n', 'utf-8');
  }

  /** Update the last execution record for a running job (completion) */
  async updateExecution(execution: JobExecution): Promise<void> {
    // For simplicity, append the updated record; consumers should use the latest by id
    await this.appendExecution(execution);
  }

  /** Query execution history for a date range */
  async queryHistory(opts?: {
    jobId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<JobExecution[]> {
    const results: JobExecution[] = [];
    const limit = opts?.limit ?? 100;

    // Find history files
    if (!existsSync(this.schedulerDir)) return results;

    const files = await readdir(this.schedulerDir);
    const historyFiles = files
      .filter(f => f.startsWith('history-') && f.endsWith('.ndjson'))
      .sort()
      .reverse(); // newest first

    for (const file of historyFiles) {
      // Extract date from filename to check range
      const fileDate = file.replace('history-', '').replace('.ndjson', '');
      if (opts?.startDate && fileDate < opts.startDate) continue;
      if (opts?.endDate && fileDate > opts.endDate) continue;

      const filePath = join(this.schedulerDir, file);
      const lines = await this.readNdjsonFile(filePath);

      for (const line of lines) {
        if (opts?.jobId && line.jobId !== opts.jobId) continue;
        results.push(line);
        if (results.length >= limit) return this.deduplicateExecutions(results);
      }
    }

    return this.deduplicateExecutions(results);
  }

  /** Deduplicate executions by id, keeping the latest (last written) */
  private deduplicateExecutions(executions: JobExecution[]): JobExecution[] {
    const byId = new Map<string, JobExecution>();
    for (const exec of executions) {
      byId.set(exec.id, exec);
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  private async readNdjsonFile(filePath: string): Promise<JobExecution[]> {
    const results: JobExecution[] = [];
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed));
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  }
}
