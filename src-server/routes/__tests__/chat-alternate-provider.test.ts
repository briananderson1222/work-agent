import { describe, expect, test, vi } from 'vitest';

vi.mock('../../services/llm-router.js', () => ({
  createLLMProviderFromConfig: vi.fn(() => ({ id: 'mock-provider' })),
  streamWithProvider: vi.fn(async (_provider, _model, _messages, writer) => {
    await writer.write(
      `data: ${JSON.stringify({ type: 'conversation', conversationId: 'conv-1', title: 'hello' })}\n\n`,
    );
    await writer.write(
      `data: ${JSON.stringify({ type: 'text-delta', textDelta: 'assistant reply' })}\n\n`,
    );
    await writer.write(
      `data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n\n`,
    );
  }),
}));
vi.mock('hono/streaming', () => ({
  stream: async (
    _c: unknown,
    callback: (writer: { write(data: string): Promise<void> }) => Promise<void>,
  ) => {
    await callback({
      write: async () => {},
    });
    return {} as Response;
  },
}));

import {
  buildAlternateProviderMessages,
  streamAlternateProviderChat,
} from '../chat-alternate-provider.js';

vi.mock('../auth.js', () => ({
  getCachedUser: () => ({ alias: 'cached-user' }),
}));

describe('chat-alternate-provider helpers', () => {
  test('buildAlternateProviderMessages combines system prompts, history, and current user text', async () => {
    const messages = await buildAlternateProviderMessages({
      ctx: {
        agentSpecs: new Map([['writer', { prompt: 'Agent prompt' }]]),
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
      input: [
        { role: 'user', parts: [{ type: 'text', text: 'Current input' }] },
      ],
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

  test('persists alternate-provider messages to conversation history', async () => {
    const persistedMessages: unknown[] = [];
    const memoryAdapter = {
      getConversation: vi.fn(async () => null),
      createConversation: vi.fn(async () => undefined),
      addMessage: vi.fn(async (message) => {
        persistedMessages.push(message);
      }),
      getMessages: vi.fn(async () => []),
    };

    const response = await streamAlternateProviderChat({
      c: {
        header: vi.fn(),
        req: { raw: { signal: new AbortController().signal } },
      },
      ctx: {
        agentSpecs: new Map([['default', { prompt: 'Agent prompt' }]]),
        appConfig: { systemPrompt: 'Global prompt' },
        replaceTemplateVariables: (text: string) => text,
        memoryAdapters: new Map([['default', memoryAdapter]]),
      } as any,
      slug: 'default',
      input: 'hello world',
      options: { userId: 'user-1', model: 'llama3.2' },
      injectContext: null,
      ragContext: null,
      resolvedProviderConn: {
        type: 'ollama',
        config: { defaultModel: 'llama3.2' },
      },
    });

    expect(response).toBeTruthy();
    expect(memoryAdapter.createConversation).toHaveBeenCalled();
    expect(memoryAdapter.addMessage).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(persistedMessages)).toContain('hello world');
  });
});
