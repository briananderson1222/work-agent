import crypto from 'node:crypto';
import type {
  OrchestrationCommand,
  OrchestrationSessionDetail,
  OrchestrationSessionSummary,
} from '@stallion-ai/contracts/orchestration';
import type {
  ProviderKind,
  ProviderSession,
} from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type {
  ProviderAdapterShape,
  ProviderTurnStartResult,
} from '../providers/adapter-shape.js';
import type { Prerequisite } from '../providers/provider-contracts.js';
import type { IProviderAdapterRegistry } from '../providers/provider-interfaces.js';
import {
  adapterSessionStartDuration,
  adapterTurnDuration,
  orchestrationCommandsDispatched,
} from '../telemetry/metrics.js';
import type { EventBus } from './event-bus.js';
import type { EventStore, OrchestrationCommandReceipt } from './event-store.js';
import {
  buildOrchestrationSessionSummary,
  projectOrchestrationEventToReadModel,
  recoverOrchestrationSessions,
  resolveOrchestrationAdapterForThread,
  trackOrchestrationSession,
} from './orchestration-session-state.js';

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

  async getProviderModels(provider: ProviderKind): Promise<
    Array<{
      id: string;
      name: string;
      originalId: string;
    }>
  > {
    const adapter = this.options.adapterRegistry.get(provider);
    if (!adapter) return [];
    return (await adapter.listModels?.()) ?? [];
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
      this.trackSession(session);
    }

    return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSessionReadModel(): Promise<OrchestrationSessionSummary[]> {
    this.initialize();
    await this.listSessions();

    const persistedSessions = this.options.eventStore?.readSessions() ?? [];
    const persistedByThread = new Map(
      persistedSessions.map((session) => [session.threadId, session]),
    );
    const threadIds = new Set<string>([
      ...persistedByThread.keys(),
      ...this.sessionReadModel.keys(),
    ]);

    return [...threadIds]
      .map((threadId) => {
        const events = this.options.eventStore?.listEvents(threadId) ?? [];
        return buildOrchestrationSessionSummary({
          persisted: persistedByThread.get(threadId),
          loaded: this.sessionReadModel.get(threadId),
          events: events.map((event) => event.payload),
        });
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listLoadedSessionReadModel(): Promise<OrchestrationSessionSummary[]> {
    const sessions = await this.listSessionReadModel();
    return sessions.filter((session) => session.isLoaded);
  }

  async readSession(
    threadId: string,
  ): Promise<OrchestrationSessionDetail | null> {
    this.initialize();
    await this.listSessions();

    const persistedSessions = this.options.eventStore?.readSessions() ?? [];
    const persisted = persistedSessions.find(
      (session) => session.threadId === threadId,
    );
    const loaded = this.sessionReadModel.get(threadId);
    if (!persisted && !loaded) {
      return null;
    }

    const events = (this.options.eventStore?.listEvents(threadId) ?? []).map(
      (event) => event.payload,
    );

    return {
      session: buildOrchestrationSessionSummary({
        persisted,
        loaded,
        events,
      }),
      events,
    };
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
          const adapter = await resolveOrchestrationAdapterForThread({
            threadId: command.input.threadId,
            threadProviders: this.threadProviders,
            requireAdapter: (provider) => this.requireAdapter(provider),
            adapters: this.options.adapterRegistry.list(),
          });
          const startedAt = performance.now();
          const result = await adapter.sendTurn(command.input);
          adapterTurnDuration.record(performance.now() - startedAt, {
            provider: adapter.provider,
          });
          this.persistReceipt(receipt);
          return result;
        }
        case 'interruptTurn': {
          const adapter = await resolveOrchestrationAdapterForThread({
            threadId: command.threadId,
            threadProviders: this.threadProviders,
            requireAdapter: (provider) => this.requireAdapter(provider),
            adapters: this.options.adapterRegistry.list(),
          });
          await adapter.interruptTurn(command.threadId, command.turnId);
          this.persistReceipt(receipt);
          return;
        }
        case 'respondToRequest': {
          const adapter = await resolveOrchestrationAdapterForThread({
            threadId: command.threadId,
            threadProviders: this.threadProviders,
            requireAdapter: (provider) => this.requireAdapter(provider),
            adapters: this.options.adapterRegistry.list(),
          });
          await adapter.respondToRequest(
            command.threadId,
            command.requestId,
            command.decision,
          );
          this.persistReceipt(receipt);
          return;
        }
        case 'stopSession': {
          const adapter = await resolveOrchestrationAdapterForThread({
            threadId: command.threadId,
            threadProviders: this.threadProviders,
            requireAdapter: (provider) => this.requireAdapter(provider),
            adapters: this.options.adapterRegistry.list(),
          });
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
        projectOrchestrationEventToReadModel({
          event,
          threadProviders: this.threadProviders,
          sessionReadModel: this.sessionReadModel,
          eventStore: this.options.eventStore,
        });
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
    trackOrchestrationSession({
      threadProviders: this.threadProviders,
      sessionReadModel: this.sessionReadModel,
      session,
    });
  }

  private async recoverSessions(): Promise<void> {
    await recoverOrchestrationSessions({
      adapterRegistry: this.options.adapterRegistry,
      eventStore: this.options.eventStore,
      assertAdapterReady: (adapter) => this.assertAdapterReady(adapter),
      trackSession: (session) => this.trackSession(session),
      logger: this.options.logger,
    });
  }
}
