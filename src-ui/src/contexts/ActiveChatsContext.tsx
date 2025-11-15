import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore } from 'react';
import { useConversationActions, conversationsStore } from './ConversationsContext';
import { useStreamingMessage } from '../hooks/useStreamingMessage';
import { useApiBase } from './ConfigContext';
import type { FileAttachment } from '../types';

type ChatUIState = {
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  inputHistory: string[];
  status?: 'idle' | 'sending' | 'error';
  isProcessingStep?: boolean;
  error?: string | null;
  hasUnread: boolean;
  abortController?: AbortController;
  // Draft session metadata (for new chats without backend conversations yet)
  agentSlug?: string;
  agentName?: string;
  title?: string;
  conversationId?: string; // Backend conversation ID (set after first message)
  // Optimistic messages (shown immediately, replaced when backend responds)
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }>;
  // Ephemeral messages (user message before backend confirms, system messages)
  ephemeralMessages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }>;
  // Tool calls from this conversation (persisted across refreshes)
  toolCalls?: Array<{ id: string; name: string; args: any; result?: any; state?: string; error?: string }>;
  // Streaming message being built in real-time
  streamingMessage?: {
    role: 'assistant';
    content: string;
    contentParts?: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }>;
  };
};

type ActiveChatsMap = Record<string, ChatUIState>; // keyed by conversationId

class ActiveChatsStore {
  private chats: ActiveChatsMap = {};
  private listeners = new Set<() => void>();
  private snapshot = this.chats;
  private readonly STORAGE_KEY = 'activeChats';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const minimal: Array<{ sessionId: string; conversationId: string; agentSlug: string }> = JSON.parse(stored);
        // Initialize minimal chat states - everything else will be derived reactively
        for (const session of minimal) {
          this.chats[session.sessionId] = {
            input: '',
            attachments: [],
            queuedMessages: [],
            inputHistory: [],
            hasUnread: false,
            agentSlug: session.agentSlug,
            conversationId: session.conversationId,
          };
        }
        this.snapshot = this.chats;
      }
    } catch (e) {
      console.warn('Failed to load active chats from sessionStorage:', e);
    }
  }

  private saveToStorage() {
    try {
      // Save only minimal data needed for rehydration
      const minimal = Object.entries(this.chats)
        .filter(([_, chat]) => chat.conversationId) // Only save sessions with conversations
        .map(([sessionId, chat]) => ({
          sessionId,
          conversationId: chat.conversationId!,
          agentSlug: chat.agentSlug!,
        }));
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(minimal));
    } catch (e) {
      console.warn('Failed to save active chats to sessionStorage:', e);
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify = () => {
    this.snapshot = { ...this.chats };
    this.saveToStorage();
    this.listeners.forEach(listener => listener());
  };

  initChat(conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) {
    if (!this.chats[conversationId]) {
      this.chats[conversationId] = {
        input: '',
        attachments: [],
        queuedMessages: [],
        inputHistory: [],
        hasUnread: false,
        ...metadata,
      };
      this.notify();
    }
  }

  updateChat(conversationId: string, updates: Partial<ChatUIState>) {
    if (this.chats[conversationId]) {
      this.chats[conversationId] = { ...this.chats[conversationId], ...updates };
      this.notify();
    }
  }

  removeChat(conversationId: string) {
    delete this.chats[conversationId];
    this.notify();
  }

  clearInput(conversationId: string) {
    if (this.chats[conversationId]) {
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        input: '',
        attachments: [],
      };
      this.notify();
    }
  }

  addEphemeralMessage(conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }) {
    if (this.chats[conversationId]) {
      const current = this.chats[conversationId].ephemeralMessages || [];
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        ephemeralMessages: [...current, message],
      };
      this.notify();
    }
  }

  clearEphemeralMessages(conversationId: string) {
    if (this.chats[conversationId]) {
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        ephemeralMessages: [],
      };
      this.notify();
    }
  }

  assignConversationId(sessionId: string, conversationId: string) {
    // Just update the conversationId field, don't migrate the session
    if (this.chats[sessionId]) {
      this.chats[sessionId] = { ...this.chats[sessionId], conversationId };
      this.notify();
    }
  }

  removeQueuedMessage(sessionId: string, index: number) {
    if (this.chats[sessionId]) {
      const queued = [...(this.chats[sessionId].queuedMessages || [])];
      queued.splice(index, 1);
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: queued };
      this.notify();
    }
  }

  editQueuedMessage(sessionId: string, index: number, newContent: string) {
    if (this.chats[sessionId]) {
      const queued = [...(this.chats[sessionId].queuedMessages || [])];
      queued[index] = newContent;
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: queued };
      this.notify();
    }
  }

  clearQueue(sessionId: string) {
    if (this.chats[sessionId]) {
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: [] };
      this.notify();
    }
  }
}

