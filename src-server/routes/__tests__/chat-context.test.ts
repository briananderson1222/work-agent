import { describe, expect, test, vi } from 'vitest';
import {
  applyCombinedContextToInput,
  injectConversationFeedbackContext,
} from '../chat-context.js';

vi.mock('../../telemetry/metrics.js', () => ({
  feedbackOps: { add: vi.fn() },
}));

describe('injectConversationFeedbackContext', () => {
  test('appends negative feedback context for the active conversation only', () => {
    const result = injectConversationFeedbackContext(
      [
        {
          conversationId: 'conv-1',
          rating: 'thumbs_down',
          messageIndex: 2,
          reason: 'Too vague',
        },
        {
          conversationId: 'conv-2',
          rating: 'thumbs_down',
          messageIndex: 1,
        },
      ],
      'conv-1',
      'existing rag context',
    );

    expect(result).toContain('existing rag context');
    expect(result).toContain('<conversation_feedback>');
    expect(result).toContain('Message #2 was rated negatively: "Too vague"');
    expect(result).not.toContain('conv-2');
  });

  test('returns the original context when there is no matching negative feedback', () => {
    expect(
      injectConversationFeedbackContext(
        [{ conversationId: 'conv-1', rating: 'thumbs_up', messageIndex: 1 }],
        'conv-1',
        'rag',
      ),
    ).toBe('rag');
  });
});

describe('applyCombinedContextToInput', () => {
  test('prepends combined context to string input', () => {
    expect(
      applyCombinedContextToInput('hello', 'inject', 'rag'),
    ).toBe('inject\n\nrag\n\nhello');
  });

  test('prepends combined context to the first user text part without mutating input', () => {
    const input = [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ];

    const result = applyCombinedContextToInput(input as any, 'inject', 'rag');

    expect(result).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', text: 'inject\n\nrag\n\nhello' }],
      },
    ]);
    expect(input).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);
  });
});
