import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createACPConversationTitle,
  resolveACPChatSession,
} from '../acp-chat-session.js';

describe('resolveACPChatSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T18:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  test('builds identity and prompt content for text input', () => {
    const session = resolveACPChatSession({
      slug: 'kiro-dev',
      input: 'hello world',
      options: {},
      baseCwd: '/repo',
      resolvedAlias: 'brian',
    });

    expect(session.userId).toBe('agent:kiro-dev:user:brian');
    expect(session.isNewConversation).toBe(true);
    expect(session.conversationId).toMatch(
      /^agent:kiro-dev:user:brian:1775844000000:[a-z0-9]+$/,
    );
    expect(session.inputText).toBe('hello world');
    expect(session.promptContent).toEqual([
      { type: 'text', text: 'hello world' },
    ]);
  });

  test('parses ui-message parts and prepends cwd context', () => {
    const session = resolveACPChatSession({
      slug: 'kiro-dev',
      input: [
        {
          id: 'msg_1',
          role: 'user',
          parts: [
            { type: 'text', text: 'inspect this' },
            {
              type: 'file',
              url: 'data:image/png;base64,abc123',
              mediaType: 'image/png',
            },
            { type: 'text', text: 'and report back' },
          ],
        },
      ],
      options: { conversationId: 'existing-conversation' },
      context: { cwd: '/repo/packages/sdk' },
      baseCwd: '/repo',
      resolvedAlias: 'brian',
    });

    expect(session.isNewConversation).toBe(false);
    expect(session.conversationId).toBe('existing-conversation');
    expect(session.inputText).toBe('inspect this\nand report back');
    expect(session.promptContent).toEqual([
      {
        type: 'text',
        text: '[Working directory: /repo/packages/sdk]',
      },
      { type: 'text', text: 'inspect this' },
      { type: 'image', data: 'abc123', mimeType: 'image/png' },
      { type: 'text', text: 'and report back' },
    ]);
  });
});

describe('createACPConversationTitle', () => {
  test('prefers explicit titles and truncates long prompts', () => {
    expect(createACPConversationTitle('short', 'Explicit Title')).toBe(
      'Explicit Title',
    );
    expect(
      createACPConversationTitle(
        'This is a very long ACP prompt that should be trimmed to a short title',
      ),
    ).toBe('This is a very long ACP prompt that should be trim...');
  });
});