export const activeChatsStore = new ActiveChatsStore();

type ActiveChatsContextType = {
  initChat: (conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) => void;
  updateChat: (conversationId: string, updates: Partial<ChatUIState>) => void;
  removeChat: (conversationId: string) => void;
  clearInput: (conversationId: string) => void;
  addEphemeralMessage: (conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }) => void;
  clearEphemeralMessages: (conversationId: string) => void;
  assignConversationId: (tempSessionId: string, conversationId: string) => void;
  removeQueuedMessage: (sessionId: string, index: number) => void;
  editQueuedMessage: (sessionId: string, index: number, newContent: string) => void;
  clearQueue: (sessionId: string) => void;
  getAllChats: () => Record<string, ChatUIState>;
};

const ActiveChatsContext = createContext<ActiveChatsContextType | undefined>(undefined);

export function ActiveChatsProvider({ children }: { children: ReactNode }) {
  const initChat = useCallback((conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) => {
    activeChatsStore.initChat(conversationId, metadata);
  }, []);

  const updateChat = useCallback((conversationId: string, updates: Partial<ChatUIState>) => {
    activeChatsStore.updateChat(conversationId, updates);
  }, []);

  const removeChat = useCallback((conversationId: string) => {
    activeChatsStore.removeChat(conversationId);
  }, []);

  const clearInput = useCallback((conversationId: string) => {
    activeChatsStore.clearInput(conversationId);
  }, []);

  const addEphemeralMessage = useCallback((conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }) => {
    activeChatsStore.addEphemeralMessage(conversationId, message);
  }, []);

  const clearEphemeralMessages = useCallback((conversationId: string) => {
    activeChatsStore.clearEphemeralMessages(conversationId);
  }, []);

  const assignConversationId = useCallback((tempSessionId: string, conversationId: string) => {
    activeChatsStore.assignConversationId(tempSessionId, conversationId);
  }, []);

  const getAllChats = useCallback(() => {
    return activeChatsStore.getSnapshot();
  }, []);

  const removeQueuedMessage = useCallback((sessionId: string, index: number) => {
    activeChatsStore.removeQueuedMessage(sessionId, index);
  }, []);

  const editQueuedMessage = useCallback((sessionId: string, index: number, newContent: string) => {
    activeChatsStore.editQueuedMessage(sessionId, index, newContent);
  }, []);

  const clearQueue = useCallback((sessionId: string) => {
    activeChatsStore.clearQueue(sessionId);
  }, []);

  return (
    <ActiveChatsContext.Provider value={{ 
      initChat, 
      updateChat, 
      removeChat, 
      clearInput, 
      addEphemeralMessage, 
      clearEphemeralMessages, 
      assignConversationId, 
      removeQueuedMessage,
      editQueuedMessage,
      clearQueue,
      getAllChats 
    }}>
      {children}
    </ActiveChatsContext.Provider>
  );
}

export function useActiveChatState(conversationId: string): ChatUIState | null {
  const context = useContext(ActiveChatsContext);
  if (!context) {
    throw new Error('useActiveChatState must be used within ActiveChatsProvider');
  }

  const chats = useSyncExternalStore(
    activeChatsStore.subscribe,
    activeChatsStore.getSnapshot,
    activeChatsStore.getSnapshot
  );

  return chats[conversationId] || null;
}

