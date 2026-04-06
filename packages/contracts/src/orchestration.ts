import type {
  ProviderSendTurnInput,
  ProviderSessionStartInput,
} from './provider.js';

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
