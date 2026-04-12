import { describe, expect, test } from 'vitest';

import {
  buildAnalyticsUsagePath,
  buildChatRequest,
  buildSentMessageResult,
  resolveControlApiBase,
} from '../stallion-control-shared.js';

describe('stallion-control shared helpers', () => {
  test('resolveControlApiBase prefers an explicit base URL', () => {
    expect(
      resolveControlApiBase({
        STALLION_API_BASE: 'https://stallion.internal',
        STALLION_PORT: '4111',
      }),
    ).toBe('https://stallion.internal');
  });

  test('resolveControlApiBase falls back to loopback plus port', () => {
    expect(resolveControlApiBase({ STALLION_PORT: '4111' })).toBe(
      'http://127.0.0.1:4111',
    );
  });

  test('buildAnalyticsUsagePath omits an empty query string', () => {
    expect(buildAnalyticsUsagePath()).toBe('/api/analytics/usage');
  });

  test('buildAnalyticsUsagePath includes both date filters', () => {
    expect(buildAnalyticsUsagePath('2026-04-01', '2026-04-11')).toBe(
      '/api/analytics/usage?from=2026-04-01&to=2026-04-11',
    );
  });

  test('buildChatRequest keeps the conversation options shape stable', () => {
    expect(buildChatRequest('hello', 'conv-123')).toEqual({
      input: 'hello',
      options: { conversationId: 'conv-123' },
    });
  });

  test('buildChatRequest carries hidden delegation metadata when present', () => {
    expect(
      buildChatRequest('hello', 'conv-123', {
        userId: 'user-1',
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'planner',
          parentConversationId: 'conv-parent',
          rootAgentSlug: 'planner',
          rootConversationId: 'conv-parent',
        },
      }),
    ).toEqual({
      input: 'hello',
      options: {
        conversationId: 'conv-123',
        userId: 'user-1',
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'planner',
          parentConversationId: 'conv-parent',
          rootAgentSlug: 'planner',
          rootConversationId: 'conv-parent',
        },
      },
    });
  });

  test('buildSentMessageResult returns the MCP text payload shape', () => {
    expect(buildSentMessageResult('writer', 'conv-123')).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              conversationId: 'conv-123',
              agent: 'writer',
              message: 'Message sent (non-blocking)',
            },
            null,
            2,
          ),
        },
      ],
    });
  });
});