export function useActiveChatActions() {
  const context = useContext(ActiveChatsContext);
  if (!context) {
    throw new Error('useActiveChatActions must be used within ActiveChatsProvider');
  }
  return context;
}

export function useAllActiveChats(): Record<string, ChatUIState> {
  return useSyncExternalStore(
    activeChatsStore.subscribe,
    activeChatsStore.getSnapshot,
    activeChatsStore.getSnapshot
  );
}

export function useSendMessage(apiBase: string, onActiveSessionChange?: (newSessionId: string) => void, onError?: (error: Error) => void) {
  const { updateChat, clearInput, assignConversationId } = useActiveChatActions();
  const { sendMessage: sendToServer } = useConversationActions();
  const { handleStreamEvent, clearStreamingMessage } = useStreamingMessage();

  return useCallback(async (sessionId: string, agentSlug: string, conversationId: string | undefined, content: string) => {
    const allChats = activeChatsStore.getSnapshot();
    const currentState = allChats[sessionId];
    
    // If already sending, queue the message instead of aborting
    if (currentState?.status === 'sending') {
      console.log('[useSendMessage] Already sending, queueing message:', content.substring(0, 50));
      updateChat(sessionId, { 
        queuedMessages: [...(currentState.queuedMessages || []), content]
      });
      return;
    }
    
    console.log('[useSendMessage] Starting send:', {
      sessionId,
      agentSlug,
      conversationId,
      queuedCount: currentState?.queuedMessages?.length || 0
    });
    
    // Add user message to messages array
    const updatedMessages = [
      ...(currentState?.messages || []),
      { role: 'user' as const, content }
    ];
    
    // Create abort controller for this request
    const abortController = new AbortController();
    console.log('[useSendMessage] Created abort controller:', abortController);
    
    clearInput(sessionId);
    updateChat(sessionId, { status: 'sending', messages: updatedMessages, abortController });
    
    // Verify it was stored
    const updatedState = activeChatsStore.getSnapshot()[sessionId];
    console.log('[useSendMessage] After updateChat, stored abortController:', {
      sessionId,
      hasAbortController: !!updatedState?.abortController,
      status: updatedState?.status
    });

    // Track the current session ID (will change after migration)
    let currentSessionId = sessionId;

    try {
      console.log('[useSendMessage] Starting send:', { sessionId, agentSlug, conversationId });
      
      // Pass title for new conversations
      const title = !conversationId ? currentState?.title : undefined;
      
      // Delegate to ConversationsContext for server communication
      const newConversationId = await sendToServer(
        apiBase,
        agentSlug,
        conversationId,
        content,
        title,
        (data, state) => handleStreamEvent(currentSessionId, data, state),
        (convId, title) => {
          // Assign conversationId to the session (don't migrate, just update the field)
          console.log('[useSendMessage] Assigning conversationId:', convId);
          assignConversationId(sessionId, convId);
          if (title) {
            updateChat(sessionId, { title });
          }
          onActiveSessionChange?.(sessionId);
        },
        onError,
        abortController.signal
      );
      
      console.log('[useSendMessage] Passed signal to sendToServer:', abortController.signal);

      console.log('[useSendMessage] Send completed, conversationId:', newConversationId);
      
      // Replace messages with backend truth (use sessionId, not conversationId)
      try {
        const messagesKey = `messages:${agentSlug}:${newConversationId}`;
        const backendMessages = conversationsStore.getSnapshot().messages[messagesKey] || [];
        
        console.log('[useSendMessage] Replacing messages:', { 
          sessionId, 
          messagesKey,
          backendMessagesCount: backendMessages.length,
          allKeys: Object.keys(conversationsStore.getSnapshot().messages)
        });
        
        clearStreamingMessage(sessionId);
        updateChat(sessionId, { 
          status: 'idle',
          abortController: undefined,
          messages: backendMessages.map(m => ({ role: m.role, content: m.content, contentParts: m.contentParts }))
        });
        
        // Process next queued message if any
        const updatedState = activeChatsStore.getSnapshot()[sessionId];
        if (updatedState?.queuedMessages && updatedState.queuedMessages.length > 0) {
          const [nextMessage, ...remainingQueue] = updatedState.queuedMessages;
          console.log('[useSendMessage] Processing queued message:', nextMessage.substring(0, 50));
          updateChat(sessionId, { queuedMessages: remainingQueue });
          // Process next message asynchronously
          setTimeout(() => {
            sendMessage(sessionId, agentSlug, updatedState.conversationId, nextMessage);
          }, 100);
        }
      } catch (replaceError) {
        console.error('[useSendMessage] Error replacing messages:', replaceError);
        // At least clear the status
        clearStreamingMessage(sessionId);
        updateChat(sessionId, { status: 'idle', abortController: undefined });
      }
      
    } catch (error) {
      const err = error as Error;
      
      updateChat(sessionId, { status: 'error', error: err.message, abortController: undefined });
      clearStreamingMessage(sessionId);
    }
  }, [apiBase, updateChat, clearInput, assignConversationId, sendToServer, handleStreamEvent, clearStreamingMessage, onActiveSessionChange, onError]);
}

