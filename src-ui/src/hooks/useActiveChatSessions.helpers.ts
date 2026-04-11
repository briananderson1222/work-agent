import type { ChatMessage } from '../contexts/active-chats-state';
import type { FileAttachment } from '../types';

export type CompletionNoticeKind =
  | 'tool-calls'
  | 'length'
  | 'unexpected'
  | null;

type ConversationMessage = Pick<ChatMessage, 'role' | 'content'> & {
  contentParts?: Array<{
    type: string;
    content?: string;
    url?: string;
    mediaType?: string;
    name?: string;
  }>;
  finishReason?: string;
};

export type ActiveChatConversationMessage = ConversationMessage;

export function buildOutgoingUserMessage(
  currentMessages: ChatMessage[] | undefined,
  content: string,
  attachments?: FileAttachment[],
): { messages: ChatMessage[]; contentParts?: ChatMessage['contentParts'] } {
  const contentParts: NonNullable<ChatMessage['contentParts']> = [];
  if (content) {
    contentParts.push({ type: 'text', content });
  }
  if (attachments) {
    for (const attachment of attachments) {
      contentParts.push({
        type: 'file',
        url: attachment.data,
        mediaType: attachment.type,
        name: attachment.name,
      });
    }
  }

  const nextMessage: ChatMessage = {
    role: 'user',
    content,
    contentParts: contentParts.length > 0 ? contentParts : undefined,
  };

  return {
    messages: [...(currentMessages || []), nextMessage],
    contentParts: contentParts.length > 0 ? contentParts : undefined,
  };
}

export function buildPostSendState(
  backendMessages: ConversationMessage[],
  finishReason?: string,
): {
  messages: ChatMessage[];
  noticeKind: CompletionNoticeKind;
  effectiveFinishReason?: string;
} {
  const effectiveFinishReason =
    finishReason ||
    backendMessages[backendMessages.length - 1]?.finishReason ||
    undefined;

  const messages = backendMessages.map((message) => ({
    role: message.role,
    content: message.content,
    contentParts: message.contentParts as ChatMessage['contentParts'],
  }));

  if (effectiveFinishReason === 'tool-calls') {
    return { messages, noticeKind: 'tool-calls', effectiveFinishReason };
  }

  if (effectiveFinishReason === 'length') {
    return { messages, noticeKind: 'length', effectiveFinishReason };
  }

  if (
    effectiveFinishReason &&
    effectiveFinishReason !== 'stop' &&
    effectiveFinishReason !== 'end_turn'
  ) {
    return { messages, noticeKind: 'unexpected', effectiveFinishReason };
  }

  return { messages, noticeKind: null, effectiveFinishReason };
}

export function buildRehydratedInputHistory(
  backendMessages: ConversationMessage[],
  inputHistory: string[] | undefined,
): string[] {
  const userMessages = backendMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.content);
  const storedSlashCommands = (inputHistory || []).filter((input) =>
    input.startsWith('/'),
  );

  return [...userMessages, ...storedSlashCommands];
}

export function normalizeConversationMessages(
  backendMessages: ConversationMessage[],
): ChatMessage[] {
  return backendMessages.map((message) => ({
    role: message.role,
    content: message.content,
    contentParts: message.contentParts as ChatMessage['contentParts'],
  }));
}
