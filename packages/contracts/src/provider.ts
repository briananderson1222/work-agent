export const PROVIDER_BEDROCK = 'bedrock';
export const PROVIDER_CLAUDE = 'claude';
export const PROVIDER_CODEX = 'codex';

export type ProviderKind = string;

export interface ProviderSessionStartInput {
  threadId: string;
  provider: ProviderKind;
  cwd?: string;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
  resumeCursor?: unknown;
}

export interface ProviderSendTurnInput {
  threadId: string;
  input: string;
  attachments?: unknown[];
  modelId?: string;
  modelOptions?: Record<string, unknown>;
}

export interface ProviderSession {
  provider: ProviderKind;
  threadId: string;
  status: 'connecting' | 'ready' | 'running' | 'error' | 'closed';
  model?: string;
  resumeCursor?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderTurnStartResult {
  threadId: string;
  turnId: string;
  resumeCursor?: unknown;
}
