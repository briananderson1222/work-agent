import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type { UIBlock } from '@stallion-ai/contracts/ui-block';
import type { FileAttachment } from '../types';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatContentPart = {
  type: 'text' | 'tool' | 'file' | 'ui-block';
  content?: string;
  url?: string;
  mediaType?: string;
  name?: string;
  tool?: any;
  uiBlock?: UIBlock;
  toolCallId?: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  attachments?: any[];
  contentParts?: ChatContentPart[];
  traceId?: string;
};

export type EphemeralMessage = ChatMessage & {
  action?: { label: string; handler: () => void };
  id?: string;
  timestamp?: number;
  ephemeral?: boolean;
  insertAfterCount?: number;
};

export type ToolCallState = {
  id: string;
  name: string;
  args: any;
  result?: any;
  state?: string;
  error?: string;
};

export type StreamingMessage = {
  role: 'assistant';
  content: string;
  contentParts?: ChatContentPart[];
};

export type ChatUIState = {
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  inputHistory: string[];
  historyIndex?: number;
  savedInput?: string;
  status?: 'idle' | 'sending' | 'error';
  isProcessingStep?: boolean;
  error?: string | null;
  hasUnread: boolean;
  abortController?: AbortController;
  agentSlug?: string;
  agentName?: string;
  title?: string;
  conversationId?: string;
  projectSlug?: string;
  projectName?: string;
  focusDirectoryId?: string;
  provider?: ProviderKind;
  providerOptions?: Record<string, unknown>;
  orchestrationSessionStarted?: boolean;
  orchestrationProvider?: ProviderKind;
  orchestrationModel?: string;
  orchestrationStatus?: string;
  messages?: ChatMessage[];
  ephemeralMessages?: EphemeralMessage[];
  toolCalls?: ToolCallState[];
  streamingMessage?: StreamingMessage;
  model?: string;
  sessionAutoApprove?: string[];
  pendingApprovals?: string[];
  approvalToasts?: Map<string, string>;
  isEditingQueue?: boolean;
};

export type ActiveChatsMap = Record<string, ChatUIState>;

export type ActiveChatMetadata = {
  agentSlug: string;
  agentName: string;
  title: string;
  conversationId?: string;
  projectSlug?: string;
  projectName?: string;
  provider?: ProviderKind;
  model?: string;
  providerOptions?: Record<string, unknown>;
};

export type PersistedActiveChat = {
  sessionId: string;
  conversationId: string;
  agentSlug: string;
  model?: string;
  projectSlug?: string;
  projectName?: string;
  provider?: ProviderKind;
  providerOptions?: Record<string, unknown>;
  orchestrationSessionStarted?: boolean;
  orchestrationProvider?: ProviderKind;
  orchestrationModel?: string;
  orchestrationStatus?: string;
  sessionAutoApprove?: string[];
  ephemeralMessages?: EphemeralMessage[];
  inputHistory?: string[];
};

export type BackendTimestampMessage = {
  timestamp?: string | number | Date;
};

export type ActiveChatsStoreOptions = {
  storageKey?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  getBackendMessages?: (
    agentSlug: string,
    conversationId: string,
  ) => BackendTimestampMessage[];
  now?: () => number;
  randomId?: () => string;
};

export function defaultBackendMessages(): BackendTimestampMessage[] {
  return [];
}

export function readTimestamp(
  value: BackendTimestampMessage['timestamp'],
): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return new Date(value).getTime();
  }
  return 0;
}

export function createDefaultChatState(
  metadata?: ActiveChatMetadata,
): ChatUIState {
  return {
    input: '',
    attachments: [],
    queuedMessages: [],
    inputHistory: [],
    hasUnread: false,
    providerOptions: {},
    orchestrationSessionStarted: false,
    ...metadata,
  };
}

export function hydrateActiveChats(
  sessions: PersistedActiveChat[],
): ActiveChatsMap {
  const chats: ActiveChatsMap = {};
  for (const session of sessions) {
    chats[session.sessionId] = {
      input: '',
      attachments: [],
      queuedMessages: [],
      inputHistory: session.inputHistory || [],
      hasUnread: false,
      agentSlug: session.agentSlug,
      conversationId: session.conversationId,
      model: session.model,
      projectSlug: session.projectSlug,
      projectName: session.projectName,
      provider: session.provider,
      providerOptions: session.providerOptions || {},
      orchestrationSessionStarted: session.orchestrationSessionStarted || false,
      orchestrationProvider: session.orchestrationProvider,
      orchestrationModel: session.orchestrationModel,
      orchestrationStatus: session.orchestrationStatus,
      sessionAutoApprove: session.sessionAutoApprove || [],
      ephemeralMessages: session.ephemeralMessages || [],
    };
  }
  return chats;
}

