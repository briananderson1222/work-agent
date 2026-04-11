import { describe, expect, test, vi } from 'vitest';
vi.mock('../contexts/active-chats-store', () => ({
  activeChatsStore: {
    getSnapshot: () => ({}),
    updateChat: () => undefined,
  },
}));
import { buildAssistantTurnContent, upsertTextPart, upsertToolPart } from '../hooks/orchestration/messageParts';
import { buildOrchestrationSnapshotSyncPlan } from '../hooks/orchestration/snapshotHandlers';

describe('orchestration helpers', () => {
  test('upsertTextPart appends without mutating the original array', () => {
    const parts = [{ type: 'text', content: 'Hello' }];

    const next = upsertTextPart(parts, 'text', ' world');

    expect(next).toEqual([{ type: 'text', content: 'Hello world' }]);
    expect(parts).toEqual([{ type: 'text', content: 'Hello' }]);
  });

  test('upsertToolPart creates and updates the matching tool part', () => {
    const created = upsertToolPart(undefined, 'tool-1', {
      toolName: 'Search',
      args: { query: 'alpha' },
      state: 'running',
    });

    expect(created).toEqual([
      {
        type: 'tool',
        tool: {
          id: 'tool-1',
          name: 'Search',
          args: { query: 'alpha' },
          toolName: 'Search',
          state: 'running',
        },
      },
    ]);

    const updated = upsertToolPart(created, 'tool-1', {
      state: 'completed',
      result: { ok: true },
    });

    expect(updated).toEqual([
      {
        type: 'tool',
        tool: {
          id: 'tool-1',
          name: 'Search',
          args: { query: 'alpha' },
          toolName: 'Search',
          state: 'completed',
          result: { ok: true },
        },
      },
    ]);
  });

  test('buildAssistantTurnContent prefers explicit content, then parts, then fallback text', () => {
    expect(
      buildAssistantTurnContent(
        {
          role: 'assistant',
          content: 'Direct content',
          contentParts: [{ type: 'text', content: 'ignored' }],
        },
        'fallback',
      ),
    ).toBe('Direct content');

    expect(
      buildAssistantTurnContent(
        {
          role: 'assistant',
          content: '',
          contentParts: [
            { type: 'text', content: 'First line' },
            { type: 'reasoning', content: 'Second line' },
          ],
        },
        'fallback',
      ),
    ).toBe('First line\nSecond line');

    expect(
      buildAssistantTurnContent(
        {
          role: 'assistant',
          content: '',
          contentParts: [],
        },
        'fallback',
      ),
    ).toBe('fallback');
  });

  test('buildOrchestrationSnapshotSyncPlan keeps live sessions and flags exited orchestration chats', () => {
    const plan = buildOrchestrationSnapshotSyncPlan(
      {
        sessions: [
          {
            provider: 'claude',
            threadId: 'thread-live',
            status: 'running',
            model: 'sonnet',
          },
        ],
      },
      {
        'thread-live': {
          provider: 'claude',
          orchestrationSessionStarted: true,
          orchestrationStatus: 'running',
        },
        'thread-exited': {
          provider: 'claude',
          orchestrationSessionStarted: true,
          orchestrationStatus: 'running',
        },
        'thread-bedrock': {
          provider: 'bedrock',
          orchestrationSessionStarted: true,
          orchestrationStatus: 'running',
        },
      },
    );

    expect(plan).toEqual({
      sessionUpdates: [
        {
          threadId: 'thread-live',
          updates: {
            provider: 'claude',
            model: 'sonnet',
            orchestrationProvider: 'claude',
            orchestrationModel: 'sonnet',
            orchestrationSessionStarted: true,
            orchestrationStatus: 'running',
            status: 'sending',
          },
        },
      ],
      exitedThreadIds: ['thread-exited'],
    });
  });
});
