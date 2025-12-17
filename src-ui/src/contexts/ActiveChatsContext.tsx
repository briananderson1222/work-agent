import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore } from 'react';
import { log } from '@/utils/logger';
import { useConversationActions, conversationsStore } from './ConversationsContext';
import { useStreamingMessage } from '../hooks/useStreamingMessage';
import { useApiBase } from './ApiBaseContext';
import type { FileAttachment } from '../types';

type ChatUIState = {
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  inputHistory: string[];
  historyIndex?: number; // Current position in input history (-1 = not navigating)
  savedInput?: string; // Original unsent text before navigating history
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
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[]; traceId?: string }>;
  // Ephemeral messages (user message before backend confirms, system messages)
  ephemeralMessages?: Array<{ 
    role: 'user' | 'assistant' | 'system'; 
    content: string; 
    attachments?: any[]; 
    action?: { label: string; handler: () => void };
    traceId?: string;
  }>;
  // Tool calls from this conversation (persisted across refreshes)
  toolCalls?: Array<{ id: string; name: string; args: any; result?: any; state?: string; error?: string }>;
  // Streaming message being built in real-time
  streamingMessage?: {
    role: 'assistant';
    content: string;
    contentParts?: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }>;
  };
  // Session-specific autoApprove list (tools trusted for this session only)
  sessionAutoApprove?: string[];
  // Pending tool approvals (approvalId -> toolName)
  pendingApprovals?: string[];
  // Mapping of approvalId -> toastId for dismissing notifications
  approvalToasts?: Map<string, string>;
};

type ActiveChatsMap = Record<string, ChatUIState>; // keyed by conversationId

