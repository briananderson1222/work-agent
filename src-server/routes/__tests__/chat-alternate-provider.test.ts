import { describe, expect, test, vi } from 'vitest';
import { buildAlternateProviderMessages } from '../chat-alternate-provider.js';

vi.mock('../auth.js', () => ({
  getCachedUser: () => ({ alias: 'cached-user' }),
}));

describe('chat-alternate-provider helpers', () => {
  test('buildAlternateProviderMessages combines system prompts, history, and current user text', async () => {
    const messages = await buildAlternateProviderMessages({
      ctx: {
        agentSpecs: new Map([
          ['writer', { prompt: 'Agent prompt' }],
        ]),
        appConfig: { systemPrompt: 'Global prompt' },
        replaceTemplateVariables: (text: string) => text,
        memoryAdapters: new Map([
          [
            'writer',
            {
              getMessages: vi.fn(async () => [
                {
                  role: 'assistant',
                  parts: [{ type: 'text', text: 'Previous reply' }],
                },
              ]),
            },
          ],
        ]),
      } as any,
      slug: 'writer',
      input: [{ role: 'user', parts: [{ type: 'text', text: 'Current input' }] }],
      options: { conversationId: 'conv-1' },
      injectContext: 'Inject block',
      ragContext: 'Rag block',
    });

    expect(messages).toEqual([
      {
        role: 'system',
        content: 'Inject block\n\nRag block\n\nGlobal prompt\n\nAgent prompt',
      },
      {
        role: 'assistant',
        content: 'Previous reply',
      },
      {
        role: 'user',
        content: 'Current input',
      },
    ]);
  });
});
