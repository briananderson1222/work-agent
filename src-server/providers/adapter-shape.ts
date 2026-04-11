import type {
  ProviderKind,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type {
  ConnectionCapability,
  Prerequisite,
} from '@stallion-ai/contracts/tool';

export type {
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '@stallion-ai/contracts/provider';
export type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';

export interface ProviderAdapterMetadata {
  displayName: string;
  description: string;
  capabilities: readonly ConnectionCapability[];
  runtimeId?: string;
  builtin?: boolean;
}

export interface ProviderAdapterShape {
  readonly provider: ProviderKind;
  readonly metadata: ProviderAdapterMetadata;

  startSession(input: ProviderSessionStartInput): Promise<ProviderSession>;
  sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult>;
  interruptTurn(threadId: string, turnId?: string): Promise<void>;
  respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void>;
  stopSession(threadId: string): Promise<void>;
  listSessions(): Promise<ProviderSession[]>;
  hasSession(threadId: string): Promise<boolean>;
  stopAll(): Promise<void>;
  streamEvents(): AsyncIterable<CanonicalRuntimeEvent>;
  getPrerequisites?(): Promise<Prerequisite[]>;
  getCommands?(): Promise<
    Array<{
      name: string;
      description: string;
      argumentHint?: string;
      passthrough: boolean;
    }>
  >;
}
