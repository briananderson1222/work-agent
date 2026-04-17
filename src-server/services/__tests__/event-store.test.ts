import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EventStore } from '../event-store.js';

vi.mock('../../telemetry/metrics.js', () => ({
  orchestrationEventsPersisted: { add: vi.fn() },
  orchestrationEventPersistDuration: { record: vi.fn() },
}));

describe('EventStore', () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orchestration-store-'));
    store = new EventStore(join(dir, 'orchestration.sqlite'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('appends canonical events with monotonically increasing per-thread sequence numbers', () => {
    const event1 = {
      eventId: 'evt-1',
      provider: 'claude' as const,
      threadId: 'thread-1',
      createdAt: '2026-03-28T00:00:00.000Z',
      method: 'session.started' as const,
      sessionId: 'thread-1',
      initialState: 'created' as const,
    };
    const event2 = {
      eventId: 'evt-2',
      provider: 'claude' as const,
      threadId: 'thread-1',
      createdAt: '2026-03-28T00:00:01.000Z',
      method: 'session.configured' as const,
      sessionId: 'thread-1',
      model: 'claude-sonnet-4-5',
    };

    expect(store.appendEvent(event1)).toBe(1);
    expect(store.appendEvent(event2)).toBe(2);

    expect(store.listEvents('thread-1')).toEqual([
      expect.objectContaining({ id: 'evt-1', sequence: 1, payload: event1 }),
      expect.objectContaining({ id: 'evt-2', sequence: 2, payload: event2 }),
    ]);
  });

  test('round-trips provider session state with resume cursors', () => {
    store.upsertSession({
      provider: 'codex',
      threadId: 'thread-2',
      status: 'running',
      model: 'gpt-5-codex',
      resumeCursor: { codexThreadId: 'codex-thread-9' },
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:10.000Z',
    });

    expect(store.readSessions()).toEqual([
      {
        provider: 'codex',
        threadId: 'thread-2',
        status: 'running',
        model: 'gpt-5-codex',
        resumeCursor: { codexThreadId: 'codex-thread-9' },
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:10.000Z',
      },
    ]);
  });

  test('lists mixed canonical event categories across threads in created order', () => {
    store.appendEvent({
      eventId: 'evt-session',
      provider: 'bedrock',
      threadId: 'thread-a',
      createdAt: '2026-03-28T00:00:00.000Z',
      method: 'session.started',
      sessionId: 'thread-a',
      initialState: 'created',
    });
    store.appendEvent({
      eventId: 'evt-request',
      provider: 'claude',
      threadId: 'thread-b',
      createdAt: '2026-03-28T00:00:01.000Z',
      method: 'request.opened',
      requestId: 'req-1',
      requestType: 'approval',
      title: 'Allow Read',
    });
    store.appendEvent({
      eventId: 'evt-turn',
      provider: 'codex',
      threadId: 'thread-c',
      createdAt: '2026-03-28T00:00:02.000Z',
      method: 'turn.completed',
      turnId: 'turn-1',
      finishReason: 'stop',
      outputText: 'done',
    });

    expect(store.listEvents().map((event) => event.id)).toEqual([
      'evt-session',
      'evt-request',
      'evt-turn',
    ]);
  });

  test('marks sessions closed while preserving their provider identity', () => {
    store.upsertSession({
      provider: 'claude',
      threadId: 'thread-close',
      status: 'running',
      model: 'claude-sonnet',
      resumeCursor: { cursor: 'resume-1' },
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:10.000Z',
    });

    store.markSessionClosed('thread-close');

    expect(store.readSessions()).toEqual([
      expect.objectContaining({
        provider: 'claude',
        threadId: 'thread-close',
        status: 'closed',
      }),
    ]);
  });
});
