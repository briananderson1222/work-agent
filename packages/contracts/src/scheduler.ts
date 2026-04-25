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
  notifyStart?: boolean;
  retryCount?: number;
  retryDelaySecs?: number;
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
  attempt?: number;
  maxAttempts?: number;
}

export interface AddJobOpts {
  name: string;
  provider?: string;
  cron?: string;
  prompt: string;
  agent?: string;
  notifyStart?: boolean;
  retryCount?: number;
  retryDelaySecs?: number;
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
  lastTickAt?: string | null;
  healthy?: boolean;
}

export interface SchedulerEvent {
  event:
    | 'job.started'
    | 'job.completed'
    | 'job.failed'
    | 'job.retrying'
    | 'job.missed';
  job: string;
  provider?: string;
  id?: string;
  success?: boolean;
  duration_secs?: number;
  artifact?: string | null;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
  missedCount?: number;
}
