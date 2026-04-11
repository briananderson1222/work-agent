import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Conversation, ConversationQueryOptions } from '@voltagent/core';
import { MemoryAdapterPaths } from './memory-adapter-paths.js';

export function applyConversationQueryOptions(
  conversations: Conversation[],
  options?: ConversationQueryOptions,
): Conversation[] {
  if (!options) {
    return conversations.slice();
  }

  let filtered = conversations.slice();

  if (options.userId) {
    filtered = filtered.filter(
      (conversation) => conversation.userId === options.userId,
    );
  }

  if (options.resourceId) {
    filtered = filtered.filter(
      (conversation) => conversation.resourceId === options.resourceId,
    );
  }

  const orderBy = options.orderBy ?? 'updated_at';
  const orderDirection = options.orderDirection === 'ASC' ? 1 : -1;

  if (orderBy === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title) * orderDirection);
  } else {
    const key = orderBy === 'created_at' ? 'createdAt' : 'updatedAt';
    filtered.sort((a, b) => {
      const aDate = new Date(a[key]).getTime();
      const bDate = new Date(b[key]).getTime();
      return (aDate - bDate) * orderDirection;
    });
  }

  const offset = options.offset ?? 0;
  const limit = options.limit ?? filtered.length;
  return filtered.slice(offset, offset + limit);
}

export interface MemoryConversationStore {
  loadConversationFromDisk(conversationId: string): Promise<Conversation | null>;
  persistConversation(conversation: Conversation): Promise<void>;
  touchConversation(conversationId: string): Promise<void>;
  resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string>;
  listAgentConversations(resourceId: string): Promise<Conversation[]>;
  loadAllConversations(): Promise<Conversation[]>;
  deleteConversationAssets(resourceId: string, conversationId: string): Promise<void>;
}

export function createMemoryConversationStore(options: {
  paths: MemoryAdapterPaths;
  logger: Pick<Console, 'error'>;
}): MemoryConversationStore {
  const { paths, logger } = options;
  const conversationCache = new Map<string, Conversation>();
  const conversationResourceCache = new Map<string, string>();

  function cacheConversation(conversation: Conversation): void {
    conversationCache.set(conversation.id, conversation);
    conversationResourceCache.set(conversation.id, conversation.resourceId);
  }

  async function findConversationLocation(
    conversationId: string,
  ): Promise<{ path: string; resourceId: string } | null> {
    const cachedResource = conversationResourceCache.get(conversationId);
    if (cachedResource) {
      const cachedPath = paths.getConversationPath(
        cachedResource,
        conversationId,
      );
      if (existsSync(cachedPath)) {
        return { path: cachedPath, resourceId: cachedResource };
      }
    }

    const agentsDir = paths.getAgentsDir();
    if (!existsSync(agentsDir)) {
      return null;
    }

    const agentEntries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (!entry.isDirectory()) continue;
      const resourceId = entry.name;
      const conversationPath = paths.getConversationPath(
        resourceId,
        conversationId,
      );
      if (existsSync(conversationPath)) {
        return { path: conversationPath, resourceId };
      }
    }

    return null;
  }

  async function loadConversationFromDisk(
    conversationId: string,
  ): Promise<Conversation | null> {
    if (conversationCache.has(conversationId)) {
      return conversationCache.get(conversationId)!;
    }

    const location = await findConversationLocation(conversationId);
    if (!location) {
      return null;
    }

    try {
      const content = await readFile(location.path, 'utf-8');
      const conversation = JSON.parse(content) as Conversation;
      cacheConversation(conversation);
      return conversation;
    } catch (error) {
      logger.error('Failed to read conversation', { conversationId, error });
      return null;
    }
  }

  async function persistConversation(
    conversation: Conversation,
  ): Promise<void> {
    const conversationDir = paths.getConversationsDir(conversation.resourceId);
    await mkdir(conversationDir, { recursive: true });
    const conversationPath = paths.getConversationPath(
      conversation.resourceId,
      conversation.id,
    );
    await writeFile(
      conversationPath,
      JSON.stringify(conversation, null, 2),
      'utf-8',
    );
    cacheConversation(conversation);
  }

  async function touchConversation(conversationId: string): Promise<void> {
    const conversation = await loadConversationFromDisk(conversationId);
    if (!conversation) return;

    await persistConversation({
      ...conversation,
      updatedAt: new Date().toISOString(),
    });
  }

  function extractAgentSlug(userId?: string): string | null {
    if (!userId) return null;
    const match = /^agent:([^:]+)/.exec(userId);
    return match ? match[1] : null;
  }

  async function resolveResourceId(
    conversationId?: string,
    userId?: string,
  ): Promise<string> {
    if (conversationId) {
      const cached = conversationResourceCache.get(conversationId);
      if (cached) {
        return cached;
      }

      const conversation = await loadConversationFromDisk(conversationId);
      if (conversation) {
        return conversation.resourceId;
      }
    }

    return extractAgentSlug(userId) ?? 'default';
  }

  async function listAgentConversations(
    resourceId: string,
  ): Promise<Conversation[]> {
    const conversationsDir = paths.getConversationsDir(resourceId);
    if (!existsSync(conversationsDir)) {
      return [];
    }

    const files = await readdir(conversationsDir);
    const conversations: Conversation[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const path = join(conversationsDir, file);
      try {
        const content = await readFile(path, 'utf-8');
        const conversation = JSON.parse(content) as Conversation;
        cacheConversation(conversation);
        conversations.push(conversation);
      } catch (error) {
        logger.error('Failed to parse conversation file', { file, error });
      }
    }

    return conversations;
  }

  async function loadAllConversations(): Promise<Conversation[]> {
    const agentsDir = paths.getAgentsDir();
    if (!existsSync(agentsDir)) {
      return [];
    }

    const entries = await readdir(agentsDir, { withFileTypes: true });
    const conversations: Conversation[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentConversations = await listAgentConversations(entry.name);
      conversations.push(...agentConversations);
    }

    return conversations;
  }

  async function deleteConversationAssets(
    resourceId: string,
    conversationId: string,
  ): Promise<void> {
    const conversationPath = paths.getConversationPath(resourceId, conversationId);
    if (existsSync(conversationPath)) {
      await unlink(conversationPath);
    }

    const messagesPath = paths.getMessagesPath(resourceId, conversationId);
    if (existsSync(messagesPath)) {
      await unlink(messagesPath);
    }

    const workingMemoryPath = paths.getConversationWorkingMemoryPath(
      resourceId,
      conversationId,
    );
    if (existsSync(workingMemoryPath)) {
      await unlink(workingMemoryPath);
    }

    conversationCache.delete(conversationId);
    conversationResourceCache.delete(conversationId);
  }

  return {
    loadConversationFromDisk,
    persistConversation,
    touchConversation,
    resolveResourceId,
    listAgentConversations,
    loadAllConversations,
    deleteConversationAssets,
  };
}