class ActiveChatsStore {
  private chats: ActiveChatsMap = {};
  private listeners = new Set<() => void>();
  private snapshot = this.chats;
  private readonly STORAGE_KEY = 'activeChats';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const minimal: Array<{ sessionId: string; conversationId: string; agentSlug: string; model?: string; sessionAutoApprove?: string[]; ephemeralMessages?: any[]; inputHistory?: string[] }> = JSON.parse(stored);
        // Initialize minimal chat states - everything else will be derived reactively
        for (const session of minimal) {
          this.chats[session.sessionId] = {
            input: '',
            attachments: [],
            queuedMessages: [],
            inputHistory: session.inputHistory || [],
            hasUnread: false,
            agentSlug: session.agentSlug,
            conversationId: session.conversationId,
            model: session.model,
            sessionAutoApprove: session.sessionAutoApprove || [],
            ephemeralMessages: session.ephemeralMessages || [],
          };
        }
        this.snapshot = this.chats;
      }
    } catch (e) {
      log.debug('Failed to load active chats from sessionStorage:', e);
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
          model: chat.model,
          sessionAutoApprove: chat.sessionAutoApprove || [],
          ephemeralMessages: chat.ephemeralMessages || [],
          inputHistory: chat.inputHistory || [],
        }));
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(minimal));
    } catch (e) {
      log.debug('Failed to save active chats to sessionStorage:', e);
    }
  }

  private debouncedSave = () => {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveToStorage();
      this.saveTimer = null;
    }, 300);
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify = (persist = false) => {
    this.snapshot = { ...this.chats };
    if (persist) {
      this.debouncedSave();
    }
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
      this.notify(true);
    }
  }

  updateChat(conversationId: string, updates: Partial<ChatUIState>) {
    if (this.chats[conversationId]) {
      // If updating input and not navigating history, reset historyIndex
      if ('input' in updates && !('historyIndex' in updates)) {
        updates = { ...updates, historyIndex: -1 };
      }
      this.chats[conversationId] = { ...this.chats[conversationId], ...updates };
      
      // Only persist if updating conversationId, model, sessionAutoApprove, or ephemeralMessages
      const shouldPersist = 'conversationId' in updates || 'model' in updates || 
        'sessionAutoApprove' in updates || 'ephemeralMessages' in updates;
      this.notify(shouldPersist);
    }
  }

  removeChat(conversationId: string) {
    delete this.chats[conversationId];
    this.notify(true);
  }

  clearInput(conversationId: string) {
    if (this.chats[conversationId]) {
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        input: '',
        attachments: [],
      };
      this.notify(false); // Don't persist input clearing
    }
  }

  navigateHistoryUp(conversationId: string) {
    const chat = this.chats[conversationId];
    if (!chat) {
      return;
    }

    const history = chat.inputHistory || [];
    if (history.length === 0) {
      return;
    }
    
    const currentIndex = chat.historyIndex ?? -1;
    
    // First time pressing up - save current input
    if (currentIndex === -1) {
      const savedInput = chat.input || '';
      const newIndex = history.length - 1;
      
      
      this.chats[conversationId] = {
        ...chat,
        input: history[newIndex],
        historyIndex: newIndex,
        savedInput,
      };
    } else {
      // Already navigating - go to previous
      if (currentIndex === 0) {
        return;
      }
      const newIndex = currentIndex - 1;
      
      
      this.chats[conversationId] = {
        ...chat,
        input: history[newIndex],
        historyIndex: newIndex,
      };
    }
    this.notify(false); // Don't persist navigation
  }

  navigateHistoryDown(conversationId: string) {
    const chat = this.chats[conversationId];
    if (!chat) {
      return;
    }

    const currentIndex = chat.historyIndex ?? -1;
    if (currentIndex === -1) {
      return;
    }

    const history = chat.inputHistory || [];
    const newIndex = currentIndex + 1;
    
    // Reached the end - restore saved input or clear
    if (newIndex >= history.length) {
      const restoredInput = chat.savedInput || '';
      
      
      this.chats[conversationId] = {
        ...chat,
        input: restoredInput,
        historyIndex: -1,
        savedInput: undefined,
      };
    } else {
      
      this.chats[conversationId] = {
        ...chat,
        input: history[newIndex],
        historyIndex: newIndex,
      };
    }
    this.notify(false); // Don't persist navigation
  }

  addEphemeralMessage(conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }, backendMessageCount?: number) {
    if (this.chats[conversationId]) {
      const current = this.chats[conversationId].ephemeralMessages || [];
      
      // Get the latest timestamp from backend messages (from ConversationsContext)
      const conversationsSnapshot = conversationsStore.getSnapshot();
      const messagesKey = `messages:${this.chats[conversationId].agentSlug}:${conversationId}`;
      const backendMessages = conversationsSnapshot.messages[messagesKey] || [];
      
      const latestTimestamp = backendMessages.length > 0 
        ? Math.max(...backendMessages.map(m => m.timestamp || 0))
        : Date.now();
      
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        ephemeralMessages: [...current, { 
          ...message, 
          id: `ephemeral-${Date.now()}-${Math.random()}`,
          timestamp: latestTimestamp + 1, // Ensure it appears after the latest backend message
          ephemeral: true,
          insertAfterCount: backendMessageCount ?? 0, // Store how many backend messages existed
        }],
      };
      this.notify(true); // Persist ephemeral messages
    }
  }

  clearEphemeralMessages(conversationId: string) {
    if (this.chats[conversationId]) {
      this.chats[conversationId] = {
        ...this.chats[conversationId],
        ephemeralMessages: [],
      };
      this.notify(true); // Persist clearing
    }
  }

  assignConversationId(sessionId: string, conversationId: string) {
    // Just update the conversationId field, don't migrate the session
    if (this.chats[sessionId]) {
      this.chats[sessionId] = { ...this.chats[sessionId], conversationId };
      this.notify(true); // Persist conversation assignment
    }
  }

  removeQueuedMessage(sessionId: string, index: number) {
    if (this.chats[sessionId]) {
      const queued = [...(this.chats[sessionId].queuedMessages || [])];
      queued.splice(index, 1);
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: queued };
      this.notify(false); // Don't persist queue changes
    }
  }

  editQueuedMessage(sessionId: string, index: number, newContent: string) {
    if (this.chats[sessionId]) {
      const queued = [...(this.chats[sessionId].queuedMessages || [])];
      queued[index] = newContent;
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: queued };
      this.notify(false); // Don't persist queue changes
    }
  }

  clearQueue(sessionId: string) {
    if (this.chats[sessionId]) {
      this.chats[sessionId] = { ...this.chats[sessionId], queuedMessages: [] };
      this.notify(false); // Don't persist queue clearing
    }
  }

  addToInputHistory(sessionId: string, input: string) {
    if (this.chats[sessionId]) {
      const history = this.chats[sessionId].inputHistory || [];
      this.chats[sessionId] = { 
        ...this.chats[sessionId], 
        inputHistory: [...history, input],
        historyIndex: -1, // Reset to top
        savedInput: undefined, // Clear saved input
      };
      this.notify(true); // Persist input history changes
    }
  }
}

export const activeChatsStore = new ActiveChatsStore();

type ActiveChatsContextType = {
  initChat: (conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) => void;
  updateChat: (conversationId: string, updates: Partial<ChatUIState>, sync?: boolean) => void;
  removeChat: (conversationId: string) => void;
  clearInput: (conversationId: string) => void;
  addEphemeralMessage: (conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }) => void;
  clearEphemeralMessages: (conversationId: string) => void;
  assignConversationId: (tempSessionId: string, conversationId: string) => void;
  removeQueuedMessage: (sessionId: string, index: number) => void;
  editQueuedMessage: (sessionId: string, index: number, newContent: string) => void;
  clearQueue: (sessionId: string) => void;
  addToInputHistory: (sessionId: string, input: string) => void;
  navigateHistoryUp: (conversationId: string) => void;
  navigateHistoryDown: (conversationId: string) => void;
  getAllChats: () => Record<string, ChatUIState>;
};

