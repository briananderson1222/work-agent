/**
 * VoltAgent StorageAdapter implementation using file-based NDJSON storage.
 * Aligns with VoltAgent storage interfaces.
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type {
  Conversation,
  ConversationQueryOptions,
  CreateConversationInput,
  GetMessagesOptions,
  StorageAdapter,
  WorkflowStateEntry,
  WorkingMemoryScope,
} from '@voltagent/core';
import type { UIMessage } from 'ai';
import { createLogger } from '../../utils/logger.js';
import {
  applyConversationQueryOptions,
  createMemoryConversationStore,
} from './memory-adapter-conversations.js';
import {
  addStoredMessage,
  addStoredMessages,
  clearStoredMessages,
  readStoredMessages,
  removeLastStoredMessage,
} from './memory-adapter-messages.js';
import { MemoryAdapterPaths } from './memory-adapter-paths.js';
import {
  deleteWorkingMemoryState as deleteWorkingMemoryStateFile,
  getSuspendedWorkflowStateEntries as getSuspendedWorkflowStateEntriesFromFiles,
  getWorkflowStateEntry as getWorkflowStateEntryFromFile,
  getWorkingMemoryState as getWorkingMemoryStateFile,
  setWorkflowStateEntry as setWorkflowStateEntryFile,
  setWorkingMemoryState as setWorkingMemoryStateFile,
} from './memory-adapter-state.js';

const logger = createLogger({ name: 'memory-adapter' });

export interface FileMemoryAdapterOptions {
  projectHomeDir: string;
  usageAggregator?: any;
}

/**
 * File-based storage adapter for VoltAgent memory.
 * Implements the StorageAdapter interface for conversation storage.
 */
export class FileMemoryAdapter implements StorageAdapter {
  private usageAggregator?: any;
  private paths: MemoryAdapterPaths;
  private conversations;

  constructor(options: FileMemoryAdapterOptions) {
    this.paths = new MemoryAdapterPaths(options.projectHomeDir);
    this.usageAggregator = options.usageAggregator;
    this.conversations = createMemoryConversationStore({
      paths: this.paths,
      logger,
    });
  }

  // ===========================================================================
  // Message Operations
  // ===========================================================================

  async addMessage(
    message: UIMessage,
    userId: string,
    conversationId: string,
    context?: any,
  ): Promise<void> {
    await addStoredMessage({
      paths: this.paths,
      resolveResourceId: (nextConversationId, nextUserId) =>
        this.conversations.resolveResourceId(nextConversationId, nextUserId),
      touchConversation: (id) => this.conversations.touchConversation(id),
      usageAggregator: this.usageAggregator,
      message,
      userId,
      conversationId,
      context,
    });
  }

  async addMessages(
    messages: UIMessage[],
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await addStoredMessages({
      paths: this.paths,
      resolveResourceId: (nextConversationId, nextUserId) =>
        this.conversations.resolveResourceId(nextConversationId, nextUserId),
      touchConversation: (id) => this.conversations.touchConversation(id),
      messages,
      userId,
      conversationId,
    });
  }

  async getMessages(
    userId: string,
    conversationId: string,
    options?: GetMessagesOptions,
    _context?: any,
  ): Promise<any[]> {
    return readStoredMessages({
      paths: this.paths,
      resolveResourceId: (nextConversationId, nextUserId) =>
        this.conversations.resolveResourceId(nextConversationId, nextUserId),
      findConversationLocation: (id) =>
        this.conversations.loadConversationFromDisk(id).then((conversation) =>
          conversation
            ? {
                path: this.paths.getConversationPath(
                  conversation.resourceId,
                  conversation.id,
                ),
                resourceId: conversation.resourceId,
              }
            : null,
        ),
      userId,
      conversationId,
      options,
    });
  }

  async clearMessages(userId: string, conversationId?: string): Promise<void> {
    await clearStoredMessages({
      paths: this.paths,
      resolveResourceId: (nextConversationId, nextUserId) =>
        this.conversations.resolveResourceId(nextConversationId, nextUserId),
      getConversationsByUserId: (id) => this.getConversationsByUserId(id),
      userId,
      conversationId,
    });
  }

  async removeLastMessage(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await removeLastStoredMessage({
      paths: this.paths,
      resolveResourceId: (nextConversationId, nextUserId) =>
        this.conversations.resolveResourceId(nextConversationId, nextUserId),
      userId,
      conversationId,
    });
  }

  async deleteMessages(
    messageIds: string[],
    userId: string,
    conversationId: string,
  ): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    const resourceId = await this.conversations.resolveResourceId(
      conversationId,
      userId,
    );
    const path = this.paths.getMessagesPath(resourceId, conversationId);
    if (!existsSync(path)) {
      return;
    }

