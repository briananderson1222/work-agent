import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';
import { useConversationsQuery, useQueryClient } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';
import { CONFIG_DEFAULTS } from './ConfigContext';
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
  contentParts?: Array<{ type: string; content?: string; url?: string; mediaType?: string; name?: string }>;
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

  async fetchConversations(apiBase: string, agentSlug: string, force = false) {
    const key = `conversations:${agentSlug}`;
    if (!force && this.fetching.has(key)) {
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
        log.api(`Failed to fetch conversations for ${agentSlug}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async fetchMessages(apiBase: string, agentSlug: string, conversationId: string, queryClient?: any) {
    const key = `messages:${agentSlug}:${conversationId}`;
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        // Fetch messages
        const messagesResponse = await fetch(`${apiBase}/agents/${agentSlug}/conversations/${conversationId}/messages`);
        const result = await messagesResponse.json();
        
        // Get tool mappings from React Query cache (already fetched by useAgentTools)
        let toolMappings: Record<string, { server?: string; toolName?: string; originalName?: string }> = {};
        if (queryClient) {
          const cachedTools = queryClient.getQueryData(['agentTools', agentSlug]);
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
        
        if (result.success) {
          // Parse backend message format: { role, parts: [{ type, text }] } -> { role, content, contentParts }
          this.messages[key] = result.data.map((m: any) => {
            const textContent = m.parts?.map((p: any) => p.text || p.content).filter(Boolean).join('\n') || '';
            
            // Keep parts in AI SDK format and enrich tool parts
            const contentParts = m.parts?.map((p: any) => {
              if (p.type === 'text') {
                return { type: 'text', content: p.text };
              } else if (p.type === 'reasoning') {
                return { type: 'reasoning', content: p.text };
              } else if (p.type === 'file') {
                // Preserve file parts (images) from UIMessage format
                // Derive name from mediaType if not stored (e.g., "image/png" -> "Image")
                const typeName = p.mediaType?.split('/')[0] || 'File';
                return { type: 'file', url: p.url, mediaType: p.mediaType, name: p.name || `${typeName.charAt(0).toUpperCase() + typeName.slice(1)}` };
              } else if (p.type?.startsWith('tool-')) {
                // Enrich tool parts with server and toolName from mappings
                const toolName = p.type.replace('tool-', '');
                const mapping = toolMappings[toolName] || {};
                
                return {
                  ...p,
                  server: p.server || mapping.server,
                  toolName: p.toolName || mapping.toolName || toolName,
                  originalName: p.originalName || mapping.originalName,
                };
              }
              return null;
            }).filter(Boolean);
            
            return {
              role: m.role,
              content: textContent,
              contentParts: contentParts?.length > 0 ? contentParts : undefined,
              timestamp: m.metadata?.timestamp || m.timestamp,
              traceId: m.metadata?.traceId,
            };
          });
          this.notify();
        }
      } catch (error) {
        log.api(`Failed to fetch messages for ${conversationId}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async refreshMessages(apiBase: string, agentSlug: string, conversationId: string, queryClient?: any) {
    const key = `messages:${agentSlug}:${conversationId}`;
    // Clear cache and refetch
    this.fetching.delete(key);
    return this.fetchMessages(apiBase, agentSlug, conversationId, queryClient);
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
    attachments?: FileAttachment[]
  ): Promise<{ conversationId?: string; finishReason?: string }> {
    const key = conversationId ? `${agentSlug}:${conversationId}` : `${agentSlug}:temp`;
    this.setStatus(agentSlug, conversationId || 'temp', 'streaming');

    try {
      // Build input - either string or UIMessage array with parts
      // UIMessage format uses FileUIPart for images: { type: 'file', url: dataUri, mediaType: string }
      let input: string | Array<{ id: string; role: string; parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }> }>;
      
      if (attachments && attachments.length > 0) {
        const parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = [];
        
        // Add text part only if user provided content
        if (content) {
          parts.push({ type: 'text', text: content });
        }
        
        // Add file parts for each attachment (UIMessage FileUIPart format)
        for (const att of attachments) {
          parts.push({
            type: 'file',
            url: att.data,
            mediaType: att.type,
          });
        }
        
        // Wrap in UIMessage format that VoltAgent expects
        input = [{
          id: `msg-${Date.now()}`,
          role: 'user',
          parts,
        }];
      } else {
        input = content;
      }
      
      const payload = {
        input,
        options: {
          userId: CONFIG_DEFAULTS.userId,
          ...(conversationId ? { conversationId } : {}),
          ...(title ? { title } : {}),
          ...(model ? { model } : {}),
        },
      };
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      // Mark user-initiated cancels with a header (checked before abort)
      if ((signal as any)?._userInitiated) {
        headers['X-Abort-Reason'] = 'user-cancel';
      }
      
      const response = await fetch(`${apiBase}/api/agents/${agentSlug}/chat`, {
        method: 'POST',
        headers,
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
        aborted = true;
        try {
          await reader.cancel();
        } catch (e) {
        }
      };
      signal?.addEventListener('abort', abortHandler);

      const decoder = new TextDecoder();
      let buffer = '';
      let state = { currentTextChunk: '', contentParts: [], pendingApprovals: new Map(), reasoningChunks: [] };
      let newConversationId = conversationId;
      let finishReason: string | undefined;

      try {
        while (true) {
          // Check abort before reading
          if (aborted || signal?.aborted) {
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
            
            // Capture finishReason from finish event
            if (data.type === 'finish' && data.finishReason) {
              finishReason = data.finishReason;
            }
            
            const result = onStreamEvent(data, state);
            
            // DEBUG: Log state update timing
            if (data.type === 'text-delta') {
            }
            
            // Always update state to preserve all fields
            state = { 
              currentTextChunk: result.currentTextChunk, 
              contentParts: result.contentParts,
              pendingApprovals: result.pendingApprovals,
              reasoningChunks: result.reasoningChunks,
              currentReasoningChunk: result.currentReasoningChunk
            };
          }
        }
      } catch (error) {
        // If aborted, exit gracefully
        if (aborted || signal?.aborted || (error as Error).name === 'AbortError') {
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
      
      // Refresh messages and update conversation timestamp
      if (newConversationId) {
        await this.refreshMessages(apiBase, agentSlug, newConversationId);
        
        // Update conversation timestamp locally
        const conversations = this.conversations[agentSlug] || [];
        const convIndex = conversations.findIndex(c => c.id === newConversationId);
        if (convIndex >= 0) {
          conversations[convIndex] = {
            ...conversations[convIndex],
            updatedAt: new Date().toISOString()
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
  fetchConversations: (apiBase: string, agentSlug: string) => Promise<void>;
  fetchMessages: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
  refreshMessages: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
  deleteConversation: (apiBase: string, agentSlug: string, conversationId: string) => Promise<void>;
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
    attachments?: FileAttachment[]
  ) => Promise<{ conversationId?: string; finishReason?: string }>;
  setStatus: (agentSlug: string, conversationId: string, status: ConversationStatus) => void;
};

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  
  const fetchConversations = useCallback((apiBase: string, agentSlug: string) => {
    return conversationsStore.fetchConversations(apiBase, agentSlug);
  }, []);

  const fetchMessages = useCallback((apiBase: string, agentSlug: string, conversationId: string) => {
    return conversationsStore.fetchMessages(apiBase, agentSlug, conversationId, queryClient);
  }, [queryClient]);

  const refreshMessages = useCallback((apiBase: string, agentSlug: string, conversationId: string) => {
    return conversationsStore.refreshMessages(apiBase, agentSlug, conversationId, queryClient);
  }, [queryClient]);

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
    signal?: AbortSignal,
    model?: string,
    attachments?: FileAttachment[]
  ) => {
    return conversationsStore.sendMessage(apiBase, agentSlug, conversationId, content, title, onStreamEvent, onConversationStarted, onError, signal, model, attachments);
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

export function useConversations(agentSlug: string): ConversationData[] {
  const { data, error } = useConversationsQuery(agentSlug);
  
  if (error) log.api(`Failed to fetch conversations for ${agentSlug}:`, error);
  
  // Map backend format (resourceId) to frontend format (agentSlug)
  return (data || []).map((conv: any) => ({
    ...conv,
    agentSlug: conv.resourceId || agentSlug,
  }));
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
