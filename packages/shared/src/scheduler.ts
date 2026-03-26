/**
 * Scheduler types — shared between server, SDK, and UI.
 * Single source of truth. Do NOT redefine elsewhere.
 */

export type SchedulerCapability =
  | 'artifacts'
  | 'notifications'
  | 'daemon'
  | 'working-dir'
  | 'command';

export interface SchedulerFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'boolean';
  placeholder?: string;
  hint?: string;
}

export interface SchedulerJob {
  name: string;
  provider: string;
  cron?: string;
  prompt: string;
  agent?: string;
  enabled: boolean;
  openArtifact?: string;
  notifyStart?: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

export interface SchedulerLogEntry {
  id: string;
  job: string;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  durationSecs?: number;
  missedCount?: number;
  manual?: boolean;
  output?: string;
  error?: string;
}

export interface AddJobOpts {
  name: string;
  provider?: string;
  cron?: string;
  prompt: string;
  agent?: string;
  openArtifact?: string;
  notifyStart?: boolean;
  [key: string]: unknown;
}

export interface SchedulerProviderStats {
  jobs: {
    name: string;
    total: number;
    successes: number;
    failures: number;
    success_rate: number;
  }[];
}

export interface SchedulerProviderStatus {
  running: boolean;
  jobCount: number;
}

/** SSE event shape pushed from scheduler to frontend */
export interface SchedulerEvent {
  event: 'job.started' | 'job.completed' | 'job.failed';
  job: string;
  id?: string;
  success?: boolean;
  duration_secs?: number;
  artifact?: string | null;
  error?: string;
}
