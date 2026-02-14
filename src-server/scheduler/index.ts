/**
 * SchedulerService - manages scheduled jobs with cron/interval execution
 *
 * Uses the `croner` library for ESM-native cron scheduling.
 * Jobs are persisted in .work-agent/scheduler/jobs.json.
 * Execution history is stored in NDJSON files per day.
 */

import { Cron } from 'croner';
import type { Agent } from '@voltagent/core';
import type { EventEmitter } from 'events';
import { JobStore } from './job-store.js';
import { JobRunner, type JobRunnerDeps } from './job-runner.js';
import type {
  ScheduledJob,
  CreateJobInput,
  UpdateJobInput,
  JobExecution,
  UpcomingJob,
} from './job-types.js';

export interface SchedulerServiceDeps {
  workAgentDir: string;
  getAgent: (slug: string) => Agent | undefined;
  monitoringEvents: EventEmitter;
}

export class SchedulerService {
  private store: JobStore;
  private runner: JobRunner;
  private activeCrons: Map<string, Cron> = new Map();
  private runningJobs: Set<string> = new Set();
  private deps: SchedulerServiceDeps;

  constructor(deps: SchedulerServiceDeps) {
    this.deps = deps;
    this.store = new JobStore(deps.workAgentDir);
    this.runner = new JobRunner({
      getAgent: deps.getAgent,
      monitoringEvents: deps.monitoringEvents,
    });
  }

  /** Initialize: load persisted jobs and start all enabled schedules */
  async initialize(): Promise<void> {
    await this.store.initialize();

    const jobs = this.store.getJobs();
    for (const job of jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }
  }

  /** Create a new scheduled job */
  async addJob(input: CreateJobInput): Promise<ScheduledJob> {
    const job = await this.store.createJob(input);
    if (job.enabled) {
      this.scheduleJob(job);
    }
    return job;
  }

  /** Update a job definition */
  async updateJob(id: string, updates: UpdateJobInput): Promise<ScheduledJob | null> {
    // Stop existing schedule
    this.unscheduleJob(id);

    const job = await this.store.updateJob(id, updates);
    if (!job) return null;

    // Reschedule if enabled
    if (job.enabled) {
      this.scheduleJob(job);
    }

    return job;
  }

  /** Remove a job */
  async removeJob(id: string): Promise<boolean> {
    this.unscheduleJob(id);
    return this.store.deleteJob(id);
  }

  /** Enable a job */
  async enableJob(id: string): Promise<ScheduledJob | null> {
    const job = await this.store.updateJob(id, { enabled: true });
    if (job) this.scheduleJob(job);
    return job;
  }

  /** Disable a job */
  async disableJob(id: string): Promise<ScheduledJob | null> {
    this.unscheduleJob(id);
    return this.store.updateJob(id, { enabled: false });
  }

  /** Execute a job immediately (manual trigger) */
  async runJobNow(id: string): Promise<JobExecution | null> {
    const job = this.store.getJob(id);
    if (!job) return null;

    return this.executeJob(job);
  }

  /** Get all jobs */
  getJobs(): ScheduledJob[] {
    return this.store.getJobs();
  }

  /** Get a single job */
  getJob(id: string): ScheduledJob | null {
    return this.store.getJob(id);
  }

  /** Get upcoming scheduled runs */
  getUpcoming(limit = 5): UpcomingJob[] {
    const upcoming: UpcomingJob[] = [];

    for (const [jobId, cron] of this.activeCrons) {
      const job = this.store.getJob(jobId);
      if (!job) continue;

      const nextRun = cron.nextRun();
      if (nextRun) {
        upcoming.push({
          jobId: job.id,
          jobName: job.name,
          nextRunAt: nextRun.toISOString(),
          schedule: job.schedule,
        });
      }
    }

    return upcoming
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, limit);
  }

  /** Get execution history */
  async getHistory(opts?: {
    jobId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<JobExecution[]> {
    return this.store.queryHistory(opts);
  }

  /** Stop all scheduled jobs */
  async shutdown(): Promise<void> {
    for (const [id, cron] of this.activeCrons) {
      cron.stop();
    }
    this.activeCrons.clear();

    // Wait for running jobs to complete (with timeout)
    if (this.runningJobs.size > 0) {
      const timeout = 30_000;
      const start = Date.now();
      while (this.runningJobs.size > 0 && Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // --- Private ---

  private scheduleJob(job: ScheduledJob): void {
    // Don't double-schedule
    this.unscheduleJob(job.id);

    let cron: Cron;

    if (job.schedule.type === 'cron') {
      cron = new Cron(job.schedule.expression, () => {
        this.executeJob(job);
      });
    } else {
      // Interval-based: use croner's interval trick
      // Convert intervalMs to seconds for croner pattern
      const intervalSec = Math.max(1, Math.floor(job.schedule.intervalMs / 1000));
      cron = new Cron(`*/${intervalSec} * * * * *`, () => {
        this.executeJob(job);
      });
    }

    this.activeCrons.set(job.id, cron);

    // Update nextRunAt
    const nextRun = cron.nextRun();
    if (nextRun) {
      this.store.updateJobRunState(job.id, {
        nextRunAt: nextRun.toISOString(),
      });
    }
  }

  private unscheduleJob(id: string): void {
    const existing = this.activeCrons.get(id);
    if (existing) {
      existing.stop();
      this.activeCrons.delete(id);
    }
  }

  private async executeJob(job: ScheduledJob): Promise<JobExecution> {
    // Skip if already running (prevent overlap)
    if (this.runningJobs.has(job.id)) {
      this.deps.monitoringEvents.emit('event', {
        type: 'scheduler:job:skipped',
        jobId: job.id,
        jobName: job.name,
        timestamp: new Date().toISOString(),
        reason: 'Previous execution still running',
      });
      // Return a synthetic execution record
      return {
        id: 'skipped',
        jobId: job.id,
        jobName: job.name,
        startedAt: new Date().toISOString(),
        status: 'failure',
        error: 'Skipped: previous execution still running',
      };
    }

    this.runningJobs.add(job.id);

    await this.store.updateJobRunState(job.id, {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'running',
    });

    try {
      const execution = await this.runner.execute(job.id, job.name, job.action);

      await this.store.updateJobRunState(job.id, {
        lastRunAt: execution.startedAt,
        lastRunStatus: execution.status === 'success' ? 'success' : 'failure',
        lastRunError: execution.error,
      });

      // Update nextRunAt for the cron
      const cron = this.activeCrons.get(job.id);
      if (cron) {
        const nextRun = cron.nextRun();
        if (nextRun) {
          await this.store.updateJobRunState(job.id, {
            nextRunAt: nextRun.toISOString(),
          });
        }
      }

      await this.store.appendExecution(execution);

      return execution;
    } finally {
      this.runningJobs.delete(job.id);
    }
  }
}

// Re-export types for convenience
export type {
  ScheduledJob,
  CreateJobInput,
  UpdateJobInput,
  JobExecution,
  UpcomingJob,
  JobAction,
  AgentConversationAction,
  ToolInvocationAction,
  WorkflowAction,
  WorkflowStep,
  JobSchedule,
  SchedulerEvent,
} from './job-types.js';
