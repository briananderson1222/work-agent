import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OrchestrationCommand } from '@stallion-ai/contracts/orchestration';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/contracts/tool';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../../providers/adapter-shape.js';
import type { IProviderAdapterRegistry } from '../../providers/provider-interfaces.js';
import { EventBus } from '../event-bus.js';
import { EventStore } from '../event-store.js';
import { OrchestrationService } from '../orchestration-service.js';

vi.mock('../../telemetry/metrics.js', () => ({
  adapterSessionStartDuration: { record: vi.fn() },
  adapterTurnDuration: { record: vi.fn() },
  orchestrationCommandsDispatched: { add: vi.fn() },
}));

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

async function waitFor<T>(
  read: () => T,
  matches: (value: T) => boolean,
  timeoutMs = 1000,
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = read();
    if (matches(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for test condition');
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: Array<Deferred<IteratorResult<T>>> = [];

  push(value: T) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }
    this.items.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) return { value: queued, done: false };
        const waiter = createDeferred<IteratorResult<T>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

class FakeAdapter implements ProviderAdapterShape {
  readonly metadata;
  readonly sessions = new Map<string, ProviderSession>();
  readonly events = new AsyncQueue<CanonicalRuntimeEvent>();
  readonly prerequisites: Prerequisite[];
  readonly startSession =
    vi.fn<(input: ProviderSessionStartInput) => Promise<ProviderSession>>();
  readonly sendTurn =
    vi.fn<(input: ProviderSendTurnInput) => Promise<ProviderTurnStartResult>>();
  readonly interruptTurn =
    vi.fn<(threadId: string, turnId?: string) => Promise<void>>();
  readonly respondToRequest =
    vi.fn<
      (
        threadId: string,
        requestId: string,
        decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
      ) => Promise<void>
    >();
  readonly stopSession = vi.fn<(threadId: string) => Promise<void>>();

  constructor(
    readonly provider: 'bedrock' | 'claude' | 'codex',
    prerequisites: Prerequisite[] = [],
  ) {
    this.metadata = {
      displayName: `${provider} Runtime`,
      description: `${provider} adapter for tests`,
      capabilities: ['agent-runtime'],
      runtimeId: `${provider}-runtime`,
      builtin: true,
    };
    this.prerequisites = prerequisites;
    this.startSession.mockImplementation(async (input) => {
      const now = new Date().toISOString();
      const session: ProviderSession = {
        provider: this.provider,
        threadId: input.threadId,
        status: 'ready',
        model: input.modelId,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(input.threadId, session);
      return session;
    });
    this.sendTurn.mockImplementation(async (input) => ({
      threadId: input.threadId,
      turnId: `${this.provider}-turn`,
    }));
    this.interruptTurn.mockResolvedValue(undefined);
    this.respondToRequest.mockResolvedValue(undefined);
    this.stopSession.mockImplementation(async (threadId) => {
      this.sessions.delete(threadId);
    });
  }

  async listSessions(): Promise<ProviderSession[]> {
    return [...this.sessions.values()];
  }

  async hasSession(threadId: string): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async stopAll(): Promise<void> {}

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  async getPrerequisites(): Promise<Prerequisite[]> {
    return this.prerequisites;
  }
}

function createRegistry(
  adapters: ProviderAdapterShape[],
): IProviderAdapterRegistry {
  return {
    register() {},
    get(provider) {
      return adapters.find((adapter) => adapter.provider === provider);
    },
    list() {
      return adapters;
    },
  };
}

describe('OrchestrationService', () => {
  let bedrock: FakeAdapter;
  let claude: FakeAdapter;
  let service: OrchestrationService;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'orchestration-service-'));
    bedrock = new FakeAdapter('bedrock');
    claude = new FakeAdapter('claude', [
      {
        key: 'ANTHROPIC_API_KEY',
        name: 'Anthropic API key',
        status: 'configured',
        description: 'Used to access Claude Agent SDK.',
      },
    ]);
    eventBus = new EventBus();
    eventStore = new EventStore(join(tmp, 'orchestration.sqlite'));
    service = new OrchestrationService({
      adapterRegistry: createRegistry([bedrock, claude]),
      eventBus,
      eventStore,
      logger: { debug: vi.fn(), warn: vi.fn() },
    });
  });

  afterEach(() => {
    eventStore.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test('routes commands to the adapter that owns the session thread', async () => {
    const startCommand: OrchestrationCommand = {
      type: 'startSession',
      input: { threadId: 'thread-1', provider: 'claude' },
    };
    const session = await service.dispatch(startCommand);
    expect(session).toMatchObject({
      provider: 'claude',
      threadId: 'thread-1',
    });

    await service.dispatch({
      type: 'sendTurn',
      input: { threadId: 'thread-1', input: 'hello' },
    });
    expect(claude.sendTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      input: 'hello',
    });
    expect(bedrock.sendTurn).not.toHaveBeenCalled();
  });

  test('lists providers with prerequisites and active session counts', async () => {
    await service.dispatch({
      type: 'startSession',
      input: { threadId: 'thread-3', provider: 'claude' },
    });

    const providers = await service.listProviders();
    expect(providers).toEqual([
      {
        provider: 'bedrock',
        prerequisites: [],
        activeSessions: 0,
      },
      {
        provider: 'claude',
        prerequisites: [
          {
            key: 'ANTHROPIC_API_KEY',
            name: 'Anthropic API key',
            status: 'configured',
            description: 'Used to access Claude Agent SDK.',
          },
        ],
        activeSessions: 1,
      },
    ]);
  });

  test('persists adapter events and recovers resumable sessions on startup', async () => {
    eventStore.upsertSession({
      provider: 'claude',
      threadId: 'thread-9',
      status: 'running',
      model: 'claude-sonnet',
      resumeCursor: { cursor: 'resume-1' },
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:05.000Z',
    });

    service.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(claude.startSession).toHaveBeenCalledWith({
      threadId: 'thread-9',
      provider: 'claude',
      modelId: 'claude-sonnet',
      resumeCursor: { cursor: 'resume-1' },
    });

    const event: CanonicalRuntimeEvent = {
      eventId: 'evt-77',
      provider: 'claude',
      threadId: 'thread-9',
      createdAt: '2026-03-28T00:00:06.000Z',
      method: 'session.state-changed',
      sessionId: 'thread-9',
      from: 'idle',
      to: 'running',
    };
    claude.events.push(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(eventStore.listEvents('thread-9')).toEqual([
      expect.objectContaining({ id: 'evt-77', payload: event }),
    ]);
    expect(eventStore.readSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: 'thread-9',
          provider: 'claude',
          status: 'running',
        }),
      ]),
    );
  });

  test('rejects startSession when required prerequisites are missing', async () => {
    const blockedClaude = new FakeAdapter('claude', [
      {
        key: 'ANTHROPIC_API_KEY',
        name: 'ANTHROPIC_API_KEY',
        status: 'missing',
        description: 'Claude credentials',
        id: 'anthropic-api-key',
        category: 'required',
      },
    ]);
    const blockedService = new OrchestrationService({
      adapterRegistry: createRegistry([bedrock, blockedClaude]),
      eventBus,
      eventStore,
      logger: { debug: vi.fn(), warn: vi.fn() },
    });

    await expect(
      blockedService.dispatch({
        type: 'startSession',
        input: { threadId: 'blocked-thread', provider: 'claude' },
      }),
    ).rejects.toThrow(/claude prerequisites missing: ANTHROPIC_API_KEY/i);
    expect(blockedClaude.startSession).not.toHaveBeenCalled();
  });

  test('routes interrupt and approval commands after resolving session ownership dynamically', async () => {
    const codex = new FakeAdapter('codex');
    const routingService = new OrchestrationService({
      adapterRegistry: createRegistry([bedrock, claude, codex]),
      eventBus,
      eventStore,
      logger: { debug: vi.fn(), warn: vi.fn() },
    });
    codex.sessions.set('thread-codex', {
      provider: 'codex',
      threadId: 'thread-codex',
      status: 'running',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    });

    await routingService.dispatch({
      type: 'interruptTurn',
      threadId: 'thread-codex',
      turnId: 'turn-1',
    });
    await routingService.dispatch({
      type: 'respondToRequest',
      threadId: 'thread-codex',
      requestId: 'req-1',
      decision: 'accept',
    });

    expect(codex.interruptTurn).toHaveBeenCalledWith('thread-codex', 'turn-1');
    expect(codex.respondToRequest).toHaveBeenCalledWith(
      'thread-codex',
      'req-1',
      'accept',
    );
  });

  test('fans in adapter events from multiple providers and persists them', async () => {
    service.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const bedrockEvent: CanonicalRuntimeEvent = {
      eventId: 'evt-bedrock',
      provider: 'bedrock',
      threadId: 'thread-bedrock',
      createdAt: '2026-03-28T00:00:00.000Z',
      method: 'session.started',
      sessionId: 'thread-bedrock',
      initialState: 'created',
    };
    const claudeEvent: CanonicalRuntimeEvent = {
      eventId: 'evt-claude',
      provider: 'claude',
      threadId: 'thread-claude',
      createdAt: '2026-03-28T00:00:01.000Z',
      method: 'request.opened',
      requestId: 'req-2',
      requestType: 'approval',
      title: 'Allow Read',
    };

    bedrock.events.push(bedrockEvent);
    claude.events.push(claudeEvent);

    await waitFor(
      () => eventStore.listEvents().map((event) => event.id),
      (eventIds) =>
        eventIds.length === 2 &&
        eventIds[0] === 'evt-bedrock' &&
        eventIds[1] === 'evt-claude',
    );
    expect(eventStore.listEvents()).toEqual([
      expect.objectContaining({ id: 'evt-bedrock', payload: bedrockEvent }),
      expect.objectContaining({ id: 'evt-claude', payload: claudeEvent }),
    ]);
  });

  test('marks persisted sessions closed when resume fails during recovery', async () => {
    claude.startSession.mockRejectedValueOnce(new Error('resume failed'));
    eventStore.upsertSession({
      provider: 'claude',
      threadId: 'thread-closed',
      status: 'running',
      model: 'claude-sonnet',
      resumeCursor: { cursor: 'resume-2' },
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:05.000Z',
    });

    service.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(eventStore.readSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: 'thread-closed',
          provider: 'claude',
          status: 'closed',
        }),
      ]),
    );
  });
});
