import { describe, expect, it, vi } from 'vitest';
import {
  buildConversationTurnPayload,
  mapConversationMessages,
  streamConversationTurn,
} from '../query-domains/chatRuntimeStream';

describe('chatRuntimeStream', () => {
  it('maps conversation messages with tool metadata fallbacks', () => {
    const messages = mapConversationMessages(
      [
        {
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'reasoning', text: 'Thinking' },
            { type: 'file', url: 'file://image', mediaType: 'image/png' },
            { type: 'tool-search', content: 'ran search' },
          ],
          metadata: { timestamp: '2026-01-01T00:00:00Z', traceId: 'trace-1' },
        },
      ],
      {
        search: {
          server: 'builtin',
          toolName: 'Search',
          originalName: 'search',
        },
      },
    );

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: 'Hello\nThinking\nran search',
        timestamp: '2026-01-01T00:00:00Z',
        traceId: 'trace-1',
        contentParts: [
          { type: 'text', content: 'Hello' },
          { type: 'reasoning', content: 'Thinking' },
          {
            type: 'file',
            url: 'file://image',
            mediaType: 'image/png',
            name: 'Image',
          },
          {
            type: 'tool-search',
            content: 'ran search',
            server: 'builtin',
            toolName: 'Search',
            originalName: 'search',
          },
        ],
      },
    ]);
  });

  it('builds attachment-backed chat payloads', () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);

    expect(
      buildConversationTurnPayload({
        conversationId: 'conv-1',
        content: 'Review this',
        title: 'My Chat',
        model: 'test-model',
        projectSlug: 'project-a',
        attachments: [{ data: 'data:image/png;base64,abc', type: 'image/png' }],
      }),
    ).toEqual({
      input: [
        {
          id: 'msg-42',
          role: 'user',
          parts: [
            { type: 'text', text: 'Review this' },
            {
              type: 'file',
              url: 'data:image/png;base64,abc',
              mediaType: 'image/png',
            },
          ],
        },
      ],
      options: {
        conversationId: 'conv-1',
        title: 'My Chat',
        model: 'test-model',
      },
      projectSlug: 'project-a',
    });
  });

  it('accepts conversation-started events when streaming', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"conversation-started","conversationId":"conv-1","title":"Hello"}\n\n' +
              'data: {"type":"finish","finishReason":"stop"}\n\n',
          ),
        );
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body,
      })) as any,
    );

    const onConversationStarted = vi.fn();
    const onStreamEvent = vi.fn(() => ({
      currentTextChunk: '',
      contentParts: [],
      pendingApprovals: new Map(),
      reasoningChunks: [],
      currentReasoningChunk: undefined,
    }));

    const result = await streamConversationTurn({
      agentSlug: 'default',
      content: 'hello',
      onConversationStarted,
      onStreamEvent,
      apiBase: 'http://example.test',
    });

    expect(result.conversationId).toBe('conv-1');
    expect(onConversationStarted).toHaveBeenCalledWith('conv-1', 'Hello');
  });
});
