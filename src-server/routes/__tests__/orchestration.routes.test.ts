import { describe, expect, test, vi } from 'vitest';
import { EventBus } from '../../services/event-bus.js';
import { createOrchestrationRoutes } from '../orchestration.js';

async function readStreamUntil(
  stream: ReadableStream<Uint8Array>,
  matcher: (payload: string) => boolean,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
      if (matcher(output)) {
        return output;
      }
    }
  } finally {
    await reader.cancel();
  }

  return output;
}

describe('Orchestration Routes', () => {
  test('GET /providers returns orchestration provider summaries', async () => {
    const service = {
      listProviders: vi.fn().mockResolvedValue([
        {
          provider: 'claude',
          prerequisites: [],
          activeSessions: 1,
        },
      ]),
      listSessions: vi.fn().mockResolvedValue([]),
      dispatch: vi.fn(),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus: new EventBus(),
      logger: { debug: vi.fn() },
    });

    const res = await app.request('/providers');
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: [
        {
          provider: 'claude',
          prerequisites: [],
          activeSessions: 1,
        },
      ],
    });
  });

  test('POST /commands validates and dispatches orchestration commands', async () => {
    const service = {
      listProviders: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
      dispatch: vi.fn().mockResolvedValue({
        provider: 'bedrock',
        threadId: 'thread-1',
        status: 'ready',
      }),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus: new EventBus(),
      logger: { debug: vi.fn() },
    });

    const res = await app.request('/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'startSession',
        input: { threadId: 'thread-1', provider: 'bedrock' },
      }),
    });
    const body = await res.json();

    expect(service.dispatch).toHaveBeenCalledWith({
      type: 'startSession',
      input: { threadId: 'thread-1', provider: 'bedrock' },
    });
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      provider: 'bedrock',
      threadId: 'thread-1',
    });
  });

  test('GET /sessions/read-model and /sessions/loaded expose stable read-model surfaces', async () => {
    const service = {
      listProviders: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
      listSessionReadModel: vi.fn().mockResolvedValue([
        {
          provider: 'claude',
          threadId: 'thread-1',
          status: 'running',
          isLoaded: true,
          isPersisted: true,
          eventCount: 2,
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:01.000Z',
        },
      ]),
      listLoadedSessionReadModel: vi.fn().mockResolvedValue([
        {
          provider: 'claude',
          threadId: 'thread-1',
          status: 'running',
          isLoaded: true,
          isPersisted: true,
          eventCount: 2,
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:01.000Z',
        },
      ]),
      readSession: vi.fn(),
      dispatch: vi.fn(),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus: new EventBus(),
      logger: { debug: vi.fn() },
    });

    const readModelRes = await app.request('/sessions/read-model');
    expect(await readModelRes.json()).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          threadId: 'thread-1',
          isLoaded: true,
          isPersisted: true,
        }),
      ],
    });

    const loadedRes = await app.request('/sessions/loaded');
    expect(await loadedRes.json()).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          threadId: 'thread-1',
          isLoaded: true,
        }),
      ],
    });
  });

  test('GET /sessions/:threadId and /sessions/:threadId/events return detail and event history', async () => {
    const detail = {
      session: {
        provider: 'claude',
        threadId: 'thread-9',
        status: 'ready',
        isLoaded: false,
        isPersisted: true,
        eventCount: 1,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:01.000Z',
      },
      events: [
        {
          provider: 'claude',
          threadId: 'thread-9',
          createdAt: '2026-03-28T00:00:02.000Z',
          eventId: 'evt-9',
          method: 'session.configured',
          sessionId: 'thread-9',
        },
      ],
    };
    const service = {
      listProviders: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
      listSessionReadModel: vi.fn(),
      listLoadedSessionReadModel: vi.fn(),
      readSession: vi.fn().mockResolvedValue(detail),
      dispatch: vi.fn(),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus: new EventBus(),
      logger: { debug: vi.fn() },
    });

    const detailRes = await app.request('/sessions/thread-9');
    expect(await detailRes.json()).toEqual({
      success: true,
      data: detail,
    });

    const eventsRes = await app.request('/sessions/thread-9/events');
    expect(await eventsRes.json()).toEqual({
      success: true,
      data: detail.events,
    });
  });

  test('terminal process routes expose summaries, detail, and cleanup', async () => {
    const terminalService = {
      listProcessSummaries: vi.fn().mockReturnValue([
        {
          kind: 'terminal',
          sessionId: 'project:t1',
          projectSlug: 'project',
          terminalId: 't1',
          cwd: '/tmp/project',
          status: 'running',
          pid: 12345,
          exitCode: null,
          hasRunningSubprocess: true,
          cols: 80,
          rows: 24,
        },
      ]),
      readProcess: vi.fn().mockImplementation((id: string) =>
        id === 'project:t1'
          ? {
              process: {
                kind: 'terminal',
                sessionId: 'project:t1',
                projectSlug: 'project',
                terminalId: 't1',
                cwd: '/tmp/project',
                status: 'running',
                pid: 12345,
                exitCode: null,
                hasRunningSubprocess: true,
                cols: 80,
                rows: 24,
              },
              history: 'npm run dev\n',
            }
          : null,
      ),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const service = {
      listProviders: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
      listSessionReadModel: vi.fn().mockResolvedValue([]),
      listLoadedSessionReadModel: vi.fn().mockResolvedValue([]),
      readSession: vi.fn(),
      dispatch: vi.fn(),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus: new EventBus(),
      logger: { debug: vi.fn() },
      terminalService,
    });

    const listRes = await app.request('/processes/terminals');
    expect(await listRes.json()).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          sessionId: 'project:t1',
          hasRunningSubprocess: true,
        }),
      ],
    });

    const detailRes = await app.request('/processes/terminals/project:t1');
    expect(await detailRes.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        process: expect.objectContaining({ sessionId: 'project:t1' }),
        history: 'npm run dev\n',
      }),
    });

    const closeRes = await app.request('/processes/terminals/project:t1', {
      method: 'DELETE',
    });
    expect(await closeRes.json()).toEqual({
      success: true,
      data: { sessionId: 'project:t1' },
    });
    expect(terminalService.close).toHaveBeenCalledWith('project:t1');
  });

  test('GET /events streams the initial snapshot and subsequent canonical events', async () => {
    const eventBus = new EventBus();
    const service = {
      listProviders: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([
        {
          provider: 'claude',
          threadId: 'thread-1',
          status: 'running',
          model: 'claude-sonnet',
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:01.000Z',
        },
      ]),
      listSessionReadModel: vi.fn().mockResolvedValue([
        {
          provider: 'claude',
          threadId: 'thread-1',
          status: 'running',
          model: 'claude-sonnet',
          isLoaded: true,
          isPersisted: true,
          eventCount: 1,
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:01.000Z',
        },
      ]),
      dispatch: vi.fn(),
    };
    const app = createOrchestrationRoutes(service as any, {
      eventBus,
      logger: { debug: vi.fn() },
    });

    const res = await app.request('/events');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 0));
    eventBus.emit('orchestration:event', {
      event: {
        provider: 'claude',
        threadId: 'thread-1',
        createdAt: '2026-03-28T00:00:02.000Z',
        method: 'request.opened',
        requestId: 'req-1',
        requestType: 'approval',
        title: 'Allow Read',
      },
    });

    const payload = await readStreamUntil(res.body!, (text) => {
      return (
        text.includes('event: orchestration:snapshot') &&
        text.includes('event: orchestration:event')
      );
    });

    expect(payload).toContain('event: orchestration:snapshot');
    expect(payload).toContain('"threadId":"thread-1"');
    expect(payload).toContain('"isLoaded":true');
    expect(payload).toContain('event: orchestration:event');
    expect(payload).toContain('"requestId":"req-1"');
  });
});
