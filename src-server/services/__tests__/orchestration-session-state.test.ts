import { describe, expect, test, vi } from 'vitest';
import type {
  ProviderAdapterShape,
  ProviderSession,
} from '../../providers/adapter-shape.js';
import {
  buildAgentRunSummary,
  buildOrchestrationSessionSummary,
  classifyAgentRunFailure,
  isAgentRunRetryEligible,
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

  test('buildAgentRunSummary projects run status and retry metadata from events', () => {
    const run = buildAgentRunSummary({
      persisted: {
        provider: 'codex',
        threadId: 'thread-run',
        status: 'running',
        model: 'gpt-5-codex',
        resumeCursor: { codexThreadId: 'codex-thread-run' },
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:01.000Z',
      },
      events: [
        {
          provider: 'codex',
          threadId: 'thread-run',
          eventId: 'evt-config',
          createdAt: '2026-04-11T00:00:02.000Z',
          method: 'session.configured',
          sessionId: 'thread-run',
          cwd: '/repo',
        } as any,
        {
          provider: 'codex',
          threadId: 'thread-run',
          eventId: 'evt-error',
          createdAt: '2026-04-11T00:00:03.000Z',
          method: 'runtime.error',
          severity: 'error',
          message: 'Runtime offline during sendTurn',
          code: 'runtime_offline',
          retriable: true,
        } as any,
      ],
    });

    expect(run).toEqual(
      expect.objectContaining({
        runId: 'thread-run',
        sessionId: 'thread-run',
        providerId: 'codex',
        source: 'orchestration',
        executionClass: 'unknown',
        status: 'failed',
        cwd: '/repo',
        runtimeThreadId: 'codex-thread-run',
        completedAt: '2026-04-11T00:00:03.000Z',
        failureKind: 'runtime_offline',
        failureMessage: 'Runtime offline during sendTurn',
        retryEligible: true,
        attempt: 1,
        eventCount: 2,
      }),
    );
  });

  test('buildAgentRunSummary reports waiting_for_approval without mutating execution state', () => {
    expect(
      buildAgentRunSummary({
        loaded: {
          provider: 'claude',
          threadId: 'thread-approval',
          status: 'running',
          createdAt: '2026-04-11T00:00:00.000Z',
          updatedAt: '2026-04-11T00:00:01.000Z',
        },
        events: [
          {
            provider: 'claude',
            threadId: 'thread-approval',
            eventId: 'evt-request',
            createdAt: '2026-04-11T00:00:02.000Z',
            method: 'request.opened',
            requestId: 'req-1',
            requestType: 'approval',
            title: 'Allow command',
          } as any,
        ],
      }),
    ).toMatchObject({
      status: 'waiting_for_approval',
      retryEligible: false,
    });
  });

  test('buildAgentRunSummary lets terminal failures override stale open requests', () => {
    expect(
      buildAgentRunSummary({
        loaded: {
          provider: 'codex',
          threadId: 'thread-error',
          status: 'running',
          createdAt: '2026-04-11T00:00:00.000Z',
          updatedAt: '2026-04-11T00:00:01.000Z',
        },
        events: [
          {
            provider: 'codex',
            threadId: 'thread-error',
            eventId: 'evt-request',
            createdAt: '2026-04-11T00:00:02.000Z',
            method: 'request.opened',
            requestId: 'req-1',
            requestType: 'approval',
            title: 'Allow command',
          } as any,
          {
            provider: 'codex',
            threadId: 'thread-error',
            eventId: 'evt-error',
            createdAt: '2026-04-11T00:00:03.000Z',
            method: 'runtime.error',
            severity: 'error',
            message: 'agent failed',
            code: 'agent_error',
          } as any,
        ],
      }),
    ).toMatchObject({
      status: 'failed',
      failureKind: 'agent_error',
      retryEligible: false,
    });
  });

  test('buildAgentRunSummary lets later completion override a recovered runtime error', () => {
    const run = buildAgentRunSummary({
      loaded: {
        provider: 'codex',
        threadId: 'thread-recovered',
        status: 'ready',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:03.000Z',
      },
      events: [
        {
          provider: 'codex',
          threadId: 'thread-recovered',
          eventId: 'evt-error',
          createdAt: '2026-04-11T00:00:01.000Z',
          method: 'runtime.error',
          severity: 'error',
          message: 'Codex runtime error',
          retriable: true,
        } as any,
        {
          provider: 'codex',
          threadId: 'thread-recovered',
          eventId: 'evt-completed',
          createdAt: '2026-04-11T00:00:02.000Z',
          method: 'turn.completed',
          turnId: 'turn-1',
          finishReason: 'stop',
        } as any,
      ],
    });

    expect(run).toMatchObject({
      status: 'completed',
      retryEligible: false,
    });
    expect(run).not.toHaveProperty('failureKind');
    expect(run).not.toHaveProperty('failureMessage');
  });

  test('classifyAgentRunFailure centralizes retry eligibility', () => {
    expect(
      isAgentRunRetryEligible(
        classifyAgentRunFailure({
          method: 'runtime.error',
          provider: 'codex',
          threadId: 'thread-timeout',
          eventId: 'evt-timeout',
          createdAt: '2026-04-11T00:00:00.000Z',
          severity: 'error',
          message: 'operation timeout',
          code: 'timeout',
        }),
      ),
    ).toBe(true);

    expect(
      isAgentRunRetryEligible(
        classifyAgentRunFailure({
          method: 'runtime.error',
          provider: 'codex',
          threadId: 'thread-agent-error',
          eventId: 'evt-agent-error',
          createdAt: '2026-04-11T00:00:00.000Z',
          severity: 'error',
          message: 'agent failed',
          code: 'agent_error',
          retriable: false,
        }),
      ),
    ).toBe(false);

    expect(
      classifyAgentRunFailure({
        method: 'runtime.error',
        provider: 'codex',
        threadId: 'thread-retry',
        eventId: 'evt-retry',
        createdAt: '2026-04-11T00:00:00.000Z',
        severity: 'error',
        message: 'Codex runtime error',
        retriable: true,
      }),
    ).toBe('runtime_recovery');
  });
});
