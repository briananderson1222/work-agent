/**
 * VoltAgent StorageAdapter implementation using file-based NDJSON storage.
 * Aligns with VoltAgent v1.x storage interfaces.
 */

import {
  readFile,
  writeFile,
  readdir,
  unlink,
  truncate,
  mkdir,
  appendFile,
} from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { createInterface } from 'readline';
import type {
  StorageAdapter,
  Conversation,
  CreateConversationInput,
  GetMessagesOptions,
  ConversationQueryOptions,
  WorkingMemoryScope,
  WorkflowStateEntry,
} from '@voltagent/core';
import type { UIMessage } from 'ai';

export interface FileVoltAgentMemoryAdapterOptions {
  workAgentDir: string;
}

type SerializedSuspension = Omit<NonNullable<WorkflowStateEntry['suspension']>, 'suspendedAt'> & {
  suspendedAt: string;
};

type WorkflowStateJson = Omit<WorkflowStateEntry, 'createdAt' | 'updatedAt' | 'suspension'> & {
  createdAt: string;
  updatedAt: string;
  suspension?: SerializedSuspension;
};

/**
 * File-based storage adapter for VoltAgent memory.
 * Implements the StorageAdapter interface for conversation storage.
 */
export class FileVoltAgentMemoryAdapter implements StorageAdapter {
  private workAgentDir: string;
  private conversationCache = new Map<string, Conversation>();
  private conversationResourceCache = new Map<string, string>();

  constructor(options: FileVoltAgentMemoryAdapterOptions) {
    this.workAgentDir = options.workAgentDir;
  }

  /**
   * Directory that contains all agent data.
   */
  private getAgentsDir(): string {
    return join(this.workAgentDir, 'agents');
  }

  /**
   * Directory for an individual agent's storage.
   */
  private getAgentMemoryDir(resourceId: string): string {
    return join(this.getAgentsDir(), resourceId, 'memory');
  }

  /**
   * Directory for conversations belonging to a resource.
   */
  private getConversationsDir(resourceId: string): string {
    return join(this.getAgentMemoryDir(resourceId), 'conversations');
  }

  /**
   * Path to a conversation metadata file.
   */
  private getConversationPath(resourceId: string, conversationId: string): string {
    return join(this.getConversationsDir(resourceId), `${conversationId}.json`);
  }

  /**
   * Directory for message history files.
   */
  private getSessionsDir(resourceId: string): string {
    return join(this.getAgentMemoryDir(resourceId), 'sessions');
  }

  /**
   * Path to the NDJSON messages file for a conversation.
   */
  private getMessagesPath(resourceId: string, conversationId: string): string {
    return join(this.getSessionsDir(resourceId), `${conversationId}.ndjson`);
  }

  /**
   * Directory for working memory scoped by resource and scope.
   */
  private getWorkingMemoryDir(resourceId: string, scope: WorkingMemoryScope): string {
    return join(this.getAgentMemoryDir(resourceId), 'working', scope);
  }

  /**
   * Path to a conversation-scoped working memory file.
   */
  private getConversationWorkingMemoryPath(resourceId: string, conversationId: string): string {
    return join(this.getWorkingMemoryDir(resourceId, 'conversation'), `${conversationId}.json`);
  }

  /**
   * Path to a user-scoped working memory file.
   */
  private getUserWorkingMemoryPath(resourceId: string, userId: string): string {
    return join(this.getWorkingMemoryDir(resourceId, 'user'), `${this.sanitizeId(userId)}.json`);
  }

  /**
   * Path to the workflow state directory.
   */
  private getWorkflowStatesDir(): string {
    return join(this.workAgentDir, 'workflows', 'states');
  }

  /**
   * Path to a specific workflow state file.
   */
  private getWorkflowStatePath(executionId: string): string {
    return join(this.getWorkflowStatesDir(), `${executionId}.json`);
  }

  /**
   * Ensure file-system safe identifiers.
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  /**
   * Cache a conversation and its resource mapping.
   */
  private cacheConversation(conversation: Conversation): void {
    this.conversationCache.set(conversation.id, conversation);
    this.conversationResourceCache.set(conversation.id, conversation.resourceId);
  }

