import type {
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
} from './provider.js';
import type { RunFailureKind, RunStatus } from './runs.js';
import type { CanonicalRuntimeEvent } from './runtime-events.js';

export type OrchestrationCommand =
  | { type: 'startSession'; input: ProviderSessionStartInput }
  | { type: 'sendTurn'; input: ProviderSendTurnInput }
  | { type: 'interruptTurn'; threadId: string; turnId?: string }
  | {
      type: 'respondToRequest';
      threadId: string;
      requestId: string;
      decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel';
    }
  | { type: 'stopSession'; threadId: string };

export interface OrchestrationSessionSummary extends ProviderSession {
  isLoaded: boolean;
  isPersisted: boolean;
  eventCount: number;
  lastEventAt?: string;
  lastEventMethod?: CanonicalRuntimeEvent['method'];
}

export interface OrchestrationSessionDetail {
  session: OrchestrationSessionSummary;
  events: CanonicalRuntimeEvent[];
}

export type AgentRunStatus = RunStatus;

export type AgentRunFailureKind = RunFailureKind;

export interface AgentRunSummary {
  runId: string;
  sessionId: string;
  providerId: string;
  source: 'orchestration';
  executionClass: 'managed' | 'connected' | 'unknown';
  status: AgentRunStatus;
  cwd?: string;
  runtimeThreadId?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failureKind?: AgentRunFailureKind;
  failureMessage?: string;
  retryEligible: boolean;
  attempt: number;
  eventCount: number;
}

export interface TerminalProcessSummary {
  kind: 'terminal';
  sessionId: string;
  projectSlug: string;
  terminalId: string;
  cwd: string;
  status: 'starting' | 'running' | 'exited';
  pid: number | null;
  exitCode: number | null;
  hasRunningSubprocess: boolean;
  cols: number;
  rows: number;
}

export interface TerminalProcessDetail {
  process: TerminalProcessSummary;
  history: string;
}
