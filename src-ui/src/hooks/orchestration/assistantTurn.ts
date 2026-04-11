import { activeChatsStore } from '../../contexts/active-chats-store';
import { buildAssistantTurnContent } from './messageParts';

export function finalizeAssistantTurn(
  threadId: string,
  fallbackText?: string,
) {
  const chat = activeChatsStore.getSnapshot()[threadId];
  if (!chat) return;

  const streamingMessage = chat.streamingMessage;
  const content = buildAssistantTurnContent(streamingMessage, fallbackText);

  if (!content && !(streamingMessage?.contentParts || []).length) {
    activeChatsStore.updateChat(threadId, {
      status: 'idle',
      streamingMessage: undefined,
      isProcessingStep: false,
    });
    return;
  }

  activeChatsStore.updateChat(threadId, {
    messages: [
      ...(chat.messages || []),
      {
        role: 'assistant',
        content,
        contentParts: streamingMessage?.contentParts,
      },
    ],
    streamingMessage: undefined,
    status: 'idle',
    isProcessingStep: false,
  });
}
