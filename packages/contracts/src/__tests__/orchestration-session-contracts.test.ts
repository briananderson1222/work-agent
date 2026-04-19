import { describe, expect, test } from 'vitest';
import type {
  OrchestrationSessionDetail,
  OrchestrationSessionSummary,
} from '../orchestration.js';

describe('orchestration session contract shapes', () => {
  test('session summary supports loaded and persisted read-model semantics', () => {
    const summary: OrchestrationSessionSummary = {
      provider: 'claude',
      threadId: 'thread-1',
      status: 'ready',
      model: 'claude-sonnet',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:01.000Z',
      isLoaded: true,
      isPersisted: true,
      eventCount: 2,
      lastEventAt: '2026-04-18T00:00:02.000Z',
      lastEventMethod: 'turn.completed',
    };

    expect(summary).toEqual(
      expect.objectContaining({
        threadId: 'thread-1',
        isLoaded: true,
        isPersisted: true,
        eventCount: 2,
        lastEventMethod: 'turn.completed',
      }),
    );
  });

  test('session detail pairs one summary with canonical event payloads', () => {
    const detail: OrchestrationSessionDetail = {
      session: {
        provider: 'codex',
        threadId: 'thread-2',
        status: 'running',
        createdAt: '2026-04-18T00:00:00.000Z',
        updatedAt: '2026-04-18T00:00:01.000Z',
        isLoaded: true,
        isPersisted: false,
        eventCount: 1,
      },
      events: [
        {
          provider: 'codex',
          threadId: 'thread-2',
          eventId: 'evt-1',
          createdAt: '2026-04-18T00:00:02.000Z',
          method: 'content.text-delta',
          itemId: 'item-1',
          delta: 'hello',
        },
      ],
    };

    expect(detail).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          threadId: 'thread-2',
          isLoaded: true,
          isPersisted: false,
        }),
        events: [
          expect.objectContaining({
            method: 'content.text-delta',
            delta: 'hello',
          }),
        ],
      }),
    );
  });
});
