import crypto from 'node:crypto';
import type { OrchestrationCommand } from '@stallion-ai/contracts/orchestration';
import type {
  ProviderKind,
  ProviderSession,
} from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type {
  ProviderAdapterShape,
  ProviderTurnStartResult,
} from '../providers/adapter-shape.js';
import type { IProviderAdapterRegistry } from '../providers/provider-interfaces.js';
import type { Prerequisite } from '../providers/provider-contracts.js';
import {
  adapterSessionStartDuration,
  adapterTurnDuration,
  orchestrationCommandsDispatched,
} from '../telemetry/metrics.js';
import type { EventBus } from './event-bus.js';
import type { EventStore, OrchestrationCommandReceipt } from './event-store.js';

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

export interface OrchestrationProviderSummary {
  provider: ProviderKind;
  prerequisites: Prerequisite[];
  activeSessions: number;
}

interface OrchestrationServiceOptions {
  adapterRegistry: IProviderAdapterRegistry;
  eventBus: EventBus;
  eventStore?: EventStore;
  logger: {
    debug(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}

export class OrchestrationService {
  private readonly events = new AsyncEventQueue();
  private readonly threadProviders = new Map<string, ProviderKind>();
  private readonly sessionReadModel = new Map<string, ProviderSession>();
  private started = false;

  constructor(private readonly options: OrchestrationServiceOptions) {}

  initialize(): void {
    if (this.started) return;
    this.started = true;

    for (const adapter of this.options.adapterRegistry.list()) {
      void this.consumeAdapterEvents(adapter);
    }

    void this.recoverSessions();
  }

  async listProviders(): Promise<OrchestrationProviderSummary[]> {
    this.initialize();
    const providers = await Promise.all(
      this.options.adapterRegistry.list().map(async (adapter) => {
        const [sessions, prerequisites] = await Promise.all([
          adapter.listSessions(),
          this.readPrerequisites(adapter),
        ]);
        for (const session of sessions) {
          this.threadProviders.set(session.threadId, adapter.provider);
        }
        return {
          provider: adapter.provider,
          prerequisites,
          activeSessions: sessions.length,
        };
      }),
    );

    return providers.sort((a, b) => a.provider.localeCompare(b.provider));
  }

  async getProviderCommands(provider: ProviderKind): Promise<
    Array<{
      name: string;
      description: string;
      argumentHint?: string;
      passthrough: boolean;
    }>
  > {
    const adapter = this.options.adapterRegistry.get(provider);
    if (!adapter) return [];
    return (await adapter.getCommands?.()) ?? [];
  }

  async listSessions(): Promise<ProviderSession[]> {
    this.initialize();
    const sessions = (
      await Promise.all(
        this.options.adapterRegistry
          .list()
          .map((adapter) => adapter.listSessions()),
      )
    ).flat();

    for (const session of sessions) {
      this.threadProviders.set(session.threadId, session.provider);
    }

    return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async dispatch(
    command: OrchestrationCommand,
  ): Promise<ProviderSession | ProviderTurnStartResult | undefined> {
    this.initialize();
    const receipt: OrchestrationCommandReceipt = {
      commandId: crypto.randomUUID(),
      threadId: this.commandThreadId(command),
      commandType: command.type,
      status: 'accepted',
      createdAt: new Date().toISOString(),
    };
    orchestrationCommandsDispatched.add(1, {
      type: command.type,
      provider: this.commandProvider(command) ?? 'unknown',
    });

    try {
      switch (command.type) {
        case 'startSession': {
          const adapter = this.requireAdapter(command.input.provider);
          await this.assertAdapterReady(adapter);
          const startedAt = performance.now();
          const session = await adapter.startSession(command.input);
          adapterSessionStartDuration.record(performance.now() - startedAt, {
            provider: adapter.provider,
          });
          this.trackSession(session);
          this.options.eventStore?.upsertSession(session);
          this.persistReceipt(receipt);
          return session;
        }
        case 'sendTurn': {
          const adapter = await this.resolveAdapterForThread(
            command.input.threadId,
          );
          const startedAt = performance.now();
          const result = await adapter.sendTurn(command.input);
          adapterTurnDuration.record(performance.now() - startedAt, {
            provider: adapter.provider,
          });
          this.persistReceipt(receipt);
          return result;
        }
        case 'interruptTurn': {
          const adapter = await this.resolveAdapterForThread(command.threadId);
          await adapter.interruptTurn(command.threadId, command.turnId);
          this.persistReceipt(receipt);
          return;
        }
        case 'respondToRequest': {
          const adapter = await this.resolveAdapterForThread(command.threadId);
          await adapter.respondToRequest(
            command.threadId,
            command.requestId,
            command.decision,
          );
          this.persistReceipt(receipt);
          return;
        }
        case 'stopSession': {
          const adapter = await this.resolveAdapterForThread(command.threadId);
          await adapter.stopSession(command.threadId);
          this.threadProviders.delete(command.threadId);
          this.sessionReadModel.delete(command.threadId);
          this.options.eventStore?.markSessionClosed(
            command.threadId,
            adapter.provider,
          );
          this.persistReceipt(receipt);
          return;
        }
      }
    } catch (error) {
      this.persistReceipt({ ...receipt, status: 'failed' });
      throw error;
    }
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    this.initialize();
    return this.events;
  }

  private async consumeAdapterEvents(
    adapter: ProviderAdapterShape,
  ): Promise<void> {
    try {
      for await (const event of adapter.streamEvents()) {
        this.threadProviders.set(event.threadId, event.provider);
        this.projectEventToReadModel(event);
        this.options.eventStore?.appendEvent(event);
        this.events.push(event);
        this.options.eventBus.emit('orchestration:event', { event });
      }
    } catch (error) {
      this.options.logger.warn('Provider adapter event stream stopped', {
        provider: adapter.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async readPrerequisites(
    adapter: ProviderAdapterShape,
  ): Promise<Prerequisite[]> {
    if (!adapter.getPrerequisites) return [];
    try {
      return await adapter.getPrerequisites();
    } catch (error) {
      this.options.logger.warn('Failed to read adapter prerequisites', {
        provider: adapter.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async assertAdapterReady(
    adapter: ProviderAdapterShape,
  ): Promise<void> {
    const prerequisites = await this.readPrerequisites(adapter);
    const missing = prerequisites.filter(
      (item) =>
        item.category === 'required' &&
        (item.status === 'missing' || item.status === 'error'),
    );

    if (missing.length === 0) {
      return;
    }

    throw new Error(
      `${adapter.provider} prerequisites missing: ${missing
        .map((item) => item.name)
        .join(', ')}`,
    );
  }

  private requireAdapter(provider: ProviderKind): ProviderAdapterShape {
    const adapter = this.options.adapterRegistry.get(provider);
    if (!adapter) {
      throw new Error(`Provider adapter not registered: ${provider}`);
    }
    return adapter;
  }

  private async resolveAdapterForThread(
    threadId: string,
  ): Promise<ProviderAdapterShape> {
    const knownProvider = this.threadProviders.get(threadId);
    if (knownProvider) {
      return this.requireAdapter(knownProvider);
    }

    for (const adapter of this.options.adapterRegistry.list()) {
      if (await adapter.hasSession(threadId)) {
        this.threadProviders.set(threadId, adapter.provider);
        return adapter;
      }
    }

    throw new Error(`No provider session found for thread: ${threadId}`);
  }

  private commandProvider(command: OrchestrationCommand): ProviderKind | null {
    if (command.type === 'startSession') {
      return command.input.provider;
    }
    if (command.type === 'sendTurn') {
      return this.threadProviders.get(command.input.threadId) ?? null;
    }
    return this.threadProviders.get(command.threadId) ?? null;
  }

  private commandThreadId(command: OrchestrationCommand): string {
    if ('input' in command) return command.input.threadId;
    return command.threadId;
  }

  private persistReceipt(receipt: OrchestrationCommandReceipt): void {
    this.options.eventStore?.appendCommandReceipt(receipt);
  }

  private trackSession(session: ProviderSession): void {
    this.threadProviders.set(session.threadId, session.provider);
    this.sessionReadModel.set(session.threadId, session);
  }

  private projectEventToReadModel(event: CanonicalRuntimeEvent): void {
    const existing = this.sessionReadModel.get(event.threadId);
    const baseSession: ProviderSession = existing ?? {
      provider: event.provider,
      threadId: event.threadId,
      status: 'ready',
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    let nextSession: ProviderSession | null = baseSession;

    switch (event.method) {
      case 'session.started':
        nextSession = {
          ...baseSession,
          provider: event.provider,
          status: 'connecting',
          createdAt: baseSession.createdAt ?? event.createdAt,
          updatedAt: event.createdAt,
        };
        break;
      case 'session.configured':
        nextSession = {
          ...baseSession,
          status: baseSession.status === 'closed' ? 'closed' : 'ready',
          model: event.model ?? baseSession.model,
          updatedAt: event.createdAt,
        };
        break;
      case 'session.state-changed':
        nextSession = {
          ...baseSession,
          status: this.mapSessionState(event.to),
          updatedAt: event.createdAt,
        };
        break;
      case 'session.exited':
        nextSession = {
          ...baseSession,
          status: 'closed',
          updatedAt: event.createdAt,
        };
        break;
      default:
        nextSession = existing
          ? { ...existing, updatedAt: event.createdAt }
          : null;
        break;
    }

    if (!nextSession) return;
    this.trackSession(nextSession);
    if (nextSession.status === 'closed') {
      this.options.eventStore?.markSessionClosed(
        nextSession.threadId,
        nextSession.provider,
      );
      return;
    }
    this.options.eventStore?.upsertSession(nextSession);
  }

  private mapSessionState(state: string): ProviderSession['status'] {
    if (state === 'running') return 'running';
    if (state === 'errored') return 'error';
    if (state === 'exited') return 'closed';
    return 'ready';
  }

  private async recoverSessions(): Promise<void> {
    const persistedSessions = this.options.eventStore?.readSessions() ?? [];
    for (const session of persistedSessions) {
      if (session.status === 'closed') continue;
      const adapter = this.options.adapterRegistry.get(session.provider);
      if (!adapter) continue;
      try {
        await this.assertAdapterReady(adapter);
        const recovered = await adapter.startSession({
          threadId: session.threadId,
          provider: session.provider,
          modelId: session.model,
          resumeCursor: session.resumeCursor,
        });
        this.trackSession({
          ...recovered,
          createdAt: session.createdAt,
        });
        this.options.eventStore?.upsertSession({
          ...recovered,
          createdAt: session.createdAt,
        });
      } catch (error) {
        this.options.logger.warn('Failed to recover provider session', {
          provider: session.provider,
          threadId: session.threadId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.options.eventStore?.markSessionClosed(
          session.threadId,
          session.provider,
        );
      }
    }
  }
}
