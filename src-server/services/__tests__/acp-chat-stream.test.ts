import { describe, expect, test } from 'vitest';
import {
  buildACPAgentCompleteEvent,
  buildACPAgentStartEvent,
  buildACPCommandExecutionPayload,
  markACPInterruptedToolCalls,
} from '../acp-chat-stream.js';

describe('buildACPCommandExecutionPayload', () => {
  test('returns null for non-command input', () => {
    expect(buildACPCommandExecutionPayload('hello world')).toBeNull();
  });

  test('builds command payload for slash commands with args', () => {
    expect(buildACPCommandExecutionPayload('/plan ship it')).toEqual({
      cmdName: 'plan',
      cmdInput: 'ship it',
      commandPayload: {
        command: 'Plan',
        input: 'ship it',
      },
    });
  });
});

describe('markACPInterruptedToolCalls', () => {
  test('marks only in-flight tool invocations as interrupted', () => {
    const responseParts = [
      { type: 'tool-invocation', toolCallId: 'call-1', state: 'call' },
      { type: 'tool-invocation', toolCallId: 'call-2', state: 'result' },
      { type: 'text', text: 'done' },
    ] as any[];

    expect(markACPInterruptedToolCalls(responseParts)).toBe(1);
    expect(responseParts).toEqual([
      {
        type: 'tool-invocation',
        toolCallId: 'call-1',
        state: 'error',
        result: 'Tool call interrupted — agent session ended unexpectedly',
      },
      { type: 'tool-invocation', toolCallId: 'call-2', state: 'result' },
      { type: 'text', text: 'done' },
    ]);
  });
});

describe('ACP chat monitoring events', () => {
  test('builds start and completion event payloads', () => {
    const start = buildACPAgentStartEvent({
      conversationId: 'conv-1',
      inputText: 'hello',
      slug: 'kiro-dev',
      timestampMs: 1_700_000_000_000,
      traceId: 'trace-1',
      userId: 'user-1',
    });
    const complete = buildACPAgentCompleteEvent({
      cancelled: false,
      conversationId: 'conv-1',
      inputText: 'hello',
      responseParts: [{ type: 'tool-invocation' }, { type: 'text' }] as any[],
      responseText: 'world',
      slug: 'kiro-dev',
      timestampMs: 1_700_000_000_500,
      traceId: 'trace-1',
      userId: 'user-1',
    });

    expect(start).toEqual({
      type: 'agent-start',
      timestamp: '2023-11-14T22:13:20.000Z',
      timestampMs: 1_700_000_000_000,
      agentSlug: 'kiro-dev',
      conversationId: 'conv-1',
      userId: 'user-1',
      traceId: 'trace-1',
      input: 'hello',
    });
    expect(complete).toEqual({
      type: 'agent-complete',
      timestamp: '2023-11-14T22:13:20.500Z',
      timestampMs: 1_700_000_000_500,
      agentSlug: 'kiro-dev',
      conversationId: 'conv-1',
      userId: 'user-1',
      traceId: 'trace-1',
      reason: 'end_turn',
      inputChars: 5,
      outputChars: 5,
      toolCallCount: 1,
    });
  });
});