export function serializeActiveChats(
  chats: ActiveChatsMap,
): PersistedActiveChat[] {
  return Object.entries(chats)
    .filter(([, chat]) => chat.conversationId)
    .map(([sessionId, chat]) => ({
      sessionId,
      conversationId: chat.conversationId!,
      agentSlug: chat.agentSlug!,
      model: chat.model,
      projectSlug: chat.projectSlug,
      projectName: chat.projectName,
      provider: chat.provider,
      providerOptions: chat.providerOptions || {},
      orchestrationSessionStarted: chat.orchestrationSessionStarted || false,
      orchestrationProvider: chat.orchestrationProvider,
      orchestrationModel: chat.orchestrationModel,
      orchestrationStatus: chat.orchestrationStatus,
      sessionAutoApprove: chat.sessionAutoApprove || [],
      ephemeralMessages: chat.ephemeralMessages || [],
      inputHistory: chat.inputHistory || [],
    }));
}

export function mergeChatUpdates(
  current: ChatUIState,
  updates: Partial<ChatUIState>,
): { chat: ChatUIState; shouldPersist: boolean } {
  const nextUpdates =
    'input' in updates && !('historyIndex' in updates)
      ? { ...updates, historyIndex: -1 }
      : updates;
  const chat = {
    ...current,
    ...nextUpdates,
  };
  const shouldPersist =
    'conversationId' in nextUpdates ||
    'model' in nextUpdates ||
    'provider' in nextUpdates ||
    'providerOptions' in nextUpdates ||
    'orchestrationSessionStarted' in nextUpdates ||
    'sessionAutoApprove' in nextUpdates ||
    'ephemeralMessages' in nextUpdates;
  return { chat, shouldPersist };
}

export function clearInputState(chat: ChatUIState): ChatUIState {
  return {
    ...chat,
    input: '',
    attachments: [],
  };
}

export function appendInputHistory(
  chat: ChatUIState,
  input: string,
): ChatUIState {
  return {
    ...chat,
    inputHistory: [...(chat.inputHistory || []), input],
    historyIndex: -1,
    savedInput: undefined,
  };
}

export function navigateHistoryUpState(chat: ChatUIState): ChatUIState | null {
  const history = chat.inputHistory || [];
  if (history.length === 0) {
    return null;
  }
  const currentIndex = chat.historyIndex ?? -1;
  if (currentIndex === -1) {
    return {
      ...chat,
      input: history[history.length - 1],
      historyIndex: history.length - 1,
      savedInput: chat.input || '',
    };
  }
  if (currentIndex === 0) {
    return null;
  }
  return {
    ...chat,
    input: history[currentIndex - 1],
    historyIndex: currentIndex - 1,
  };
}

export function navigateHistoryDownState(
  chat: ChatUIState,
): ChatUIState | null {
  const currentIndex = chat.historyIndex ?? -1;
  if (currentIndex === -1) {
    return null;
  }
  const history = chat.inputHistory || [];
  const nextIndex = currentIndex + 1;
  if (nextIndex >= history.length) {
    return {
      ...chat,
      input: chat.savedInput || '',
      historyIndex: -1,
      savedInput: undefined,
    };
  }
  return {
    ...chat,
    input: history[nextIndex],
    historyIndex: nextIndex,
  };
}

export function clearEphemeralMessagesState(chat: ChatUIState): ChatUIState {
  return {
    ...chat,
    ephemeralMessages: [],
  };
}

export function assignConversationIdState(
  chat: ChatUIState,
  conversationId: string,
): ChatUIState {
  return {
    ...chat,
    conversationId,
  };
}

export function removeQueuedMessageState(
  chat: ChatUIState,
  index: number,
): ChatUIState {
  const queuedMessages = [...(chat.queuedMessages || [])];
  queuedMessages.splice(index, 1);
  return {
    ...chat,
    queuedMessages,
  };
}

export function editQueuedMessageState(
  chat: ChatUIState,
  index: number,
  newContent: string,
): ChatUIState {
  const queuedMessages = [...(chat.queuedMessages || [])];
  queuedMessages[index] = newContent;
  return {
    ...chat,
    queuedMessages,
  };
}

export function clearQueueState(chat: ChatUIState): ChatUIState {
  return {
    ...chat,
    queuedMessages: [],
  };
}

export function createEphemeralMessageState(
  chat: ChatUIState,
  message: {
    role: ChatRole;
    content: string;
    attachments?: any[];
  },
  backendMessageCount: number | undefined,
  now: () => number,
  randomId: () => string,
  getBackendMessages: (
    agentSlug: string,
    conversationId: string,
  ) => BackendTimestampMessage[],
  backendConversationId?: string,
): ChatUIState | null {
  if (!chat) {
    return null;
  }
  const current = chat.ephemeralMessages || [];
  const conversationId = backendConversationId ?? chat.conversationId ?? '';
  const backendMessages =
    chat.agentSlug && conversationId
      ? getBackendMessages(chat.agentSlug, conversationId)
      : [];
  const latestTimestamp =
    backendMessages.length > 0
      ? Math.max(
          ...backendMessages.map((entry) => readTimestamp(entry.timestamp)),
        )
      : now();
  return {
    ...chat,
    ephemeralMessages: [
      ...current,
      {
        ...message,
        id: `ephemeral-${now()}-${randomId()}`,
        timestamp: latestTimestamp + 1,
        ephemeral: true,
        insertAfterCount: backendMessageCount ?? 0,
      },
    ],
  };
}
