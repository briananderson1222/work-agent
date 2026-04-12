import { writeFileSync } from 'node:fs';
import {
  schedulerJobDuration,
  schedulerJobRuns,
} from '../telemetry/metrics.js';
import {
  appendSchedulerJobLog,
  getSchedulerRunOutputPath,
  type StoredJob,
} from './builtin-scheduler-storage.js';
import type { NotificationService } from './notification-service.js';

export type SchedulerChatFn = (
  agentSlug: string,
  prompt: string,
) => Promise<string>;

export interface SchedulerExecutionDeps {
  job: StoredJob;
  id: string;
  manual: boolean;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  chatFn: SchedulerChatFn;
  notificationService: NotificationService | null;
  broadcast: (event: Record<string, unknown>) => void;
  getMissedCount: () => number;
}

export interface SchedulerExecutionResult {
  success: boolean;
  outputPath: string;
  error?: string;
  durationSecs: number;
}

const JOB_TIMEOUT = 10 * 60_000;

export async function executeSchedulerJobAttempt({
  job,
  id,
  manual,
  attempt,
  maxAttempts,
  startedAt,
  chatFn,
  notificationService,
  broadcast,
  getMissedCount,
}: SchedulerExecutionDeps): Promise<SchedulerExecutionResult> {
  const outFile = getSchedulerRunOutputPath(id);

  try {
    const agent = job.agent && job.agent !== 'default' ? job.agent : 'default';
    const output = await Promise.race([
      chatFn(agent, job.prompt),
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
    appendSchedulerJobLog(job.name, {
      id,
      job: job.name,
      startedAt,
      completedAt,
      success: true,
      durationSecs,
      missedCount: getMissedCount(),
      manual,
      output: outFile,
      attempt,
      maxAttempts,
    });
    broadcast({
      event: 'job.completed',
      job: job.name,
      id,
      success: true,
      duration_secs: durationSecs,
    });

    return { success: true, outputPath: outFile, durationSecs };
  } catch (error: any) {
    writeFileSync(outFile, error.message);
    const completedAt = new Date().toISOString();
    const durationSecs =
      (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;

    schedulerJobRuns.add(1, { job: job.name, status: 'error' });
    schedulerJobDuration.record(durationSecs * 1000, { job: job.name });
    appendSchedulerJobLog(job.name, {
      id,
      job: job.name,
      startedAt,
      completedAt,
      success: false,
      durationSecs,
      missedCount: getMissedCount(),
      manual,
      output: outFile,
      error: error.message,
      attempt,
      maxAttempts,
    });

    const willRetry = (job.retryCount ?? 0) > 0 && attempt < maxAttempts;
    if (willRetry) {
      broadcast({
        event: 'job.retrying',
        job: job.name,
        id,
        error: error.message,
        attempt,
        maxAttempts,
      });
    } else {
      broadcast({
        event: 'job.failed',
        job: job.name,
        id,
        error: error.message,
      });
      notificationService?.schedule('scheduler', {
        category: 'job-failure',
        title: `Job "${job.name}" failed`,
        body: error.message,
        priority: 'high',
        dedupeTag: `scheduler:fail:${job.name}`,
        actions: [{ id: 'view-logs', label: 'View Logs' }],
        metadata: { jobName: job.name, link: `/schedule?job=${job.name}` },
      });
    }

    return {
      success: false,
      outputPath: outFile,
      error: error.message,
      durationSecs,
    };
  }
}
