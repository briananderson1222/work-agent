import { createReadStream, existsSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { GetMessagesOptions } from '@voltagent/core';
import type { UIMessage } from 'ai';
import { createLogger } from '../../utils/logger.js';
import { parseReasoningFromMessage } from '../../utils/reasoning-parser.js';
import { MemoryAdapterPaths } from './memory-adapter-paths.js';

interface UIMessageWithMetadata extends UIMessage {
  metadata?: Record<string, any>;
}

const logger = createLogger({ name: 'memory-adapter-messages' });

export async function addStoredMessage({
  paths,
  resolveResourceId,
  touchConversation,
  usageAggregator,
  message,
  userId,
  conversationId,
  context,
}: {
  paths: MemoryAdapterPaths;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  touchConversation(conversationId: string): Promise<void>;
  usageAggregator?: any;
  message: UIMessage;
  userId: string;
  conversationId: string;
  context?: any;
}): Promise<void> {
  const resourceId = await resolveResourceId(conversationId, userId);
  await mkdir(paths.getSessionsDir(resourceId), { recursive: true });

  const parsedMessage = parseReasoningFromMessage(message);
  const messageWithMetadata: UIMessageWithMetadata = {
    ...parsedMessage,
    metadata: {
      ...(parsedMessage as UIMessageWithMetadata).metadata,
      timestamp: Date.now(),
      modelMetadata: context?.modelMetadata,
      usage: context?.usage,
      model: context?.model,
      traceId: context?.traceId,
    },
  };

  const abortController = context?.abortController;
  if (
    abortController?.signal.aborted &&
    messageWithMetadata.role === 'assistant'
  ) {
    messageWithMetadata.parts = [
      ...messageWithMetadata.parts,
      { type: 'text', text: '\n\n---\n\n_⚠️ Response cancelled by user_' },
    ];
  }

  const messagesPath = paths.getMessagesPath(resourceId, conversationId);
  await appendFile(
    messagesPath,
    `${JSON.stringify(messageWithMetadata)}\n`,
    'utf-8',
  );
  await touchConversation(conversationId);

  if (usageAggregator && messageWithMetadata.role === 'assistant') {
    try {
      await usageAggregator.incrementalUpdate(
        messageWithMetadata,
        resourceId,
        conversationId,
      );
    } catch (error) {
      logger.error('Failed to update usage stats', { error });
    }
  }
}

export async function addStoredMessages({
  paths,
  resolveResourceId,
  touchConversation,
  messages,
  userId,
  conversationId,
}: {
  paths: MemoryAdapterPaths;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  touchConversation(conversationId: string): Promise<void>;
  messages: UIMessage[];
  userId: string;
  conversationId: string;
}): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  const resourceId = await resolveResourceId(conversationId, userId);
  await mkdir(paths.getSessionsDir(resourceId), { recursive: true });

  const messagesPath = paths.getMessagesPath(resourceId, conversationId);
  const payload = `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
  await appendFile(messagesPath, payload, 'utf-8');
  await touchConversation(conversationId);
}

export async function readStoredMessages({
  paths,
  resolveResourceId,
  findConversationLocation,
  userId,
  conversationId,
  options,
}: {
  paths: MemoryAdapterPaths;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  findConversationLocation(
    conversationId: string,
  ): Promise<{ path: string; resourceId: string } | null>;
  userId: string;
  conversationId: string;
  options?: GetMessagesOptions;
}): Promise<UIMessage[]> {
  let resourceId = await resolveResourceId(conversationId, userId);
  let messagesPath = paths.getMessagesPath(resourceId, conversationId);

  if (!existsSync(messagesPath)) {
    const location = await findConversationLocation(conversationId);
    if (!location) {
      return [];
    }
    resourceId = location.resourceId;
    messagesPath = paths.getMessagesPath(resourceId, conversationId);
    if (!existsSync(messagesPath)) {
      return [];
    }
  }

  const messages: UIMessage[] = [];
  const fileStream = createReadStream(messagesPath, 'utf-8');
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed) as UIMessage);
    } catch (error) {
      logger.error('Failed to parse message', { error });
    }
  }

  if (options?.limit && messages.length > options.limit) {
    return messages.slice(-options.limit);
  }

  return messages;
}

export async function clearStoredMessages({
  paths,
  resolveResourceId,
  getConversationsByUserId,
  userId,
  conversationId,
}: {
  paths: MemoryAdapterPaths;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  getConversationsByUserId(userId: string): Promise<
    Array<{ id: string; resourceId: string }>
  >;
  userId: string;
  conversationId?: string;
}): Promise<void> {
  if (conversationId) {
    const resourceId = await resolveResourceId(conversationId, userId);
    const path = paths.getMessagesPath(resourceId, conversationId);
    if (existsSync(path)) {
      await truncate(path, 0);
    }
    return;
  }

  const conversations = await getConversationsByUserId(userId);
  await Promise.all(
    conversations.map(async (conversation) => {
      const path = paths.getMessagesPath(
        conversation.resourceId,
        conversation.id,
      );
      if (existsSync(path)) {
        await truncate(path, 0);
      }
    }),
  );
}

export async function removeLastStoredMessage({
  paths,
  resolveResourceId,
  userId,
  conversationId,
}: {
  paths: MemoryAdapterPaths;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  userId: string;
  conversationId: string;
}): Promise<void> {
  const resourceId = await resolveResourceId(conversationId, userId);
  const path = paths.getMessagesPath(resourceId, conversationId);

  if (!existsSync(path)) {
    return;
  }

  const lines: string[] = [];
  const fileStream = createReadStream(path);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      lines.push(line);
    }
  }

  if (lines.length > 0) {
    lines.pop();
    await writeFile(path, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  }
}
