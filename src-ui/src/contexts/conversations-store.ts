import {
  deleteConversation as deleteConversationRequest,
  fetchConversationMessages,
  streamConversationTurn,
} from '@stallion-ai/sdk';
import { log } from '@/utils/logger';
import type { FileAttachment } from '../types';
import type {
  ConversationData,
  ConversationStatus,
  MessageData,
} from './conversation-types';

type ConversationsMap = Record<string, ConversationData[]>;
type MessagesMap = Record<string, MessageData[]>;
type StatusMap = Record<string, ConversationStatus>;

export class ConversationsStore {
  private conversations: ConversationsMap = {};
  private messages: MessagesMap = {};
  private statuses: StatusMap = {};
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();
  private snapshot = {
    conversations: this.conversations,
    messages: this.messages,
    statuses: this.statuses,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private notify = () => {
    this.snapshot = {
      conversations: this.conversations,
      messages: this.messages,
      statuses: this.statuses,
    };
    this.listeners.forEach((listener) => listener());
  };

  setStatus(
    agentSlug: string,
    conversationId: string,
    status: ConversationStatus,
  ) {
    const key = `${agentSlug}:${conversationId}`;
    this.statuses[key] = status;
    this.notify();
  }

  async fetchMessages(
    _apiBase: string,
    agentSlug: string,
    conversationId: string,
    queryClient?: any,
  ) {
    const key = `messages:${agentSlug}:${conversationId}`;
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        let toolMappings: Record<
          string,
          { server?: string; toolName?: string; originalName?: string }
        > = {};
        if (queryClient) {
          const cachedTools = queryClient.getQueryData([
            'agentTools',
            agentSlug,
          ]);
          if (cachedTools) {
            toolMappings = cachedTools.reduce((acc: any, tool: any) => {
              acc[tool.name] = {
                server: tool.server,
                toolName: tool.toolName,
                originalName: tool.originalName,
              };
              return acc;
            }, {});
          }
        }

        this.messages[key] = await fetchConversationMessages(
          agentSlug,
          conversationId,
          toolMappings,
        );
        this.notify();
      } catch (error) {
        log.api(`Failed to fetch messages for ${conversationId}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async refreshMessages(
    apiBase: string,
    agentSlug: string,
    conversationId: string,
    queryClient?: any,
  ) {
    const key = `messages:${agentSlug}:${conversationId}`;
    this.fetching.delete(key);
    return this.fetchMessages(apiBase, agentSlug, conversationId, queryClient);
  }

  async deleteConversation(
    _apiBase: string,
    agentSlug: string,
    conversationId: string,
  ) {
    try {
      await deleteConversationRequest(agentSlug, conversationId);
      this.conversations[agentSlug] = (
        this.conversations[agentSlug] || []
      ).filter((conversation) => conversation.id !== conversationId);
      delete this.messages[`messages:${agentSlug}:${conversationId}`];
      delete this.statuses[`${agentSlug}:${conversationId}`];
      this.notify();
    } catch (error) {
      log.api(`Failed to delete conversation ${conversationId}:`, error);
      throw error;
    }
  }

  async sendMessage(
    apiBase: string,
    agentSlug: string,
    conversationId: string | undefined,
    content: string,
    title: string | undefined,
    onStreamEvent: (data: any, state: any) => any,
    onConversationStarted?: (conversationId: string, title?: string) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal,
    model?: string,
    attachments?: FileAttachment[],
    projectSlug?: string,
  ): Promise<{ conversationId?: string; finishReason?: string }> {
    this.setStatus(agentSlug, conversationId || 'temp', 'streaming');

    try {
      const { conversationId: newConversationId, finishReason } =
        await streamConversationTurn({
          apiBase,
          agentSlug,
          conversationId,
          content,
          title,
          onStreamEvent,
          onConversationStarted,
          signal,
          model,
          attachments,
          projectSlug,
        });

      this.setStatus(agentSlug, newConversationId || 'temp', 'idle');

      if (newConversationId) {
        await this.refreshMessages(apiBase, agentSlug, newConversationId);

        const conversations = this.conversations[agentSlug] || [];
        const conversationIndex = conversations.findIndex(
          (conversation) => conversation.id === newConversationId,
        );
        if (conversationIndex >= 0) {
          conversations[conversationIndex] = {
            ...conversations[conversationIndex],
            updatedAt: new Date().toISOString(),
          };
          this.notify();
        }
      }

      return { conversationId: newConversationId, finishReason };
    } catch (error) {
      log.api('Send message error:', error);
      this.setStatus(agentSlug, conversationId || 'temp', 'idle');

      if (error instanceof Error && error.name !== 'AbortError') {
        onError?.(error);
      }

      throw error;
    }
  }
}

export const conversationsStore = new ConversationsStore();
