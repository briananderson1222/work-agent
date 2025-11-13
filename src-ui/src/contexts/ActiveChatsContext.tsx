import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore } from 'react';
import type { FileAttachment } from '../types';

type ChatUIState = {
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  inputHistory: string[];
  error?: string | null;
  hasUnread: boolean;
  // Draft session metadata (for new chats without backend conversations yet)
  agentSlug?: string;
  agentName?: string;
  title?: string;
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

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify = () => {
    this.snapshot = { ...this.chats };
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
}

const activeChatsStore = new ActiveChatsStore();

type ActiveChatsContextType = {
  initChat: (conversationId: string, metadata?: { agentSlug: string; agentName: string; title: string }) => void;
  updateChat: (conversationId: string, updates: Partial<ChatUIState>) => void;
  removeChat: (conversationId: string) => void;
  clearInput: (conversationId: string) => void;
  addEphemeralMessage: (conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string; attachments?: any[] }) => void;
  clearEphemeralMessages: (conversationId: string) => void;
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

  const getAllChats = useCallback(() => {
    return activeChatsStore.getSnapshot();
  }, []);

  return (
    <ActiveChatsContext.Provider value={{ initChat, updateChat, removeChat, clearInput, addEphemeralMessage, clearEphemeralMessages, getAllChats }}>
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

export type { ChatUIState };
