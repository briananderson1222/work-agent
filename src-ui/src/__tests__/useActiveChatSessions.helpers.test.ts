import { describe, expect, it } from 'vitest';
import {
  buildOutgoingUserMessage,
  buildPostSendState,
  buildRehydratedInputHistory,
} from '../hooks/useActiveChatSessions.helpers';

describe('useActiveChatSessions helpers', () => {
  it('builds outgoing user messages with text and file parts without mutating the source array', () => {
    const currentMessages = [{ role: 'assistant', content: 'hi' }] as any[];
    const attachments = [
      {
        id: 'file-1',
        name: 'diagram.png',
        type: 'image/png',
        size: 42,
        data: 'data:image/png;base64,abc',
      },
    ];

    const result = buildOutgoingUserMessage(
      currentMessages as any,
      'hello',
      attachments as any,
    );

    expect(result).toEqual({
      messages: [
        { role: 'assistant', content: 'hi' },
        {
          role: 'user',
          content: 'hello',
          contentParts: [
            { type: 'text', content: 'hello' },
            {
              type: 'file',
              url: 'data:image/png;base64,abc',
              mediaType: 'image/png',
              name: 'diagram.png',
            },
          ],
        },
      ],
      contentParts: [
        { type: 'text', content: 'hello' },
        {
          type: 'file',
          url: 'data:image/png;base64,abc',
          mediaType: 'image/png',
          name: 'diagram.png',
        },
      ],
    });

    expect(currentMessages).toEqual([{ role: 'assistant', content: 'hi' }]);
  });

  it('classifies post-send completion state from backend messages and finish reason', () => {
    const toolCalls = buildPostSendState(
      [
        {
          role: 'assistant',
          content: 'done',
          contentParts: [{ type: 'text', content: 'done' }],
          finishReason: 'tool-calls',
        },
      ] as any,
      undefined,
    );

    expect(toolCalls).toEqual({
      messages: [
        {
          role: 'assistant',
          content: 'done',
          contentParts: [{ type: 'text', content: 'done' }],
        },
      ],
      noticeKind: 'tool-calls',
      effectiveFinishReason: 'tool-calls',
    });

    expect(
      buildPostSendState(
        [{ role: 'assistant', content: 'done', contentParts: [] }] as any,
        'length',
      ).noticeKind,
    ).toBe('length');

    expect(
      buildPostSendState(
        [{ role: 'assistant', content: 'done', contentParts: [] }] as any,
        'rate-limit-exceeded',
      ).noticeKind,
    ).toBe('unexpected');
  });

  it('rehydrates input history from user backend messages and slash commands only', () => {
    expect(
      buildRehydratedInputHistory(
        [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Ignored' },
          { role: 'user', content: '/ask status' },
        ] as any,
        ['draft', '/help', '/status'],
      ),
    ).toEqual(['Hello', '/ask status', '/help', '/status']);
  });
});
