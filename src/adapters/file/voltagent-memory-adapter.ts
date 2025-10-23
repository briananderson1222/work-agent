/**
 * VoltAgent StorageAdapter implementation using file-based NDJSON storage
 */

import { readFile, writeFile, readdir, stat, unlink, truncate, mkdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import type {
  StorageAdapter,
  UIMessage,
  Conversation,
  CreateConversationInput,
  WorkflowState,
  GetMessagesOptions,
  GetConversationsOptions,
  QueryConversationsInput,
} from '@voltagent/core';

export interface FileVoltAgentMemoryAdapterOptions {
  workAgentDir: string;
}

/**
 * File-based storage adapter for VoltAgent memory
 * Implements the StorageAdapter interface for conversation storage
 */
export class FileVoltAgentMemoryAdapter implements StorageAdapter {
  private workAgentDir: string;

  constructor(options: FileVoltAgentMemoryAdapterOptions) {
    this.workAgentDir = options.workAgentDir;
  }

  /**
   * Get the agent's memory directory path
   */
  private getAgentMemoryDir(agentSlug: string): string {
    return join(this.workAgentDir, 'agents', agentSlug, 'memory');
  }

  /**
   * Get the sessions directory path
   */
  private getSessionsDir(agentSlug: string): string {
    return join(this.getAgentMemoryDir(agentSlug), 'sessions');
  }

  /**
   * Get the conversations directory path
   */
  private getConversationsDir(agentSlug: string): string {
    return join(this.getAgentMemoryDir(agentSlug), 'conversations');
  }

  /**
   * Get the path for a specific conversation file
   */
  private getConversationPath(agentSlug: string, conversationId: string): string {
    return join(this.getConversationsDir(agentSlug), `${conversationId}.json`);
  }

  /**
   * Get the path for a specific session's messages file
   */
  private getMessagesPath(agentSlug: string, conversationId: string): string {
    return join(this.getSessionsDir(agentSlug), `${conversationId}.ndjson`);
  }

  /**
   * Extract agent slug from userId (format: agent:<slug>:user:<id>)
   */
  private extractAgentSlug(userId: string): string {
    const match = userId.match(/^agent:([^:]+)/);
    return match ? match[1] : 'default';
  }

  // Messages

  async addMessage(message: UIMessage, userId: string, conversationId: string): Promise<void> {
    const agentSlug = this.extractAgentSlug(userId);
    const messagesPath = this.getMessagesPath(agentSlug, conversationId);

    await mkdir(this.getSessionsDir(agentSlug), { recursive: true });

    const line = JSON.stringify(message) + '\n';
    const { appendFile } = await import('fs/promises');
    await appendFile(messagesPath, line, 'utf-8');
  }

  async addMessages(messages: UIMessage[], userId: string, conversationId: string): Promise<void> {
    for (const message of messages) {
      await this.addMessage(message, userId, conversationId);
    }
  }

  async getMessages(
    userId: string,
    conversationId: string,
    options?: GetMessagesOptions
  ): Promise<UIMessage[]> {
    const agentSlug = this.extractAgentSlug(userId);
    const messagesPath = this.getMessagesPath(agentSlug, conversationId);

    if (!existsSync(messagesPath)) {
      return [];
    }

    const messages: UIMessage[] = [];
    const fileStream = createReadStream(messagesPath, 'utf-8');
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as UIMessage;
          messages.push(message);
        } catch (error) {
          console.error(`Failed to parse message: ${error}`);
        }
      }
    }

    // Apply limit if specified (take last N messages)
    if (options?.limit && messages.length > options.limit) {
      return messages.slice(-options.limit);
    }

    return messages;
  }

  async clearMessages(userId: string, conversationId: string): Promise<void> {
    const agentSlug = this.extractAgentSlug(userId);
    const messagesPath = this.getMessagesPath(agentSlug, conversationId);

    if (existsSync(messagesPath)) {
      await truncate(messagesPath, 0);
    }
  }

  // Conversations

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const agentSlug = this.extractAgentSlug(input.userId);
    const conversationsDir = this.getConversationsDir(agentSlug);
    await mkdir(conversationsDir, { recursive: true });

    const conversation: Conversation = {
      id: input.conversationId,
      userId: input.userId,
      agentId: input.agentId || agentSlug,
      title: input.title,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const conversationPath = this.getConversationPath(agentSlug, conversation.id);
    await writeFile(conversationPath, JSON.stringify(conversation, null, 2), 'utf-8');

    return conversation;
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
    const agentSlug = this.extractAgentSlug(userId);
    const conversationPath = this.getConversationPath(agentSlug, conversationId);

    if (!existsSync(conversationPath)) {
      return null;
    }

    const content = await readFile(conversationPath, 'utf-8');
    return JSON.parse(content) as Conversation;
  }

  async getConversations(
    userId: string,
    options?: GetConversationsOptions
  ): Promise<Conversation[]> {
    const agentSlug = this.extractAgentSlug(userId);
    const conversationsDir = this.getConversationsDir(agentSlug);

    if (!existsSync(conversationsDir)) {
      return [];
    }

    const files = await readdir(conversationsDir);
    const conversations: Conversation[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const conversationId = file.replace('.json', '');
      const conversation = await this.getConversation(userId, conversationId);
      if (conversation) {
        conversations.push(conversation);
      }
    }

    // Sort by updatedAt (most recent first)
    conversations.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // Apply limit if specified
    if (options?.limit) {
      return conversations.slice(0, options.limit);
    }

    return conversations;
  }

  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    return this.getConversations(userId);
  }

  async queryConversations(input: QueryConversationsInput): Promise<Conversation[]> {
    const conversations = await this.getConversations(input.userId);

    // Simple filtering based on metadata
    if (input.filters) {
      return conversations.filter((conv) => {
        for (const [key, value] of Object.entries(input.filters!)) {
          if (conv.metadata?.[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return conversations;
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    updates: Partial<Conversation>
  ): Promise<Conversation> {
    const existing = await this.getConversation(userId, conversationId);
    if (!existing) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const updated: Conversation = {
      ...existing,
      ...updates,
      id: existing.id, // Never update ID
      userId: existing.userId, // Never update userId
      updatedAt: new Date().toISOString(),
    };

    const agentSlug = this.extractAgentSlug(userId);
    const conversationPath = this.getConversationPath(agentSlug, conversationId);
    await writeFile(conversationPath, JSON.stringify(updated, null, 2), 'utf-8');

    return updated;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const agentSlug = this.extractAgentSlug(userId);

    // Delete conversation metadata
    const conversationPath = this.getConversationPath(agentSlug, conversationId);
    if (existsSync(conversationPath)) {
      await unlink(conversationPath);
    }

    // Delete messages
    const messagesPath = this.getMessagesPath(agentSlug, conversationId);
    if (existsSync(messagesPath)) {
      await unlink(messagesPath);
    }
  }

  // Working Memory (store as JSON files)

  async getWorkingMemory(userId: string, conversationId: string): Promise<string | null> {
    const agentSlug = this.extractAgentSlug(userId);
    const workingMemoryDir = join(this.getAgentMemoryDir(agentSlug), 'working');
    const workingMemoryPath = join(workingMemoryDir, `${conversationId}.json`);

    if (!existsSync(workingMemoryPath)) {
      return null;
    }

    const content = await readFile(workingMemoryPath, 'utf-8');
    const data = JSON.parse(content);
    return data.memory || null;
  }

  async setWorkingMemory(
    userId: string,
    conversationId: string,
    memory: string
  ): Promise<void> {
    const agentSlug = this.extractAgentSlug(userId);
    const workingMemoryDir = join(this.getAgentMemoryDir(agentSlug), 'working');
    await mkdir(workingMemoryDir, { recursive: true });

    const workingMemoryPath = join(workingMemoryDir, `${conversationId}.json`);
    const data = {
      conversationId,
      memory,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(workingMemoryPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async deleteWorkingMemory(userId: string, conversationId: string): Promise<void> {
    const agentSlug = this.extractAgentSlug(userId);
    const workingMemoryDir = join(this.getAgentMemoryDir(agentSlug), 'working');
    const workingMemoryPath = join(workingMemoryDir, `${conversationId}.json`);

    if (existsSync(workingMemoryPath)) {
      await unlink(workingMemoryPath);
    }
  }

  // Workflow State (store as JSON files)

  async getWorkflowState(workflowStateId: string): Promise<WorkflowState | null> {
    // Workflow states are stored globally, not per agent
    const workflowStatesDir = join(this.workAgentDir, 'workflows', 'states');
    const workflowStatePath = join(workflowStatesDir, `${workflowStateId}.json`);

    if (!existsSync(workflowStatePath)) {
      return null;
    }

    const content = await readFile(workflowStatePath, 'utf-8');
    return JSON.parse(content) as WorkflowState;
  }

  async setWorkflowState(state: WorkflowState): Promise<void> {
    const workflowStatesDir = join(this.workAgentDir, 'workflows', 'states');
    await mkdir(workflowStatesDir, { recursive: true });

    const workflowStatePath = join(workflowStatesDir, `${state.id}.json`);
    await writeFile(workflowStatePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async updateWorkflowState(
    workflowStateId: string,
    updates: Partial<WorkflowState>
  ): Promise<WorkflowState> {
    const existing = await this.getWorkflowState(workflowStateId);
    if (!existing) {
      throw new Error(`Workflow state ${workflowStateId} not found`);
    }

    const updated: WorkflowState = {
      ...existing,
      ...updates,
      id: existing.id, // Never update ID
      updatedAt: new Date().toISOString(),
    };

    await this.setWorkflowState(updated);
    return updated;
  }

  async getSuspendedWorkflowStates(userId?: string): Promise<WorkflowState[]> {
    const workflowStatesDir = join(this.workAgentDir, 'workflows', 'states');

    if (!existsSync(workflowStatesDir)) {
      return [];
    }

    const files = await readdir(workflowStatesDir);
    const states: WorkflowState[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const stateId = file.replace('.json', '');
      const state = await this.getWorkflowState(stateId);

      if (state && state.status === 'suspended') {
        // Filter by userId if provided
        if (!userId || state.context?.userId === userId) {
          states.push(state);
        }
      }
    }

    return states;
  }
}