const ActiveChatsContext = createContext<ActiveChatsContextType | undefined>(undefined);

export function ActiveChatsProvider({ children }: { children: ReactNode }) {
  const initChat = useCallback((conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) => {
    activeChatsStore.initChat(conversationId, metadata);
  }, []);

  const updateChat = useCallback((conversationId: string, updates: Partial<ChatUIState>, sync?: boolean) => {
    activeChatsStore.updateChat(conversationId, updates, sync);
  }, []);

  const removeChat = useCallback((conversationId: string) => {
    activeChatsStore.removeChat(conversationId);
  }, []);

  const clearInput = useCallback((conversationId: string) => {
    activeChatsStore.clearInput(conversationId);
  }, []);

  const addEphemeralMessage = useCallback((conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; contentType?: 'markdown' | 'html'; attachments?: any[] }) => {
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

  const addToInputHistory = useCallback((sessionId: string, input: string) => {
    activeChatsStore.addToInputHistory(sessionId, input);
  }, []);

  const navigateHistoryUp = useCallback((conversationId: string) => {
    activeChatsStore.navigateHistoryUp(conversationId);
  }, []);

  const navigateHistoryDown = useCallback((conversationId: string) => {
    activeChatsStore.navigateHistoryDown(conversationId);
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
      addToInputHistory,
      navigateHistoryUp,
      navigateHistoryDown,
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

export function useSendMessage(apiBase: string, onActiveSessionChange?: (newSessionId: string) => void, onError?: (error: Error) => void, handleSlashCommand?: (sessionId: string, content: string) => Promise<boolean | string | 'CLEAR'>) {
  const { updateChat, clearInput, assignConversationId, addEphemeralMessage } = useActiveChatActions();
  const { sendMessage: sendToServer, fetchMessages } = useConversationActions();
  const { handleStreamEvent, clearStreamingMessage } = useStreamingMessage(apiBase, onActiveSessionChange);

  const sendMessage = useCallback(async (sessionId: string, agentSlug: string, conversationId: string | undefined, content: string) => {
    const allChats = activeChatsStore.getSnapshot();
    const currentState = allChats[sessionId];
    
    // If already sending, queue the message instead of aborting
    if (currentState?.status === 'sending') {
      // Queue message if already sending
      updateChat(sessionId, { 
        queuedMessages: [...(currentState.queuedMessages || []), content]
      });
      return;
    }
    
    // Handle slash commands if handler provided
    if (content.startsWith('/') && handleSlashCommand) {
      const result = await handleSlashCommand(sessionId, content);
      
      if (result === true || result === 'CLEAR') {
        // Command handled, don't send to backend
        return;
      } else if (typeof result === 'string' && result !== 'CLEAR') {
        // Custom command expanded, show notification
        addEphemeralMessage(sessionId, {
          role: 'system',
          content: `Slash command **${content}** was sent as user message`
        });
        // Use the expanded prompt
        content = result;
      }
    }
    
    // Add user message to messages array
    const updatedMessages = [
      ...(currentState?.messages || []),
      { role: 'user' as const, content }
    ];
    
    // Create abort controller for this request
    const abortController = new AbortController();
    
    clearInput(sessionId);
    updateChat(sessionId, { status: 'sending', messages: updatedMessages, abortController });

    // Track the current session ID (will change after migration)
    let currentSessionId = sessionId;

    try {
      
      // Pass title for new conversations
      const title = !conversationId ? currentState?.title : undefined;
      
      // Get model override from chat state
      const model = currentState?.model;
      
      // Delegate to ConversationsContext for server communication
      const result = await sendToServer(
        apiBase,
        agentSlug,
        conversationId,
        content,
        title,
        (data, state) => handleStreamEvent(currentSessionId, data, state),
        (convId, title) => {
          // Assign conversationId to the session (don't migrate, just update the field)
          assignConversationId(sessionId, convId);
          if (title) {
            updateChat(sessionId, { title });
          }
          onActiveSessionChange?.(sessionId);
        },
        onError,
        abortController.signal,
        model
      );
      
      const newConversationId = result?.conversationId;
      const finishReason = result?.finishReason;
      

      
      // Replace messages with backend truth (use sessionId, not conversationId)
      try {
        // Fetch messages from backend to get the complete conversation
        if (newConversationId) {
          await fetchMessages(apiBase, agentSlug, newConversationId);
        }
        
        const messagesKey = `messages:${agentSlug}:${newConversationId}`;
        const backendMessages = conversationsStore.getSnapshot().messages[messagesKey] || [];
        
        clearStreamingMessage(sessionId);
        
        // Check if maxTurns was reached (from streaming finishReason or last message)
        const shouldShowContinue = finishReason === 'tool-calls' || 
          (backendMessages[backendMessages.length - 1]?.finishReason === 'tool-calls');
        
        const updates: Partial<ChatUIState> = { 
          status: 'idle',
          abortController: undefined,
          messages: backendMessages.map(m => ({ role: m.role, content: m.content, contentParts: m.contentParts })),
        };
        
        // Only set ephemeralMessages if we need to show continue button
        if (shouldShowContinue) {
          updates.ephemeralMessages = [{
            role: 'system',
            content: '🔄 **Conversation paused** - I reached the maximum number of tool calls in this turn. Click Continue to let me keep working.',
            action: {
              label: 'Continue',
              handler: () => sendMessage(sessionId, agentSlug, newConversationId, 'continue')
            }
          }];
        }
        
        updateChat(sessionId, updates);
        
        
        // Process next queued message if any
        const updatedState = activeChatsStore.getSnapshot()[sessionId];
        if (updatedState?.queuedMessages && updatedState.queuedMessages.length > 0) {
          const [nextMessage, ...remainingQueue] = updatedState.queuedMessages;
          updateChat(sessionId, { queuedMessages: remainingQueue });
          // Process next message asynchronously
          setTimeout(() => {
            sendMessage(sessionId, agentSlug, updatedState.conversationId, nextMessage);
          }, 100);
        }
      } catch (replaceError) {
        log.api('[useSendMessage] Error replacing messages:', replaceError);
        // At least clear the status
        clearStreamingMessage(sessionId);
        updateChat(sessionId, { status: 'idle', abortController: undefined });
      }
      
    } catch (error) {
      const err = error as Error;
      
      updateChat(sessionId, { status: 'error', error: err.message, abortController: undefined });
      clearStreamingMessage(sessionId);
    }
  }, [apiBase, updateChat, clearInput, assignConversationId, sendToServer, fetchMessages, handleStreamEvent, clearStreamingMessage, onActiveSessionChange, onError, addEphemeralMessage, handleSlashCommand]);
  
  return sendMessage;
}

export function useCancelMessage() {
  const { updateChat } = useActiveChatActions();
  const apiBase = useApiBase().apiBase;
  
  return useCallback((sessionId: string) => {
    const state = activeChatsStore.getSnapshot()[sessionId];
    
    if (state?.abortController && state?.status === 'sending') {
      // Mark as user-initiated cancel before aborting
      (state.abortController as any)._userInitiated = true;
      state.abortController.abort('User cancelled');
      
      // Backend will detect the abort and remove incomplete response from memory
      
      // Update UI state
      updateChat(sessionId, { status: 'idle', abortController: undefined });
    } else {
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
  const { fetchMessages } = useConversationActions();
  const { updateChat } = useActiveChatActions();

  return useCallback(async () => {
    const allChats = activeChatsStore.getSnapshot();
    const agentSlugs = new Set<string>();
    
    // Collect unique agent slugs
    for (const chat of Object.values(allChats)) {
      if (chat.agentSlug) {
        agentSlugs.add(chat.agentSlug);
      }
    }
    
    // Note: Conversations are fetched automatically by React Query when useConversations() is called
    // No need to prefetch here
    
    // Fetch messages for each conversation and rebuild input history
    for (const [sessionId, chat] of Object.entries(allChats)) {
      if (chat.conversationId && chat.agentSlug) {
        await fetchMessages(apiBase, chat.agentSlug, chat.conversationId);
        
        // Rebuild input history from conversation messages + sessionStorage slash commands
        const messagesKey = `messages:${chat.agentSlug}:${chat.conversationId}`;
        const backendMessages = conversationsStore.getSnapshot().messages[messagesKey] || [];
        
        // Get user messages from backend (these are the actual sent messages)
        const userMessages = backendMessages
          .filter(m => m.role === 'user')
          .map(m => m.content);
        
        // Get slash commands from sessionStorage (already stored)
        const storedSlashCommands = (chat.inputHistory || [])
          .filter(input => input.startsWith('/'));
        
        // Combine: user messages from backend + slash commands from storage
        // Keep them in order they were added (append slash commands at end)
        const mergedHistory = [...userMessages, ...storedSlashCommands];
        
        // Update the session with merged history
        updateChat(sessionId, { inputHistory: mergedHistory });
      }
    }
  }, [apiBase, fetchMessages, updateChat]);
}

export type { ChatUIState };
