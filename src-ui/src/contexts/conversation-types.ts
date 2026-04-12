import type { FileAttachment } from '../types';

export type ConversationStatus = 'idle' | 'streaming' | 'processing';

export type ConversationData = {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

export type MessageData = {
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

export type ConversationsContextType = {
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
    chatOptions?: Record<string, unknown>,
  ) => Promise<{ conversationId?: string; finishReason?: string }>;
  setStatus: (
    agentSlug: string,
    conversationId: string,
    status: ConversationStatus,
  ) => void;
};
