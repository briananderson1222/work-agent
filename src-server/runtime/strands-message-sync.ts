import type { InvocationContext } from './types.js';

type StrandsContentBlock = {
  type?: string;
  text?: string;
  reasoningText?: string;
  toolUseId?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
};

type StrandsMessage = {
  role?: string;
  content?: StrandsContentBlock[];
};

type StrandsLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

type StrandsMessageMemory = {
  getMessages(userId: string, conversationId: string): Promise<any[]>;
  addMessage(
    msg: any,
    userId: string,
    conversationId: string,
    metadata?: any,
  ): Promise<void>;
};

export function mapStrandsContentBlocksToParts(
  blocks: StrandsContentBlock[] = [],
): any[] {
  const parts: any[] = [];

  for (const block of blocks) {
    if (block.text !== undefined) {
      parts.push({ type: 'text' as const, text: block.text || '' });
      continue;
    }

    if (block.reasoningText !== undefined || block.type === 'reasoningBlock') {
      parts.push({
        type: 'reasoning' as const,
        text: block.reasoningText || block.text || '',
      });
      continue;
    }

    if (block.type === 'toolUseBlock') {
      parts.push({
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: block.toolUseId,
          toolName: block.name,
          args: block.input,
          state: 'result',
        },
      });
      continue;
    }

    if (block.type === 'toolResultBlock') {
      parts.push({
        type: 'tool-result' as const,
        toolCallId: block.toolUseId,
        result: block.content,
      });
    }
  }

  return parts;
}

export async function syncStrandsMessagesToMemory({
  agentMessages,
  invocation,
  logger,
  memoryAdapter,
  resolvedModel,
}: {
  agentMessages: StrandsMessage[];
  invocation: InvocationContext;
  logger: StrandsLogger;
  memoryAdapter: StrandsMessageMemory;
  resolvedModel: string;
}): Promise<void> {
  if (!agentMessages.length || !invocation.conversationId) {
    return;
  }

  try {
    const existing = await memoryAdapter.getMessages(
      invocation.userId || '',
      invocation.conversationId,
    );
    const delta = agentMessages.slice(existing?.length || 0);

    logger.info('[Strands] Syncing messages', {
      total: agentMessages.length,
      existing: existing?.length || 0,
      delta: delta.length,
      conversationId: invocation.conversationId,
    });

    for (const msg of delta) {
      const parts = mapStrandsContentBlocksToParts(msg.content || []);
      if (!parts.length) {
        continue;
      }

      await memoryAdapter.addMessage(
        {
          id: crypto.randomUUID(),
          role: msg.role || 'assistant',
          parts,
        },
        invocation.userId || '',
        invocation.conversationId,
        { model: resolvedModel },
      );
    }
  } catch (error) {
    logger.error('Failed to sync Strands messages', { error });
  }
}
