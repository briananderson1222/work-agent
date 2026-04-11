import { describe, expect, test, vi } from 'vitest';
import type { ProviderAdapterShape, ProviderSession } from '../../providers/adapter-shape.js';
import {
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

    expect(sessionReadModel.get('thread-2')).toMatchObject({ status: 'closed' });
    expect(eventStore.markSessionClosed).toHaveBeenCalledWith('thread-2', 'claude');
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
});
