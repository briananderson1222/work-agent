/**
 * Scheduler type definitions
 */

/** Schedule configuration - cron expression or fixed interval */
export type JobSchedule =
  | { type: 'cron'; expression: string }
  | { type: 'interval'; intervalMs: number };

/** Action: send a message to an agent */
export interface AgentConversationAction {
  type: 'agent-conversation';
  agentSlug: string;
  message: string;
  /** If set, continues an existing conversation instead of starting a new one */
  conversationId?: string | null;
}

/** Action: invoke a specific MCP tool directly */
export interface ToolInvocationAction {
  type: 'tool-invocation';
  toolName: string;
  toolServer: string;
  parameters: Record<string, unknown>;
}

/** A single step in a workflow */
export interface WorkflowStep {
  id: string;
  type: 'agent-conversation' | 'tool-invocation';
  agentSlug?: string;
  message?: string;
  toolName?: string;
  toolServer?: string;
  parameters?: Record<string, unknown>;
  /** Variable name to store this step's output for use in subsequent steps via {{varName}} */
  outputVariable?: string;
}

/** Action: execute a multi-step workflow sequentially */
export interface WorkflowAction {
  type: 'workflow';
  steps: WorkflowStep[];
}

export type JobAction = AgentConversationAction | ToolInvocationAction | WorkflowAction;

/** Persisted job definition */
export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: JobSchedule;
  action: JobAction;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure' | 'running';
  lastRunError?: string;
  nextRunAt?: string;
}

/** Input for creating a new job */
export interface CreateJobInput {
  name: string;
  description?: string;
  enabled?: boolean;
  schedule: JobSchedule;
  action: JobAction;
}

/** Input for updating an existing job */
export type UpdateJobInput = Partial<CreateJobInput>;

/** A single execution record */
export interface JobExecution {
  id: string;
  jobId: string;
  jobName: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failure';
  result?: string;
  error?: string;
  durationMs?: number;
  /** Per-step results for workflow jobs */
  stepResults?: Array<{
    stepId: string;
    status: 'success' | 'failure';
    result?: string;
    error?: string;
    durationMs?: number;
  }>;
}

/** Upcoming job info (for tray menu / dashboard) */
export interface UpcomingJob {
  jobId: string;
  jobName: string;
  nextRunAt: string;
  schedule: JobSchedule;
}

/** Events emitted by the scheduler to the monitoring SSE stream */
export type SchedulerEvent =
  | { type: 'scheduler:job:started'; jobId: string; jobName: string; timestamp: string }
  | { type: 'scheduler:job:completed'; jobId: string; jobName: string; timestamp: string; durationMs: number; result?: string }
  | { type: 'scheduler:job:failed'; jobId: string; jobName: string; timestamp: string; error: string }
  | { type: 'scheduler:job:skipped'; jobId: string; jobName: string; timestamp: string; reason: string };