    const messages = await this.getMessages(userId, conversationId);
    const remaining = messages.filter(
      (message: any) => !messageIds.includes(String(message.id)),
    );
    const payload =
      remaining.map((message) => JSON.stringify(message)).join('\n') +
      (remaining.length > 0 ? '\n' : '');
    await writeFile(path, payload, 'utf-8');
    await this.conversations.touchConversation(conversationId);
  }

  // ===========================================================================
  // Conversation Operations
  // ===========================================================================

  async createConversation(
    input: CreateConversationInput,
  ): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: input.id,
      resourceId: input.resourceId,
      userId: input.userId,
      title: input.title,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    await this.conversations.persistConversation(conversation);
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conversation = await this.conversations.loadConversationFromDisk(id);
    return conversation ? { ...conversation } : null;
  }

  async getConversations(resourceId: string): Promise<Conversation[]> {
    const conversations =
      await this.conversations.listAgentConversations(resourceId);
    return applyConversationQueryOptions(conversations);
  }

  async getConversationsByUserId(
    userId: string,
    options?: Omit<ConversationQueryOptions, 'userId'>,
  ): Promise<Conversation[]> {
    const conversations = await this.conversations.loadAllConversations();
    return applyConversationQueryOptions(conversations, { ...options, userId });
  }

  async queryConversations(
    options: ConversationQueryOptions,
  ): Promise<Conversation[]> {
    const conversations = await this.conversations.loadAllConversations();
    return applyConversationQueryOptions(conversations, options);
  }

  async countConversations(options: ConversationQueryOptions): Promise<number> {
    const conversations = await this.conversations.loadAllConversations();
    return applyConversationQueryOptions(conversations, {
      ...options,
      limit: undefined,
      offset: undefined,
    }).length;
  }

  async updateConversation(
    id: string,
    updates: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Conversation> {
    const conversation = await this.getConversation(id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }

    const updated: Conversation = {
      ...conversation,
      ...updates,
      resourceId: conversation.resourceId,
      createdAt: conversation.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.conversations.persistConversation(updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    const conversation = await this.getConversation(id);
    if (!conversation) {
      return;
    }

    await this.conversations.deleteConversationAssets(
      conversation.resourceId,
      id,
    );
  }

  // ===========================================================================
  // Working Memory
  // ===========================================================================

  async getWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    scope: WorkingMemoryScope;
  }): Promise<string | null> {
    return getWorkingMemoryStateFile({
      paths: this.paths,
      resolveResourceId: (conversationId, userId) =>
        this.conversations.resolveResourceId(conversationId, userId),
      conversationId: params.conversationId,
      userId: params.userId,
      scope: params.scope,
    });
  }

  async setWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    content: string;
    scope: WorkingMemoryScope;
  }): Promise<void> {
    await setWorkingMemoryStateFile({
      paths: this.paths,
      resolveResourceId: (conversationId, userId) =>
        this.conversations.resolveResourceId(conversationId, userId),
      conversationId: params.conversationId,
      userId: params.userId,
      content: params.content,
      scope: params.scope,
    });
  }

  async deleteWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    scope: WorkingMemoryScope;
  }): Promise<void> {
    await deleteWorkingMemoryStateFile({
      paths: this.paths,
      resolveResourceId: (conversationId, userId) =>
        this.conversations.resolveResourceId(conversationId, userId),
      conversationId: params.conversationId,
      userId: params.userId,
      scope: params.scope,
    });
  }

  // ===========================================================================
  // Workflow State
  // ===========================================================================

  async getWorkflowState(
    executionId: string,
  ): Promise<WorkflowStateEntry | null> {
    return getWorkflowStateEntryFromFile(this.paths, executionId);
  }

  async queryWorkflowRuns(_query: any): Promise<WorkflowStateEntry[]> {
    return [];
  }

  async setWorkflowState(
    executionId: string,
    state: WorkflowStateEntry,
  ): Promise<void> {
    await setWorkflowStateEntryFile(this.paths, executionId, state);
  }

  async updateWorkflowState(
    executionId: string,
    updates: Partial<WorkflowStateEntry>,
  ): Promise<void> {
    const existing = await this.getWorkflowState(executionId);
    if (!existing) {
      throw new Error(`Workflow state ${executionId} not found`);
    }

    const merged: WorkflowStateEntry = {
      ...existing,
      ...updates,
      createdAt: existing.createdAt,
      updatedAt: updates.updatedAt ?? new Date(),
    };

    if (merged.suspension && existing.suspension) {
      merged.suspension = {
        ...existing.suspension,
        ...updates.suspension,
      };
    }

    await this.setWorkflowState(executionId, merged);
  }

  async getSuspendedWorkflowStates(
    workflowId: string,
  ): Promise<WorkflowStateEntry[]> {
    return getSuspendedWorkflowStateEntriesFromFiles(this.paths, workflowId);
  }
}