  /**
   * Attempt to load a conversation from disk and populate caches.
   */
  private async loadConversationFromDisk(conversationId: string): Promise<Conversation | null> {
    if (this.conversationCache.has(conversationId)) {
      return this.conversationCache.get(conversationId)!;
    }

    const location = await this.findConversationLocation(conversationId);
    if (!location) {
      return null;
    }

    try {
      const content = await readFile(location.path, 'utf-8');
      const conversation = JSON.parse(content) as Conversation;
      this.cacheConversation(conversation);
      return conversation;
    } catch (error) {
      console.error(`[FileVoltAgentMemoryAdapter] Failed to read conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Find the on-disk location for a conversation by scanning agent folders.
   */
  private async findConversationLocation(conversationId: string): Promise<{ path: string; resourceId: string } | null> {
    const cachedResource = this.conversationResourceCache.get(conversationId);
    if (cachedResource) {
      const cachedPath = this.getConversationPath(cachedResource, conversationId);
      if (existsSync(cachedPath)) {
        return { path: cachedPath, resourceId: cachedResource };
      }
    }

    const agentsDir = this.getAgentsDir();
    if (!existsSync(agentsDir)) {
      return null;
    }

    const agentEntries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (!entry.isDirectory()) continue;
      const resourceId = entry.name;
      const conversationPath = this.getConversationPath(resourceId, conversationId);
      if (existsSync(conversationPath)) {
        return { path: conversationPath, resourceId };
      }
    }

    return null;
  }

  /**
   * Persist a conversation to disk and refresh caches.
   */
  private async persistConversation(conversation: Conversation): Promise<void> {
    const conversationDir = this.getConversationsDir(conversation.resourceId);
    await mkdir(conversationDir, { recursive: true });
    const conversationPath = this.getConversationPath(conversation.resourceId, conversation.id);
    await writeFile(conversationPath, JSON.stringify(conversation, null, 2), 'utf-8');
    this.cacheConversation(conversation);
  }

  /**
   * Update the updatedAt timestamp for a conversation.
   */
  private async touchConversation(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return;

    const updatedConversation: Conversation = {
      ...conversation,
      updatedAt: new Date().toISOString(),
    };

    await this.persistConversation(updatedConversation);
  }

  /**
   * Extract an agent slug from a user ID (format: agent:<slug>:user:<id>).
   */
  private extractAgentSlug(userId?: string): string | null {
    if (!userId) return null;
    const match = /^agent:([^:]+)/.exec(userId);
    return match ? match[1] : null;
  }

  /**
   * Resolve the resource ID for a conversation using cache, disk lookup, or userId hint.
   */
  private async resolveResourceId(conversationId?: string, userId?: string): Promise<string> {
    if (conversationId) {
      const cached = this.conversationResourceCache.get(conversationId);
      if (cached) {
        return cached;
      }

      const conversation = await this.loadConversationFromDisk(conversationId);
      if (conversation) {
        return conversation.resourceId;
      }
    }

    const agentFromUser = this.extractAgentSlug(userId);
    if (agentFromUser) {
      return agentFromUser;
    }

    return 'default';
  }

  /**
   * Load all conversations for a given resource.
   */
  private async listAgentConversations(resourceId: string): Promise<Conversation[]> {
    const conversationsDir = this.getConversationsDir(resourceId);
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
        this.cacheConversation(conversation);
        conversations.push(conversation);
      } catch (error) {
        console.error(`[FileVoltAgentMemoryAdapter] Failed to parse conversation file ${file}:`, error);
      }
    }

    return conversations;
  }

  /**
   * Load every conversation across all resources.
   */
  private async loadAllConversations(): Promise<Conversation[]> {
    const agentsDir = this.getAgentsDir();
    if (!existsSync(agentsDir)) {
      return [];
    }

    const entries = await readdir(agentsDir, { withFileTypes: true });
    const conversations: Conversation[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const resourceId = entry.name;
      const agentConversations = await this.listAgentConversations(resourceId);
      conversations.push(...agentConversations);
    }

    return conversations;
  }

  /**
   * Apply query options (filtering, ordering, pagination) to a list of conversations.
   */
  private applyQueryOptions(
    conversations: Conversation[],
    options?: ConversationQueryOptions
  ): Conversation[] {
    if (!options) {
      return conversations.slice();
    }

    let filtered = conversations.slice();

    if (options.userId) {
      filtered = filtered.filter(conversation => conversation.userId === options.userId);
    }

    if (options.resourceId) {
      filtered = filtered.filter(conversation => conversation.resourceId === options.resourceId);
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

  /**
   * Delete a conversation's message file if it exists.
   */
  private async deleteMessagesFile(resourceId: string, conversationId: string): Promise<void> {
    const messagesPath = this.getMessagesPath(resourceId, conversationId);
    if (existsSync(messagesPath)) {
      await unlink(messagesPath);
    }
  }

  /**
   * Delete working memory stored for a conversation.
   */
  private async deleteConversationWorkingMemory(resourceId: string, conversationId: string): Promise<void> {
    const path = this.getConversationWorkingMemoryPath(resourceId, conversationId);
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  /**
   * Serialize workflow state entry for storage.
   */
  private serializeWorkflowState(state: WorkflowStateEntry): WorkflowStateJson {
    const { createdAt, updatedAt, suspension, ...rest } = state;
    const base = rest as Omit<WorkflowStateEntry, 'createdAt' | 'updatedAt' | 'suspension'>;

    return {
      ...base,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      suspension: suspension
        ? {
            ...suspension,
            suspendedAt: suspension.suspendedAt.toISOString(),
          }
        : undefined,
    };
  }

  /**
   * Deserialize workflow state entry from disk.
   */
  private deserializeWorkflowState(json: WorkflowStateJson): WorkflowStateEntry | null {
    try {
      const { createdAt, updatedAt, suspension, ...rest } = json;
      const base = rest as Omit<WorkflowStateEntry, 'createdAt' | 'updatedAt' | 'suspension'>;

      return {
        ...base,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
        suspension: suspension
          ? {
              ...suspension,
              suspendedAt: new Date(suspension.suspendedAt),
            }
          : undefined,
      };
    } catch (error) {
      console.error('[FileVoltAgentMemoryAdapter] Failed to deserialize workflow state:', error);
      return null;
    }
  }

  // ===========================================================================
  // Message Operations
  // ===========================================================================

  async addMessage(message: UIMessage, userId: string, conversationId: string): Promise<void> {
    const resourceId = await this.resolveResourceId(conversationId, userId);
    await mkdir(this.getSessionsDir(resourceId), { recursive: true });

    const messagesPath = this.getMessagesPath(resourceId, conversationId);
    await appendFile(messagesPath, JSON.stringify(message) + '\n', 'utf-8');
    await this.touchConversation(conversationId);
  }

  async addMessages(messages: UIMessage[], userId: string, conversationId: string): Promise<void> {
    if (messages.length === 0) return;

    const resourceId = await this.resolveResourceId(conversationId, userId);
    await mkdir(this.getSessionsDir(resourceId), { recursive: true });

    const messagesPath = this.getMessagesPath(resourceId, conversationId);
    const payload = messages.map(message => JSON.stringify(message)).join('\n') + '\n';
    await appendFile(messagesPath, payload, 'utf-8');
    await this.touchConversation(conversationId);
  }

  async getMessages(
    userId: string,
    conversationId: string,
    options?: GetMessagesOptions
  ): Promise<UIMessage[]> {
    let resourceId = await this.resolveResourceId(conversationId, userId);
    let messagesPath = this.getMessagesPath(resourceId, conversationId);

    if (!existsSync(messagesPath)) {
      const location = await this.findConversationLocation(conversationId);
      if (!location) {
        return [];
      }
      resourceId = location.resourceId;
      messagesPath = this.getMessagesPath(resourceId, conversationId);
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
        console.error('[FileVoltAgentMemoryAdapter] Failed to parse message:', error);
      }
    }

    if (options?.limit && messages.length > options.limit) {
      return messages.slice(-options.limit);
    }

    return messages;
  }

  async clearMessages(userId: string, conversationId?: string): Promise<void> {
    if (conversationId) {
      const resourceId = await this.resolveResourceId(conversationId, userId);
      const path = this.getMessagesPath(resourceId, conversationId);
      if (existsSync(path)) {
        await truncate(path, 0);
      }
      return;
    }

    const conversations = await this.getConversationsByUserId(userId);
    await Promise.all(
      conversations.map(async conversation => {
        const path = this.getMessagesPath(conversation.resourceId, conversation.id);
        if (existsSync(path)) {
          await truncate(path, 0);
        }
      })
    );
  }

  // ===========================================================================
  // Conversation Operations
  // ===========================================================================

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
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

    await this.persistConversation(conversation);
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conversation = await this.loadConversationFromDisk(id);
    return conversation ? { ...conversation } : null;
  }

  async getConversations(resourceId: string): Promise<Conversation[]> {
    const conversations = await this.listAgentConversations(resourceId);
    return this.applyQueryOptions(conversations);
  }

  async getConversationsByUserId(
    userId: string,
    options?: Omit<ConversationQueryOptions, 'userId'>
  ): Promise<Conversation[]> {
    const conversations = await this.loadAllConversations();
    return this.applyQueryOptions(conversations, { ...options, userId });
  }

  async queryConversations(options: ConversationQueryOptions): Promise<Conversation[]> {
    const conversations = await this.loadAllConversations();
    return this.applyQueryOptions(conversations, options);
  }

  async updateConversation(
    id: string,
    updates: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>>
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

    await this.persistConversation(updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    const conversation = await this.getConversation(id);
    if (!conversation) {
      return;
    }

    const conversationPath = this.getConversationPath(conversation.resourceId, id);
    if (existsSync(conversationPath)) {
      await unlink(conversationPath);
    }

    await this.deleteMessagesFile(conversation.resourceId, id);
    await this.deleteConversationWorkingMemory(conversation.resourceId, id);

    this.conversationCache.delete(id);
    this.conversationResourceCache.delete(id);
  }

  // ===========================================================================
  // Working Memory
  // ===========================================================================

  async getWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    scope: WorkingMemoryScope;
  }): Promise<string | null> {
    const resourceId = await this.resolveResourceId(params.conversationId, params.userId);

    if (params.scope === 'conversation') {
      if (!params.conversationId) return null;
      const path = this.getConversationWorkingMemoryPath(resourceId, params.conversationId);
      if (!existsSync(path)) {
        // Backwards compatibility: old structure without scope directory
        const legacyPath = join(this.getAgentMemoryDir(resourceId), 'working', `${params.conversationId}.json`);
        if (!existsSync(legacyPath)) {
          return null;
        }
        const legacyContent = await readFile(legacyPath, 'utf-8');
        const legacyData = JSON.parse(legacyContent) as { memory?: string; content?: string };
        return legacyData.memory ?? legacyData.content ?? null;
      }
      const content = await readFile(path, 'utf-8');
      const data = JSON.parse(content) as { content?: string };
      return data.content ?? null;
    }

    if (!params.userId) return null;
    const path = this.getUserWorkingMemoryPath(resourceId, params.userId);
    if (!existsSync(path)) {
      return null;
    }
    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content) as { content?: string };
    return data.content ?? null;
  }

  async setWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    content: string;
    scope: WorkingMemoryScope;
  }): Promise<void> {
    const resourceId = await this.resolveResourceId(params.conversationId, params.userId);
    const payload = {
      content: params.content,
      updatedAt: new Date().toISOString(),
    };

    if (params.scope === 'conversation') {
      if (!params.conversationId) {
        throw new Error('conversationId is required for conversation-scoped working memory');
      }
      const path = this.getConversationWorkingMemoryPath(resourceId, params.conversationId);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
      return;
    }

    if (!params.userId) {
      throw new Error('userId is required for user-scoped working memory');
    }

    const path = this.getUserWorkingMemoryPath(resourceId, params.userId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async deleteWorkingMemory(params: {
    conversationId?: string;
    userId?: string;
    scope: WorkingMemoryScope;
  }): Promise<void> {
    const resourceId = await this.resolveResourceId(params.conversationId, params.userId);

    if (params.scope === 'conversation') {
      if (!params.conversationId) return;
      const path = this.getConversationWorkingMemoryPath(resourceId, params.conversationId);
      if (existsSync(path)) {
        await unlink(path);
      }
      return;
    }

    if (!params.userId) return;
    const path = this.getUserWorkingMemoryPath(resourceId, params.userId);
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  // ===========================================================================
  // Workflow State
  // ===========================================================================

  async getWorkflowState(executionId: string): Promise<WorkflowStateEntry | null> {
    const path = this.getWorkflowStatePath(executionId);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = await readFile(path, 'utf-8');
      const state = this.deserializeWorkflowState(JSON.parse(content) as WorkflowStateJson);
      return state ?? null;
    } catch (error) {
      console.error('[FileVoltAgentMemoryAdapter] Failed to read workflow state:', error);
      return null;
    }
  }

  async setWorkflowState(executionId: string, state: WorkflowStateEntry): Promise<void> {
    const dir = this.getWorkflowStatesDir();
    await mkdir(dir, { recursive: true });
    const path = this.getWorkflowStatePath(executionId);
    await writeFile(path, JSON.stringify(this.serializeWorkflowState(state), null, 2), 'utf-8');
  }

  async updateWorkflowState(
    executionId: string,
    updates: Partial<WorkflowStateEntry>
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

  async getSuspendedWorkflowStates(workflowId: string): Promise<WorkflowStateEntry[]> {
    const dir = this.getWorkflowStatesDir();
    if (!existsSync(dir)) {
      return [];
    }

    const files = await readdir(dir);
    const states: WorkflowStateEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const path = join(dir, file);
      try {
        const content = await readFile(path, 'utf-8');
        const parsed = JSON.parse(content) as WorkflowStateJson;
        const state = this.deserializeWorkflowState(parsed);
        if (state && state.status === 'suspended' && state.workflowId === workflowId) {
          states.push(state);
        }
      } catch (error) {
        console.error('[FileVoltAgentMemoryAdapter] Failed to parse workflow state:', error);
      }
    }

    return states;
  }
}
