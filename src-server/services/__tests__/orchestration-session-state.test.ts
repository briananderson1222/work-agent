import { describe, expect, test, vi } from 'vitest';
import type {
  ProviderAdapterShape,
  ProviderSession,
} from '../../providers/adapter-shape.js';
import {
  buildOrchestrationSessionSummary,
  projectOrchestrationEventToReadModel,
  recoverOrchestrationSessions,
  resolveOrchestrationAdapterForThread,
  trackOrchestrationSession,
} from '../orchestration-session-state.js';

describe('orchestration-session-state', () => {
  test('resolveOrchestrationAdapterForThread caches discovered ownership', async () => {
    const threadProviders = new Map<string, 'bedrock' | 'claude' | 'codex'>();
    const bedrock = {
      provider: 'bedrock',
      hasSession: vi.fn().mockResolvedValue(false),
    } as unknown as ProviderAdapterShape;
    const claude = {
      provider: 'claude',
      hasSession: vi.fn().mockResolvedValue(true),
    } as unknown as ProviderAdapterShape;

    const adapter = await resolveOrchestrationAdapterForThread({
      threadId: 'thread-1',
      threadProviders,
      requireAdapter: (provider) => {
        if (provider === 'claude') return claude;
        return bedrock;
      },
      adapters: [bedrock, claude],
    });

    expect(adapter).toBe(claude);
    expect(threadProviders.get('thread-1')).toBe('claude');
  });

  test('projectOrchestrationEventToReadModel persists closed sessions', () => {
    const threadProviders = new Map<string, 'bedrock' | 'claude' | 'codex'>();
    const sessionReadModel = new Map<string, ProviderSession>();
    const eventStore = {
      upsertSession: vi.fn(),
      markSessionClosed: vi.fn(),
    } as any;

    trackOrchestrationSession({
      threadProviders,
      sessionReadModel,
      session: {
        provider: 'claude',
        threadId: 'thread-2',
        status: 'running',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
      },
    });

    projectOrchestrationEventToReadModel({
      event: {
        provider: 'claude',
        threadId: 'thread-2',
        method: 'session.exited',
        createdAt: '2026-04-11T00:00:05.000Z',
      } as any,
      threadProviders,
      sessionReadModel,
      eventStore,
    });

    expect(sessionReadModel.get('thread-2')).toMatchObject({
      status: 'closed',
    });
    expect(eventStore.markSessionClosed).toHaveBeenCalledWith(
      'thread-2',
      'claude',
    );
    expect(eventStore.upsertSession).not.toHaveBeenCalled();
  });

  test('recoverOrchestrationSessions restarts persisted sessions and preserves createdAt', async () => {
    const recovered: ProviderSession[] = [];
    const adapter = {
      provider: 'claude',
      startSession: vi.fn().mockResolvedValue({
        provider: 'claude',
        threadId: 'thread-3',
        status: 'ready',
        model: 'sonnet',
        createdAt: '2026-04-11T01:00:00.000Z',
        updatedAt: '2026-04-11T01:00:00.000Z',
      }),
    } as unknown as ProviderAdapterShape;
    const eventStore = {
      readSessions: vi.fn().mockReturnValue([
        {
          provider: 'claude',
          threadId: 'thread-3',
          status: 'running',
          model: 'sonnet',
          createdAt: '2026-04-10T23:00:00.000Z',
          updatedAt: '2026-04-11T00:00:00.000Z',
        },
      ]),
      upsertSession: vi.fn(),
      markSessionClosed: vi.fn(),
    } as any;

    await recoverOrchestrationSessions({
      adapterRegistry: {
        get: (provider) => (provider === 'claude' ? adapter : undefined),
        list: () => [adapter],
        register() {},
      },
      eventStore,
      assertAdapterReady: async () => {},
      trackSession: (session) => {
        recovered.push(session);
      },
      logger: { warn: vi.fn() },
    });

    expect(adapter.startSession).toHaveBeenCalledWith({
      threadId: 'thread-3',
      provider: 'claude',
      modelId: 'sonnet',
      resumeCursor: undefined,
    });
    expect(recovered).toEqual([
      expect.objectContaining({
        threadId: 'thread-3',
        createdAt: '2026-04-10T23:00:00.000Z',
      }),
    ]);
    expect(eventStore.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-3',
        createdAt: '2026-04-10T23:00:00.000Z',
      }),
    );
  });

  test('recoverOrchestrationSessions leaves sessions recoverable when adapter prerequisites are not ready', async () => {
    const eventStore = {
      readSessions: vi.fn().mockReturnValue([
        {
          provider: 'claude',
          threadId: 'thread-5',
          status: 'running',
          model: 'sonnet',
          createdAt: '2026-04-10T23:00:00.000Z',
          updatedAt: '2026-04-11T00:00:00.000Z',
        },
      ]),
      upsertSession: vi.fn(),
      markSessionClosed: vi.fn(),
    } as any;
    const adapter = {
      provider: 'claude',
      startSession: vi.fn(),
    } as unknown as ProviderAdapterShape;
    const logger = { warn: vi.fn() };

    await recoverOrchestrationSessions({
      adapterRegistry: {
        get: (provider) => (provider === 'claude' ? adapter : undefined),
        list: () => [adapter],
        register() {},
      },
      eventStore,
      assertAdapterReady: async () => {
        throw new Error('ollama not ready yet');
      },
      trackSession: vi.fn(),
      logger,
    });

    expect(adapter.startSession).not.toHaveBeenCalled();
    expect(eventStore.markSessionClosed).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Provider session not ready for recovery yet',
      expect.objectContaining({
        provider: 'claude',
        threadId: 'thread-5',
      }),
    );
  });

  test('buildOrchestrationSessionSummary merges persisted and loaded state with event metadata', () => {
    expect(
      buildOrchestrationSessionSummary({
        persisted: {
          provider: 'claude',
          threadId: 'thread-4',
          status: 'ready',
          model: 'claude-sonnet',
          createdAt: '2026-04-11T00:00:00.000Z',
          updatedAt: '2026-04-11T00:00:01.000Z',
        },
        loaded: {
          provider: 'claude',
          threadId: 'thread-4',
          status: 'running',
          model: 'claude-sonnet',
          createdAt: '2026-04-11T00:00:00.000Z',
          updatedAt: '2026-04-11T00:00:03.000Z',
        },
        events: [
          {
            provider: 'claude',
            threadId: 'thread-4',
            eventId: 'evt-1',
            createdAt: '2026-04-11T00:00:02.000Z',
            method: 'turn.started',
            turnId: 'turn-1',
          } as any,
          {
            provider: 'claude',
            threadId: 'thread-4',
            eventId: 'evt-2',
            createdAt: '2026-04-11T00:00:04.000Z',
            method: 'turn.completed',
            turnId: 'turn-1',
          } as any,
        ],
      }),
    ).toEqual({
      provider: 'claude',
      threadId: 'thread-4',
      status: 'running',
      model: 'claude-sonnet',
      createdAt: '2026-04-11T00:00:00.000Z',
      updatedAt: '2026-04-11T00:00:03.000Z',
      isLoaded: true,
      isPersisted: true,
      eventCount: 2,
      lastEventAt: '2026-04-11T00:00:04.000Z',
      lastEventMethod: 'turn.completed',
    });
  });
});
