import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type {
  SchedulerLogEntry,
  SchedulerProviderStats,
} from '../providers/provider-contracts.js';
import { resolveHomeDir } from '../utils/paths.js';
import { nextCronTimes } from './cron.js';
import { JsonFileStore } from './json-store.js';

export const SCHEDULER_DATA_DIR = join(resolveHomeDir(), 'scheduler');
export const SCHEDULER_JOBS_FILE = join(SCHEDULER_DATA_DIR, 'jobs.json');
export const SCHEDULER_LOGS_DIR = join(SCHEDULER_DATA_DIR, 'logs');

export interface StoredJob {
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

const jobStore = new JsonFileStore<StoredJob[]>(SCHEDULER_JOBS_FILE, []);

function createJobLogStore(name: string): JsonFileStore<SchedulerLogEntry[]> {
  return new JsonFileStore<SchedulerLogEntry[]>(
    join(SCHEDULER_LOGS_DIR, `${name}.json`),
    [],
  );
}

export function readStoredJobs(): StoredJob[] {
  return jobStore.read();
}

export function writeStoredJobs(jobs: StoredJob[]): void {
  jobStore.write(jobs);
}

export function appendSchedulerJobLog(
  name: string,
  entry: SchedulerLogEntry,
): void {
  createJobLogStore(name).append(entry);
}

export function readSchedulerJobLogs(
  name: string,
  count?: number,
): SchedulerLogEntry[] {
  const logs = createJobLogStore(name).read();
  return typeof count === 'number' ? logs.slice(-count) : logs;
}

export function getSchedulerRunOutputPath(id: string): string {
  return join(SCHEDULER_LOGS_DIR, `${id}.log`);
}

export function readSchedulerRunOutput(path: string): string {
  return readFileSync(path, 'utf-8');
}

export function readSchedulerRunFile(path: string): string {
  const real = realpathSync(path);
  const logsReal = realpathSync(SCHEDULER_LOGS_DIR);
  const relativePath = relative(logsReal, real);
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..'
  ) {
    throw new Error('Invalid path');
  }
  return readFileSync(real, 'utf-8');
}

export function getStoredJobStats(): SchedulerProviderStats {
  return {
    jobs: readStoredJobs().map((job) => {
      const logs = readSchedulerJobLogs(job.name);
      const successes = logs.filter((entry) => entry.success).length;
      const total = logs.length;
      return {
        name: job.name,
        total,
        successes,
        failures: total - successes,
        success_rate: total ? Math.round((successes / total) * 100) : 0,
      };
    }),
  };
}

export function getStoredJobView(
  job: StoredJob,
): StoredJob & { lastRun?: string; nextRun?: string } {
  const logs = readSchedulerJobLogs(job.name);
  const lastLog = logs[logs.length - 1];
  const nextTimes = job.cron && job.enabled ? nextCronTimes(job.cron, 1) : [];
  return {
    ...job,
    lastRun: lastLog?.startedAt,
    nextRun: nextTimes[0]?.toISOString(),
  };
}
