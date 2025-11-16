import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';
import { CONFIG_DEFAULTS } from './ConfigContext';

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
  private snapshot = { conversations: this.conversations, messages: this.messages, statuses: this.statuses };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify = () => {
    this.snapshot = { conversations: this.conversations, messages: this.messages, statuses: this.statuses };
    this.listeners.forEach(listener => listener());
  };

  setStatus(agentSlug: string, conversationId: string, status: ConversationStatus) {
    const key = `${agentSlug}:${conversationId}`;
    this.statuses[key] = status;
    this.notify();
  }

  async fetchConversations(apiBase: string, agentSlug: string) {
    const key = `conversations:${agentSlug}`;
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations`);
        const result = await response.json();
        
        if (result.success) {
          // Map backend format (resourceId) to frontend format (agentSlug)
          this.conversations[agentSlug] = result.data.map((conv: any) => ({
            ...conv,
            agentSlug: conv.resourceId || agentSlug,
          }));
          this.notify();
        }
      } catch (error) {
        console.error(`Failed to fetch conversations for ${agentSlug}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async fetchMessages(apiBase: string, agentSlug: string, conversationId: string) {
    const key = `messages:${agentSlug}:${conversationId}`;
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations/${conversationId}/messages`);
        const result = await response.json();
        
        if (result.success) {
          // Parse backend message format: { role, parts: [{ type, text }] } -> { role, content, contentParts }
          this.messages[key] = result.data.map((m: any) => {
            const textContent = m.parts?.map((p: any) => p.text || p.content).filter(Boolean).join('\n') || '';
            
            // Keep parts in AI SDK format (tool parts are already correct)
            const contentParts = m.parts?.map((p: any) => {
              if (p.type === 'text') {
                return { type: 'text', content: p.text };
              } else if (p.type?.startsWith('tool-')) {
                // Keep AI SDK format: { type: 'tool-{name}', toolCallId, state, input, output }
                return p;
              }
              return null;
            }).filter(Boolean);
            
            return {
              role: m.role,
              content: textContent,
              contentParts: contentParts?.length > 0 ? contentParts : undefined,
              timestamp: m.metadata?.timestamp || m.timestamp,
            };
          });
          this.notify();
        }
      } catch (error) {
        console.error(`Failed to fetch messages for ${conversationId}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async refreshMessages(apiBase: string, agentSlug: string, conversationId: string) {
    const key = `messages:${agentSlug}:${conversationId}`;
    // Clear cache and refetch
    this.fetching.delete(key);
    return this.fetchMessages(apiBase, agentSlug, conversationId);
  }

  async deleteConversation(apiBase: string, agentSlug: string, conversationId: string) {
    try {
      const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      
      if (result.success) {
        this.conversations[agentSlug] = (this.conversations[agentSlug] || []).filter(c => c.id !== conversationId);
        delete this.messages[`messages:${agentSlug}:${conversationId}`];
        delete this.statuses[`${agentSlug}:${conversationId}`];
        this.notify();
      }
    } catch (error) {
      console.error(`Failed to delete conversation ${conversationId}:`, error);
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
    signal?: AbortSignal
  ): Promise<string | undefined> {
    console.log('[ConversationsContext.sendMessage] Received signal:', signal);
    const key = conversationId ? `${agentSlug}:${conversationId}` : `${agentSlug}:temp`;
    this.setStatus(agentSlug, conversationId || 'temp', 'streaming');

    try {
      const payload = {
        input: content,
        options: {
          userId: CONFIG_DEFAULTS.userId,
          ...(conversationId ? { conversationId } : {}),
          ...(title ? { title } : {}),
        },
      };
      
      const response = await fetch(`${apiBase}/api/agents/${agentSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      // Track if we've been aborted
      let aborted = false;
      
      // Set up abort listener to cancel reader immediately
      const abortHandler = async () => {
        console.log('[ConversationsContext] Abort signal received, canceling reader');
        aborted = true;
        try {
          await reader.cancel();
        } catch (e) {
          console.log('[ConversationsContext] Reader cancel error (expected):', e);
        }
      };
      signal?.addEventListener('abort', abortHandler);

      const decoder = new TextDecoder();
      let buffer = '';
      let state = { currentTextChunk: '', contentParts: [], pendingApprovals: new Map() };
      let newConversationId = conversationId;

      try {
        while (true) {
          // Check abort before reading
          if (aborted || signal?.aborted) {
            console.log('[ConversationsContext] Aborting stream loop');
            break;
          }
          
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;
            
            const data = JSON.parse(dataStr);
            
            // Handle conversation-started event
            if (data.type === 'conversation-started' && data.conversationId) {
              newConversationId = data.conversationId;
              onConversationStarted?.(data.conversationId, data.title);
              continue;
            }
            
            const result = onStreamEvent(data, state);
            // Always update state to preserve pendingApprovals
            state = { 
              currentTextChunk: result.currentTextChunk, 
              contentParts: result.contentParts,
              pendingApprovals: result.pendingApprovals
            };
          }
        }
      } catch (error) {
        // If aborted, exit gracefully
        if (aborted || signal?.aborted || (error as Error).name === 'AbortError') {
          console.log('[ConversationsContext] Stream aborted via error');
          return;
        }
        throw error;
      } finally {
        signal?.removeEventListener('abort', abortHandler);
        try {
          reader.releaseLock();
        } catch (e) {
          // Reader might already be released
        }
      }

      this.setStatus(agentSlug, newConversationId || 'temp', 'idle');
      
      // Refresh messages for the conversation
      if (newConversationId) {
        await this.refreshMessages(apiBase, agentSlug, newConversationId);
      }
      
      return newConversationId;
    } catch (error) {
      console.error('Send message error:', error);
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
  fetchConversations: (apiBase: string, agentSlug: string) => Promise<void>;
  fetchMessages: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
  refreshMessages: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
  deleteConversation: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
  sendMessage: (
    apiBase: string,
    agentSlug: string,
    conversationId: string | undefined,
    content: string,
    onStreamEvent: (data: any, state: any) => any,
    onConversationStarted?: (conversationId: string) => void,
    onError?: (error: Error) => void
  ) => Promise<string | undefined>;
  setStatus: (agentSlug: string, conversationId: string, status: ConversationStatus) => void;
};

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const fetchConversations = useCallback((apiBase: string, agentSlug: string) => {
    return conversationsStore.fetchConversations(apiBase, agentSlug);
  }, []);

  const fetchMessages = useCallback((apiBase: string, agentSlug: string, conversationId: string) => {
    return conversationsStore.fetchMessages(apiBase, agentSlug, conversationId);
  }, []);

  const refreshMessages = useCallback((apiBase: string, agentSlug: string, conversationId: string) => {
    return conversationsStore.refreshMessages(apiBase, agentSlug, conversationId);
  }, []);

  const deleteConversation = useCallback((apiBase: string, agentSlug: string, conversationId: string) => {
    return conversationsStore.deleteConversation(apiBase, agentSlug, conversationId);
  }, []);

  const sendMessage = useCallback((
    apiBase: string,
    agentSlug: string,
    conversationId: string | undefined,
    content: string,
    title: string | undefined,
    onStreamEvent: (data: any, state: any) => any,
    onConversationStarted?: (conversationId: string, title?: string) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal
  ) => {
    return conversationsStore.sendMessage(apiBase, agentSlug, conversationId, content, title, onStreamEvent, onConversationStarted, onError, signal);
  }, []);

  const setStatus = useCallback((agentSlug: string, conversationId: string, status: ConversationStatus) => {
    conversationsStore.setStatus(agentSlug, conversationId, status);
  }, []);

  return (
    <ConversationsContext.Provider value={{ fetchConversations, fetchMessages, refreshMessages, deleteConversation, sendMessage, setStatus }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(apiBase: string, agentSlug: string, shouldFetch: boolean = true): ConversationData[] {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within ConversationsProvider');
  }

  const { fetchConversations } = context;

  const snapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch && agentSlug) {
      fetchConversations(apiBase, agentSlug);
    }
  }, [apiBase, agentSlug, shouldFetch, fetchConversations]);

  return snapshot.conversations[agentSlug] || [];
}

export function useMessages(apiBase: string, agentSlug: string, conversationId: string, shouldFetch: boolean = true): MessageData[] {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useMessages must be used within ConversationsProvider');
  }

  const { fetchMessages } = context;

  const snapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot
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
    throw new Error('useConversationActions must be used within ConversationsProvider');
  }
  return {
    fetchConversations: context.fetchConversations,
    fetchMessages: context.fetchMessages,
    deleteConversation: context.deleteConversation,
    refreshMessages: context.refreshMessages,
    sendMessage: context.sendMessage,
    setStatus: context.setStatus,
  };
}

export function useConversationStatus(agentSlug: string, conversationId: string) {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversationStatus must be used within ConversationsProvider');
  }

  const snapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot
  );

  const key = `${agentSlug}:${conversationId}`;
  const status = snapshot.statuses[key] || 'idle';

  const setStatus = useCallback((newStatus: ConversationStatus) => {
    context.setStatus(agentSlug, conversationId, newStatus);
  }, [agentSlug, conversationId, context]);

  return { status, setStatus };
}
