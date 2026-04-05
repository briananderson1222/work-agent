import crypto from 'node:crypto';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  CanonicalRuntimeEvent,
  RequestResolvedEvent,
} from '@stallion-ai/contracts/runtime-events';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class AsyncEventQueue implements AsyncIterable<CanonicalRuntimeEvent> {
  private items: CanonicalRuntimeEvent[] = [];
  private waiters: Array<Deferred<IteratorResult<CanonicalRuntimeEvent>>> = [];

  push(event: CanonicalRuntimeEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    this.items.push(event);
  }

  [Symbol.asyncIterator](): AsyncIterator<CanonicalRuntimeEvent> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) return { value: queued, done: false };
        const waiter = createDeferred<IteratorResult<CanonicalRuntimeEvent>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

export interface BedrockAdapterCallbacks {
  startSession?(
    input: ProviderSessionStartInput,
  ): Promise<Partial<ProviderSession> | undefined>;
  sendTurn?(
    input: ProviderSendTurnInput,
  ): Promise<
    (Partial<ProviderTurnStartResult> & { outputText?: string }) | undefined
  >;
  interruptTurn?(threadId: string, turnId?: string): Promise<void>;
  respondToRequest?(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void>;
  stopSession?(threadId: string): Promise<void>;
  stopAll?(): Promise<void>;
}

export class BedrockAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'bedrock';

  private sessions = new Map<string, ProviderSession>();
  private readonly events = new AsyncEventQueue();

  constructor(private readonly callbacks: BedrockAdapterCallbacks = {}) {}

  async startSession(
    input: ProviderSessionStartInput,
  ): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const callbackResult = await this.callbacks.startSession?.(input);
    const session: ProviderSession = {
      provider: this.provider,
      threadId: input.threadId,
      status: callbackResult?.status ?? 'ready',
      model: callbackResult?.model ?? input.modelId,
      resumeCursor: callbackResult?.resumeCursor ?? input.resumeCursor,
      createdAt: callbackResult?.createdAt ?? now,
      updatedAt: callbackResult?.updatedAt ?? now,
    };

    this.sessions.set(session.threadId, session);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: session.threadId,
      createdAt: now,
      method: 'session.started',
      sessionId: session.threadId,
      initialState: 'created',
      metadata: {
        cwd: input.cwd,
      },
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: session.threadId,
      createdAt: now,
      method: 'session.configured',
      sessionId: session.threadId,
      model: session.model,
      cwd: input.cwd,
      metadata: input.modelOptions,
    });

    return session;
  }

  async sendTurn(
    input: ProviderSendTurnInput,
  ): Promise<ProviderTurnStartResult> {
    const session = this.sessions.get(input.threadId);
    if (!session) {
      throw new Error(
        `Bedrock adapter cannot send turn for missing session: ${input.threadId}`,
      );
    }

    const now = new Date().toISOString();
    const turnId = crypto.randomUUID();

    this.updateSession(input.threadId, {
      status: 'running',
      updatedAt: now,
      model: input.modelId ?? session.model,
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      method: 'session.state-changed',
      sessionId: input.threadId,
      from: 'idle',
      to: 'running',
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      turnId,
      method: 'turn.started',
      prompt: input.input,
    });

    const callbackResult = await this.callbacks.sendTurn?.(input);
    if (callbackResult?.outputText) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        turnId,
        itemId: crypto.randomUUID(),
        method: 'content.text-delta',
        delta: callbackResult.outputText,
      });
    }

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      turnId,
      method: 'turn.completed',
      finishReason: callbackResult?.outputText ? 'stop' : 'other',
      outputText: callbackResult?.outputText,
    });
    this.updateSession(input.threadId, {
      status: 'ready',
      updatedAt: new Date().toISOString(),
      resumeCursor: callbackResult?.resumeCursor ?? session.resumeCursor,
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'session.state-changed',
      sessionId: input.threadId,
      from: 'running',
      to: 'idle',
    });

    return {
      threadId: input.threadId,
      turnId: callbackResult?.turnId ?? turnId,
      resumeCursor: callbackResult?.resumeCursor,
    };
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<void> {
    await this.callbacks.interruptTurn?.(threadId, turnId);
    if (this.sessions.has(threadId)) {
      this.updateSession(threadId, {
        status: 'ready',
        updatedAt: new Date().toISOString(),
      });
      if (turnId) {
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId,
          createdAt: new Date().toISOString(),
          turnId,
          method: 'turn.aborted',
          reason: 'interrupted',
        });
      }
    }
  }

  async respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void> {
    await this.callbacks.respondToRequest?.(threadId, requestId, decision);
    const statusByDecision: Record<
      RequestResolvedEvent['status'] | 'acceptForSession',
      RequestResolvedEvent['status']
    > = {
      approved: 'approved',
      denied: 'denied',
      cancelled: 'cancelled',
      expired: 'expired',
      acceptForSession: 'approved',
    };
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: new Date().toISOString(),
      requestId,
      method: 'request.resolved',
      status:
        decision === 'accept'
          ? statusByDecision.approved
          : decision === 'acceptForSession'
            ? statusByDecision.acceptForSession
            : decision === 'decline'
              ? statusByDecision.denied
              : statusByDecision.cancelled,
    });
  }

  async stopSession(threadId: string): Promise<void> {
    await this.callbacks.stopSession?.(threadId);
    const session = this.sessions.get(threadId);
    if (!session) return;
    this.sessions.delete(threadId);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: new Date().toISOString(),
      method: 'session.exited',
      sessionId: threadId,
      reason: 'stopped',
    });
  }

  async listSessions(): Promise<ProviderSession[]> {
    return [...this.sessions.values()];
  }

  async hasSession(threadId: string): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async stopAll(): Promise<void> {
    await this.callbacks.stopAll?.();
    const threadIds = [...this.sessions.keys()];
    await Promise.all(threadIds.map((threadId) => this.stopSession(threadId)));
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }

  private updateSession(
    threadId: string,
    updates: Partial<ProviderSession>,
  ): void {
    const current = this.sessions.get(threadId);
    if (!current) return;
    this.sessions.set(threadId, { ...current, ...updates });
  }
}
