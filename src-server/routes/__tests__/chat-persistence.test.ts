import { describe, expect, test, vi } from 'vitest';
import {
  createChatConversationId,
  createChatTraceId,
  ensureChatConversation,
  persistTemporaryAgentMessages,
} from '../chat-persistence.js';

describe('chat persistence helpers', () => {
  test('creates conversation and trace ids with the user or conversation prefix', () => {
    expect(createChatConversationId('user-1')).toMatch(/^user-1:/);
    expect(createChatTraceId('conv-1')).toMatch(/^conv-1:/);
  });

  test('creates a conversation when storage has no existing record', async () => {
    const conversationStorage = {
      getConversation: vi.fn().mockResolvedValue(null),
      createConversation: vi.fn().mockResolvedValue(undefined),
    };

    await ensureChatConversation({
      conversationStorage,
      conversationId: 'conv-1',
      userId: 'user-1',
      slug: 'agent-a',
      input: 'A short title',
    });

    expect(conversationStorage.createConversation).toHaveBeenCalledWith({
      id: 'conv-1',
      resourceId: 'agent-a',
      userId: 'user-1',
      title: 'A short title',
      metadata: {},
    });
  });

  test('persists delegation metadata on new child conversations', async () => {
    const conversationStorage = {
      getConversation: vi.fn().mockResolvedValue(null),
      createConversation: vi.fn().mockResolvedValue(undefined),
    };

    await ensureChatConversation({
      conversationStorage,
      conversationId: 'conv-child',
      userId: 'user-1',
      slug: 'agent-a',
      input: 'A short title',
      metadata: {
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'planner',
          rootAgentSlug: 'planner',
        },
      },
    });

    expect(conversationStorage.createConversation).toHaveBeenCalledWith({
      id: 'conv-child',
      resourceId: 'agent-a',
      userId: 'user-1',
      title: 'A short title',
      metadata: {
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'planner',
          rootAgentSlug: 'planner',
        },
      },
    });
  });

  test('persists user and assistant messages for temp agents', async () => {
    const memoryAdapter = {
      addMessage: vi.fn().mockResolvedValue(undefined),
    };

    await persistTemporaryAgentMessages({
      memoryAdapter,
      conversationId: 'conv-1',
      input: 'hello world',
      accumulatedText: 'assistant reply',
      model: 'anthropic.test',
      userId: 'user-1',
    });

    expect(memoryAdapter.addMessage).toHaveBeenCalledTimes(2);
    expect(memoryAdapter.addMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'hello world' }],
      }),
      'user-1',
      'conv-1',
    );
    expect(memoryAdapter.addMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: 'assistant reply' }],
      }),
      'user-1',
      'conv-1',
      { model: 'anthropic.test' },
    );
  });
});
