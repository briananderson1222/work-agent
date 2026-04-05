import type {
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite, ProviderKind } from '@stallion-ai/shared';

export type {
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '@stallion-ai/contracts/provider';
export type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';

export interface ProviderAdapterShape {
  readonly provider: ProviderKind;

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
}
