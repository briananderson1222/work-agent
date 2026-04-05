import type { ProviderKind } from './provider.js';

export type SessionState =
  | 'created'
  | 'configured'
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'aborted'
  | 'errored'
  | 'exited';

export type ApprovalStatus = 'approved' | 'denied' | 'cancelled' | 'expired';

export type RuntimeSeverity = 'error' | 'warning';

export interface CanonicalRuntimeEventBase {
  eventId: string;
  provider: ProviderKind;
  threadId: string;
  createdAt: string;
  turnId?: string;
  itemId?: string;
  requestId?: string;
}

export interface SessionStartedEvent extends CanonicalRuntimeEventBase {
  method: 'session.started';
  sessionId: string;
  initialState?: SessionState;
  metadata?: Record<string, unknown>;
}

export interface SessionConfiguredEvent extends CanonicalRuntimeEventBase {
  method: 'session.configured';
  sessionId: string;
  model?: string;
  instructions?: string;
  cwd?: string;
  tools?: string[];
  metadata?: Record<string, unknown>;
}

export interface SessionStateChangedEvent extends CanonicalRuntimeEventBase {
  method: 'session.state-changed';
  sessionId: string;
  from: SessionState;
  to: SessionState;
  reason?: string;
}

export interface SessionExitedEvent extends CanonicalRuntimeEventBase {
  method: 'session.exited';
  sessionId: string;
  exitCode?: number;
  reason?: string;
}

export interface TurnStartedEvent extends CanonicalRuntimeEventBase {
  method: 'turn.started';
  turnId: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export interface TurnCompletedEvent extends CanonicalRuntimeEventBase {
  method: 'turn.completed';
  turnId: string;
  finishReason?: 'stop' | 'tool-calls' | 'max-tokens' | 'cancelled' | 'other';
  outputText?: string;
}

export interface TurnAbortedEvent extends CanonicalRuntimeEventBase {
  method: 'turn.aborted';
  turnId: string;
  reason: string;
}

export interface ContentTextDeltaEvent extends CanonicalRuntimeEventBase {
  method: 'content.text-delta';
  itemId: string;
  delta: string;
}

export interface ContentReasoningDeltaEvent extends CanonicalRuntimeEventBase {
  method: 'content.reasoning-delta';
  itemId: string;
  delta: string;
}

export interface ToolStartedEvent extends CanonicalRuntimeEventBase {
  method: 'tool.started';
  itemId: string;
  toolCallId: string;
  toolName: string;
  arguments?: unknown;
}

export interface ToolProgressEvent extends CanonicalRuntimeEventBase {
  method: 'tool.progress';
  itemId: string;
  toolCallId: string;
  message: string;
  progress?: number;
}

export interface ToolCompletedEvent extends CanonicalRuntimeEventBase {
  method: 'tool.completed';
  itemId: string;
  toolCallId: string;
  toolName: string;
  status: 'success' | 'error' | 'cancelled';
  output?: unknown;
  error?: string;
}

export interface RequestOpenedEvent extends CanonicalRuntimeEventBase {
  method: 'request.opened';
  requestId: string;
  requestType: 'approval' | 'permission' | 'confirmation' | 'input';
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
}

export interface RequestResolvedEvent extends CanonicalRuntimeEventBase {
  method: 'request.resolved';
  requestId: string;
  status: ApprovalStatus;
  response?: Record<string, unknown>;
}

export interface RuntimeErrorEvent extends CanonicalRuntimeEventBase {
  method: 'runtime.error';
  severity: Extract<RuntimeSeverity, 'error'>;
  message: string;
  code?: string;
  retriable?: boolean;
  details?: Record<string, unknown>;
}

export interface RuntimeWarningEvent extends CanonicalRuntimeEventBase {
  method: 'runtime.warning';
  severity: Extract<RuntimeSeverity, 'warning'>;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface TokenUsageUpdatedEvent extends CanonicalRuntimeEventBase {
  method: 'token-usage.updated';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type CanonicalRuntimeEvent =
  | SessionStartedEvent
  | SessionConfiguredEvent
  | SessionStateChangedEvent
  | SessionExitedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnAbortedEvent
  | ContentTextDeltaEvent
  | ContentReasoningDeltaEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolCompletedEvent
  | RequestOpenedEvent
  | RequestResolvedEvent
  | RuntimeErrorEvent
  | RuntimeWarningEvent
  | TokenUsageUpdatedEvent;
