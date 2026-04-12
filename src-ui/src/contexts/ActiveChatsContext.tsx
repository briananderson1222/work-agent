import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import { usePruneActiveChats } from '../hooks/useActiveChatSessions';
import {
  type ActiveChatMetadata,
  type ActiveChatsMap,
  activeChatsStore,
  type ChatUIState,
} from './active-chats-store';
import { conversationsStore } from './ConversationsContext';

type ActiveChatsContextType = {
  initChat: (sessionId: string, metadata?: ActiveChatMetadata) => void;
  updateChat: (sessionId: string, updates: Partial<ChatUIState>) => void;
  removeChat: (sessionId: string) => void;
  clearInput: (sessionId: string) => void;
  addEphemeralMessage: (
    sessionId: string,
    message: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      attachments?: any[];
    },
  ) => void;
  clearEphemeralMessages: (sessionId: string) => void;
  assignConversationId: (sessionId: string, conversationId: string) => void;
  removeQueuedMessage: (sessionId: string, index: number) => void;
  editQueuedMessage: (
    sessionId: string,
    index: number,
    newContent: string,
  ) => void;
  clearQueue: (sessionId: string) => void;
  addToInputHistory: (sessionId: string, input: string) => void;
  navigateHistoryUp: (sessionId: string) => void;
  navigateHistoryDown: (sessionId: string) => void;
  getAllChats: () => ActiveChatsMap;
};

const ActiveChatsContext = createContext<ActiveChatsContextType | undefined>(
  undefined,
);

activeChatsStore.setBackendMessagesResolver((agentSlug, conversationId) => {
  const snapshot = conversationsStore.getSnapshot();
  const messagesKey = `messages:${agentSlug}:${conversationId}`;
  return snapshot.messages[messagesKey] || [];
});

export function ActiveChatsProvider({ children }: { children: ReactNode }) {
  usePruneActiveChats();

  const initChat = useCallback(
    (sessionId: string, metadata?: ActiveChatMetadata) => {
      activeChatsStore.initChat(sessionId, metadata);
    },
    [],
  );

  const updateChat = useCallback(
    (sessionId: string, updates: Partial<ChatUIState>) => {
      activeChatsStore.updateChat(sessionId, updates);
    },
    [],
  );

  const removeChat = useCallback((sessionId: string) => {
    activeChatsStore.removeChat(sessionId);
  }, []);

  const clearInput = useCallback((sessionId: string) => {
    activeChatsStore.clearInput(sessionId);
  }, []);

  const addEphemeralMessage = useCallback(
    (
      sessionId: string,
      message: {
        role: 'user' | 'assistant' | 'system';
        content: string;
        attachments?: any[];
      },
    ) => {
      activeChatsStore.addEphemeralMessage(sessionId, message);
    },
    [],
  );

  const clearEphemeralMessages = useCallback((sessionId: string) => {
    activeChatsStore.clearEphemeralMessages(sessionId);
  }, []);

  const assignConversationId = useCallback(
    (sessionId: string, conversationId: string) => {
      activeChatsStore.assignConversationId(sessionId, conversationId);
    },
    [],
  );

  const removeQueuedMessage = useCallback(
    (sessionId: string, index: number) => {
      activeChatsStore.removeQueuedMessage(sessionId, index);
    },
    [],
  );

  const editQueuedMessage = useCallback(
    (sessionId: string, index: number, newContent: string) => {
      activeChatsStore.editQueuedMessage(sessionId, index, newContent);
    },
    [],
  );

  const clearQueue = useCallback((sessionId: string) => {
    activeChatsStore.clearQueue(sessionId);
  }, []);

  const addToInputHistory = useCallback((sessionId: string, input: string) => {
    activeChatsStore.addToInputHistory(sessionId, input);
  }, []);

  const navigateHistoryUp = useCallback((sessionId: string) => {
    activeChatsStore.navigateHistoryUp(sessionId);
  }, []);

  const navigateHistoryDown = useCallback((sessionId: string) => {
    activeChatsStore.navigateHistoryDown(sessionId);
  }, []);

  const getAllChats = useCallback(() => activeChatsStore.getSnapshot(), []);

  return (
    <ActiveChatsContext.Provider
      value={{
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
        getAllChats,
      }}
    >
      {children}
    </ActiveChatsContext.Provider>
  );
}

export function useActiveChatState(sessionId: string): ChatUIState | null {
  const context = useContext(ActiveChatsContext);
  if (!context) {
    throw new Error(
      'useActiveChatState must be used within ActiveChatsProvider',
    );
  }

  const chats = useSyncExternalStore(
    activeChatsStore.subscribe,
    activeChatsStore.getSnapshot,
    activeChatsStore.getSnapshot,
  );

  return chats[sessionId] || null;
}

export function useActiveChatActions() {
  const context = useContext(ActiveChatsContext);
  if (!context) {
    throw new Error(
      'useActiveChatActions must be used within ActiveChatsProvider',
    );
  }
  return context;
}

export function useAllActiveChats(): ActiveChatsMap {
  return useSyncExternalStore(
    activeChatsStore.subscribe,
    activeChatsStore.getSnapshot,
    activeChatsStore.getSnapshot,
  );
}

export type { ChatUIState };
export { activeChatsStore };
