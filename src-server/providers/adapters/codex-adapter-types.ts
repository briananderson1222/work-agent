import type { ProviderSession } from '../adapter-shape.js';

export interface CodexProcessLike {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'exit', listener: (code: number | null) => void): this;
}

export interface PendingRpcRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export interface PendingApprovalRequest {
  rpcRequestId: string;
  method: string;
  title: string;
  threadId: string;
  payload: Record<string, unknown>;
}

export interface CodexSessionRecord {
  externalThreadId: string;
  codexThreadId: string;
  process: CodexProcessLike;
  session: ProviderSession;
  rpcRequestCounter: number;
  pendingRpcRequests: Map<string, PendingRpcRequest>;
  pendingApprovals: Map<string, PendingApprovalRequest>;
  activeTurnId?: string;
  activeTurnStartedAt?: number;
  lastSessionState: 'idle' | 'running' | 'errored';
  turnOutput: Map<string, string>;
  toolNames: Map<string, string>;
  toolStarted: Set<string>;
}
