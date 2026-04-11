import { describe, expect, test, vi } from 'vitest';
import {
  mapClaudeSdkMessage,
  mapClaudeSessionState,
} from '../adapters/claude-adapter-events.js';

describe('claude-adapter-events', () => {
  test('maps session state changes into canonical lifecycle events', () => {
    const publish = vi.fn();
    const record = {
      session: {
        provider: 'claude' as const,
        threadId: 'thread-1',
        status: 'connecting' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      lastSessionState: 'idle' as const,
    };

    mapClaudeSdkMessage({
      provider: 'claude',
      record,
      publish,
      message: {
        type: 'system',
        subtype: 'session_state_changed',
        state: 'requires_action',
        uuid: 'msg-1',
        session_id: 'thread-1',
      } as any,
    });

    expect(record.lastSessionState).toBe('requires_action');
    expect(record.session.status).toBe('ready');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'session.state-changed',
        from: 'idle',
        to: 'awaiting-approval',
      }),
    );
  });

  test('maps streaming and result messages into canonical events', () => {
    const publish = vi.fn();
    const record = {
      session: {
        provider: 'claude' as const,
        threadId: 'thread-2',
        status: 'running' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      activeTurnId: 'turn-1',
      lastSessionState: 'running' as const,
    };

    mapClaudeSdkMessage({
      provider: 'claude',
      record,
      publish,
      message: {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'plan' },
        },
        uuid: 'msg-2',
        session_id: 'thread-2',
      } as any,
    });
    mapClaudeSdkMessage({
      provider: 'claude',
      record,
      publish,
      message: {
        type: 'result',
        result: 'done',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
        uuid: 'msg-3',
        session_id: 'thread-2',
      } as any,
    });

    expect(publish.mock.calls.map(([event]) => event.method)).toEqual([
      'content.reasoning-delta',
      'token-usage.updated',
      'turn.completed',
    ]);
    expect(publish.mock.calls[2][0]).toMatchObject({
      method: 'turn.completed',
      finishReason: 'tool-calls',
      outputText: 'done',
    });
  });

  test('maps requires_action to awaiting-approval', () => {
    expect(mapClaudeSessionState('requires_action')).toBe('awaiting-approval');
    expect(mapClaudeSessionState('running')).toBe('running');
  });
});
