import { activeChatsStore } from '../../contexts/active-chats-store';
import {
  createAssistantStreamingMessage,
  upsertTextPart,
  upsertToolPart,
} from './messageParts';
import type { OrchestrationEvent } from './types';

function getStreamingMessage(chat: ReturnType<typeof activeChatsStore.getSnapshot>[string]) {
  return chat.streamingMessage || createAssistantStreamingMessage();
}

export function handleTextDeltaEvent(
  event: Extract<OrchestrationEvent, { method: 'content.text-delta' }>,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;
  const streamingMessage = getStreamingMessage(chat);

  activeChatsStore.updateChat(event.threadId, {
    status: 'sending',
    streamingMessage: {
      role: 'assistant',
      content: `${streamingMessage.content || ''}${event.delta}`,
      contentParts: upsertTextPart(
        streamingMessage.contentParts,
        'text',
        event.delta,
      ),
    },
  });
}

export function handleReasoningDeltaEvent(
  event: Extract<OrchestrationEvent, { method: 'content.reasoning-delta' }>,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;
  const streamingMessage = getStreamingMessage(chat);

  activeChatsStore.updateChat(event.threadId, {
    status: 'sending',
    streamingMessage: {
      ...streamingMessage,
      contentParts: upsertTextPart(
        streamingMessage.contentParts,
        'reasoning',
        event.delta,
      ),
    },
  });
}

export function handleToolStartedEvent(
  event: Extract<OrchestrationEvent, { method: 'tool.started' }>,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;
  const streamingMessage = getStreamingMessage(chat);

  activeChatsStore.updateChat(event.threadId, {
    isProcessingStep: true,
    streamingMessage: {
      ...streamingMessage,
      contentParts: upsertToolPart(
        streamingMessage.contentParts,
        event.toolCallId,
        {
          name: event.toolName,
          toolName: event.toolName,
          args: event.arguments || {},
          state: 'running',
        },
      ),
    },
  });
}

export function handleToolProgressEvent(
  event: Extract<OrchestrationEvent, { method: 'tool.progress' }>,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;
  const streamingMessage = getStreamingMessage(chat);

  activeChatsStore.updateChat(event.threadId, {
    isProcessingStep: true,
    streamingMessage: {
      ...streamingMessage,
      contentParts: upsertToolPart(
        streamingMessage.contentParts,
        event.toolCallId,
        {
          state: 'running',
          progressMessage: event.message,
        },
      ),
    },
  });
}

export function handleToolCompletedEvent(
  event: Extract<OrchestrationEvent, { method: 'tool.completed' }>,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;
  const streamingMessage = getStreamingMessage(chat);

  activeChatsStore.updateChat(event.threadId, {
    isProcessingStep: false,
    streamingMessage: {
      ...streamingMessage,
      contentParts: upsertToolPart(
        streamingMessage.contentParts,
        event.toolCallId,
        {
          name: event.toolName,
          toolName: event.toolName,
          state:
            event.status === 'success'
              ? 'completed'
              : event.status === 'cancelled'
                ? 'cancelled'
                : 'error',
          result: event.output,
          error: event.error,
        },
      ),
    },
  });
}