export function useCancelMessage() {
  const { updateChat } = useActiveChatActions();
  const apiBase = useApiBase().apiBase;
  
  return useCallback((sessionId: string) => {
    const state = activeChatsStore.getSnapshot()[sessionId];
    console.log('[useCancelMessage] Called for session:', sessionId, {
      hasState: !!state,
      hasAbortController: !!state?.abortController,
      status: state?.status,
      signalAborted: state?.abortController?.signal.aborted,
      conversationId: state?.conversationId,
      agentSlug: state?.agentSlug
    });
    
    if (state?.abortController && state?.status === 'sending') {
      console.log('[useCancelMessage] Aborting...');
      state.abortController.abort('User cancelled');
      console.log('[useCancelMessage] After abort, signal.aborted:', state.abortController.signal.aborted);
      
      // Backend will detect the abort and remove incomplete response from memory
      
      // Update UI state
      updateChat(sessionId, { status: 'idle', abortController: undefined });
    } else {
      console.log('[useCancelMessage] Cannot cancel - conditions not met');
    }
  }, [apiBase, updateChat]);
}

export function useCreateChatSession() {
  const { initChat } = useActiveChatActions();

  return useCallback((agentSlug: string, agentName: string, title?: string) => {
    const sessionId = `${agentSlug}:${Date.now()}`;
    initChat(sessionId, {
      agentSlug,
      agentName,
      title: title || `${agentName} Chat`,
    });
    return sessionId;
  }, [initChat]);
}

export function useOpenConversation(apiBase: string) {
  const { initChat, updateChat } = useActiveChatActions();
  const { fetchMessages } = useConversationActions();

  return useCallback(async (conversationId: string, agentSlug: string, agentName: string) => {
    const sessionId = `${agentSlug}:${Date.now()}`;
    
    initChat(sessionId, {
      agentSlug,
      agentName,
      title: `${agentName} Chat`,
      conversationId,
    });
    
    // Load messages
    await fetchMessages(apiBase, agentSlug, conversationId);
    const key = `messages:${agentSlug}:${conversationId}`;
    const messages = conversationsStore.getSnapshot().messages[key] || [];
    updateChat(sessionId, { messages });
    
    return sessionId;
  }, [apiBase, initChat, updateChat, fetchMessages]);
}

export function useRehydrateSessions(apiBase: string) {
  const { fetchMessages, fetchConversations } = useConversationActions();

  return useCallback(async () => {
    const allChats = activeChatsStore.getSnapshot();
    const agentSlugs = new Set<string>();
    
    // Collect unique agent slugs
    for (const chat of Object.values(allChats)) {
      if (chat.agentSlug) {
        agentSlugs.add(chat.agentSlug);
      }
    }
    
    // Fetch conversations metadata for all agents (for titles)
    for (const slug of agentSlugs) {
      fetchConversations(apiBase, slug);
    }
    
    // Fetch messages for each conversation
    for (const chat of Object.values(allChats)) {
      if (chat.conversationId && chat.agentSlug) {
        fetchMessages(apiBase, chat.agentSlug, chat.conversationId);
      }
    }
  }, [apiBase, fetchMessages, fetchConversations]);
}

export type { ChatUIState };
