import {
  deleteConversation as deleteConversationRequest,
  fetchConversationMessages,
  streamConversationTurn,
  useConversationsQuery,
  useQueryClient,
} from '@stallion-ai/sdk';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { log } from '@/utils/logger';
import type { FileAttachment } from '../types';

export type ConversationStatus = 'idle' | 'streaming' | 'processing';

type ConversationData = {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

type MessageData = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  traceId?: string;
  contentParts?: Array<{
    type: string;
    content?: string;
    url?: string;
    mediaType?: string;
    name?: string;
  }>;
};

type ConversationsMap = Record<string, ConversationData[]>;
type MessagesMap = Record<string, MessageData[]>;
type StatusMap = Record<string, ConversationStatus>;

class ConversationsStore {
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

  getSnapshot = () => {
    return this.snapshot;
  };

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
        // Fetch messages
        // Get tool mappings from React Query cache (already fetched by useAgentTools)
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
    // Clear cache and refetch
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
      ).filter((c) => c.id !== conversationId);
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
    void (conversationId
      ? `${agentSlug}:${conversationId}`
      : `${agentSlug}:temp`);
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

      // Refresh messages and update conversation timestamp
      if (newConversationId) {
        await this.refreshMessages(apiBase, agentSlug, newConversationId);

        // Update conversation timestamp locally
        const conversations = this.conversations[agentSlug] || [];
        const convIndex = conversations.findIndex(
          (c) => c.id === newConversationId,
        );
        if (convIndex >= 0) {
          conversations[convIndex] = {
            ...conversations[convIndex],
            updatedAt: new Date().toISOString(),
          };
          this.notify();
        }
      }

      return { conversationId: newConversationId, finishReason };
    } catch (error) {
      log.api('Send message error:', error);
      this.setStatus(agentSlug, conversationId || 'temp', 'idle');

      // Don't call onError for aborted requests
      if (error instanceof Error && error.name !== 'AbortError') {
        onError?.(error);
      }

      throw error;
    }
  }
}

export const conversationsStore = new ConversationsStore();

type ConversationsContextType = {
  fetchMessages: (
    apiBase: string,
    agentSlug: string,
    conversationId: string,
  ) => Promise<void>;
  refreshMessages: (
    apiBase: string,
    agentSlug: string,
    conversationId: string,
  ) => Promise<void>;
  deleteConversation: (
    apiBase: string,
    agentSlug: string,
    conversationId: string,
  ) => Promise<void>;
  sendMessage: (
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
  ) => Promise<{ conversationId?: string; finishReason?: string }>;
  setStatus: (
    agentSlug: string,
    conversationId: string,
    status: ConversationStatus,
  ) => void;
};

const ConversationsContext = createContext<
  ConversationsContextType | undefined
>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const fetchMessages = useCallback(
    (apiBase: string, agentSlug: string, conversationId: string) => {
      return conversationsStore.fetchMessages(
        apiBase,
        agentSlug,
        conversationId,
        queryClient,
      );
    },
    [queryClient],
  );

  const refreshMessages = useCallback(
    (apiBase: string, agentSlug: string, conversationId: string) => {
      return conversationsStore.refreshMessages(
        apiBase,
        agentSlug,
        conversationId,
        queryClient,
      );
    },
    [queryClient],
  );

  const deleteConversation = useCallback(
    (apiBase: string, agentSlug: string, conversationId: string) => {
      return conversationsStore.deleteConversation(
        apiBase,
        agentSlug,
        conversationId,
      );
    },
    [],
  );

  const sendMessage = useCallback(
    (
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
    ) => {
      return conversationsStore.sendMessage(
        apiBase,
        agentSlug,
        conversationId,
        content,
        title,
        onStreamEvent,
        onConversationStarted,
        onError,
        signal,
        model,
        attachments,
        projectSlug,
      );
    },
    [],
  );

  const setStatus = useCallback(
    (agentSlug: string, conversationId: string, status: ConversationStatus) => {
      conversationsStore.setStatus(agentSlug, conversationId, status);
    },
    [],
  );

  return (
    <ConversationsContext.Provider
      value={{
        fetchMessages,
        refreshMessages,
        deleteConversation,
        sendMessage,
        setStatus,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(agentSlug: string): ConversationData[] {
  const { data, error } = useConversationsQuery(agentSlug);

  if (error) log.api(`Failed to fetch conversations for ${agentSlug}:`, error);

  // Map backend format (resourceId) to frontend format (agentSlug)
  return (data || []).map((conv: any) => ({
    ...conv,
    agentSlug: conv.resourceId || agentSlug,
  }));
}

export function useMessages(
  apiBase: string,
  agentSlug: string,
  conversationId: string,
  shouldFetch: boolean = true,
): MessageData[] {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useMessages must be used within ConversationsProvider');
  }

  const { fetchMessages } = context;

  const snapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot,
  );

  useEffect(() => {
    if (shouldFetch && agentSlug && conversationId) {
      fetchMessages(apiBase, agentSlug, conversationId);
    }
  }, [apiBase, agentSlug, conversationId, shouldFetch, fetchMessages]);

  const key = `messages:${agentSlug}:${conversationId}`;
  return snapshot.messages[key] || [];
}

export function useConversationActions() {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error(
      'useConversationActions must be used within ConversationsProvider',
    );
  }
  return {
    fetchMessages: context.fetchMessages,
    deleteConversation: context.deleteConversation,
    refreshMessages: context.refreshMessages,
    sendMessage: context.sendMessage,
    setStatus: context.setStatus,
  };
}

export function useConversationStatus(
  agentSlug: string,
  conversationId: string,
) {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error(
      'useConversationStatus must be used within ConversationsProvider',
    );
  }

  const snapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot,
  );

  const key = `${agentSlug}:${conversationId}`;
  const status = snapshot.statuses[key] || 'idle';

  const setStatus = useCallback(
    (newStatus: ConversationStatus) => {
      context.setStatus(agentSlug, conversationId, newStatus);
    },
    [agentSlug, conversationId, context],
  );

  return { status, setStatus };
}
