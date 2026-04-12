import { getCachedUser } from './auth.js';
import type { ChatMessage } from './chat-request-preparation.js';
import { extractChatUserText } from './chat-request-preparation.js';

export function createChatConversationId(userId: string): string {
  return `${userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
}

export function createChatTraceId(conversationId: string): string {
  return `${conversationId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
}

export async function ensureChatConversation(options: {
  conversationStorage: {
    getConversation(id: string): Promise<any>;
    createConversation(payload: {
      id: string;
      resourceId: string;
      userId: string;
      title?: string;
      metadata?: any;
    }): Promise<any>;
  } | null;
  conversationId?: string;
  userId?: string;
  slug: string;
  input: string | ChatMessage[];
  title?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { conversationStorage, conversationId, userId, slug, input, title } =
    options;
  if (!conversationStorage || !conversationId || !userId) {
    return;
  }

  const existing = await conversationStorage.getConversation(conversationId);
  if (existing) {
    return;
  }

  const fallbackTitle =
    typeof input === 'string' ? input : extractChatUserText(input);
  const resolvedTitle =
    title ||
    (fallbackTitle.length > 50
      ? `${fallbackTitle.substring(0, 50)}...`
      : fallbackTitle);

  await conversationStorage.createConversation({
    id: conversationId,
    resourceId: slug,
    userId,
    title: resolvedTitle,
    metadata: options.metadata || {},
  });
}

export async function persistTemporaryAgentMessages(options: {
  memoryAdapter: {
    addMessage(
      msg: any,
      userId: string,
      conversationId: string,
      metadata?: any,
    ): Promise<void>;
  };
  conversationId: string;
  input: string | ChatMessage[];
  accumulatedText: string;
  model?: string;
  userId?: string;
}): Promise<void> {
  const {
    memoryAdapter,
    conversationId,
    input,
    accumulatedText,
    model,
    userId,
  } = options;
  const resolvedUserId = userId || getCachedUser().alias;
  const userText = extractChatUserText(input);

  if (userText) {
    await memoryAdapter.addMessage(
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userText }],
      },
      resolvedUserId,
      conversationId,
    );
  }

  await memoryAdapter.addMessage(
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text: accumulatedText }],
    },
    resolvedUserId,
    conversationId,
    { model },
  );
}
