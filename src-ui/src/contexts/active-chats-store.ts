import { log } from '../utils/logger';
import {
  type ActiveChatMetadata,
  type ActiveChatsMap,
  type ActiveChatsStoreOptions,
  appendInputHistory,
  assignConversationIdState,
  type BackendTimestampMessage,
  type ChatUIState,
  clearEphemeralMessagesState,
  clearInputState,
  clearQueueState,
  createDefaultChatState,
  createEphemeralMessageState,
  defaultBackendMessages,
  editQueuedMessageState,
  hydrateActiveChats,
  mergeChatUpdates,
  navigateHistoryDownState,
  navigateHistoryUpState,
  removeQueuedMessageState,
  serializeActiveChats,
} from './active-chats-state';

export type {
  ActiveChatMetadata,
  ActiveChatsMap,
  ActiveChatsStoreOptions,
  BackendTimestampMessage,
  ChatUIState,
} from './active-chats-state';

export class ActiveChatsStore {
  private chats: ActiveChatsMap = {};
  private listeners = new Set<() => void>();
  private snapshot = this.chats;
  private readonly storageKey: string;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private getBackendMessages: (
    agentSlug: string,
    conversationId: string,
  ) => BackendTimestampMessage[];
  private readonly now: () => number;
  private readonly randomId: () => string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ActiveChatsStoreOptions = {}) {
    this.storageKey = options.storageKey ?? 'activeChats';
    this.storage =
      options.storage ??
      (typeof window !== 'undefined' ? window.sessionStorage : null);
    this.getBackendMessages =
      options.getBackendMessages ?? defaultBackendMessages;
    this.now = options.now ?? (() => Date.now());
    this.randomId = options.randomId ?? (() => Math.random().toString(36));
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = this.storage?.getItem(this.storageKey);
      if (!stored) {
        return;
      }
      const minimal = JSON.parse(stored) as Parameters<
        typeof hydrateActiveChats
      >[0];
      this.chats = hydrateActiveChats(minimal);
      this.snapshot = this.chats;
    } catch (error) {
      log.api('Failed to load active chats from sessionStorage:', error);
    }
  }

  private saveToStorage() {
    try {
      const minimal = serializeActiveChats(this.chats);
      this.storage?.setItem(this.storageKey, JSON.stringify(minimal));
    } catch (error) {
      log.api('Failed to save active chats to sessionStorage:', error);
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

  getSnapshot = () => this.snapshot;

  setBackendMessagesResolver(
    resolver: (
      agentSlug: string,
      conversationId: string,
    ) => BackendTimestampMessage[],
  ) {
    this.getBackendMessages = resolver;
  }

  private notify = (persist = false) => {
    this.snapshot = { ...this.chats };
    if (persist) {
      this.debouncedSave();
    }
    this.listeners.forEach((listener) => listener());
  };

  initChat(sessionId: string, metadata?: ActiveChatMetadata) {
    if (this.chats[sessionId]) {
      return;
    }
    this.chats[sessionId] = createDefaultChatState(metadata);
    this.notify(true);
  }

  updateChat(sessionId: string, updates: Partial<ChatUIState>) {
    const current = this.chats[sessionId];
    if (!current) {
      return;
    }
    const { chat, shouldPersist } = mergeChatUpdates(current, updates);
    this.chats[sessionId] = chat;
    this.notify(shouldPersist);
  }

  removeChat(sessionId: string) {
    delete this.chats[sessionId];
    this.notify(true);
  }

  clearInput(sessionId: string) {
    const current = this.chats[sessionId];
    if (!current) {
      return;
    }
    this.chats[sessionId] = clearInputState(current);
    this.notify(false);
  }

  navigateHistoryUp(sessionId: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    const next = navigateHistoryUpState(chat);
    if (!next) {
      return;
    }
    this.chats[sessionId] = next;
    this.notify(false);
  }

  navigateHistoryDown(sessionId: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    const next = navigateHistoryDownState(chat);
    if (!next) {
      return;
    }
    this.chats[sessionId] = next;
    this.notify(false);
  }

  addEphemeralMessage(
    sessionId: string,
    message: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      attachments?: any[];
    },
    backendMessageCount?: number,
  ) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    const backendConversationId = chat.conversationId ?? sessionId;
    const next = createEphemeralMessageState(
      chat,
      message,
      backendMessageCount,
      this.now,
      this.randomId,
      this.getBackendMessages,
      backendConversationId,
    );
    if (!next) {
      return;
    }
    this.chats[sessionId] = next;
    this.notify(true);
  }

  clearEphemeralMessages(sessionId: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = clearEphemeralMessagesState(chat);
    this.notify(true);
  }

  assignConversationId(sessionId: string, conversationId: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = assignConversationIdState(chat, conversationId);
    this.notify(true);
  }

  removeQueuedMessage(sessionId: string, index: number) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = removeQueuedMessageState(chat, index);
    this.notify(false);
  }

  editQueuedMessage(sessionId: string, index: number, newContent: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = editQueuedMessageState(chat, index, newContent);
    this.notify(false);
  }

  clearQueue(sessionId: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = clearQueueState(chat);
    this.notify(false);
  }

  addToInputHistory(sessionId: string, input: string) {
    const chat = this.chats[sessionId];
    if (!chat) {
      return;
    }
    this.chats[sessionId] = appendInputHistory(chat, input);
    this.notify(true);
  }
}

export const activeChatsStore = new ActiveChatsStore();
