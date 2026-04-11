import { activeChatsStore } from '../../contexts/active-chats-store';
import { toastStore } from '../../contexts/ToastContext';
import { finalizeAssistantTurn } from './assistantTurn';
import type { OrchestrationEvent } from './types';

export function handleTurnStartedEvent(
  event: Extract<OrchestrationEvent, { method: 'turn.started' }>,
) {
  activeChatsStore.updateChat(event.threadId, {
    status: 'sending',
    isProcessingStep: false,
    streamingMessage: {
      role: 'assistant',
      content: '',
      contentParts: [],
    },
  });
}

export function handleTurnCompletedEvent(
  event: Extract<OrchestrationEvent, { method: 'turn.completed' }>,
) {
  finalizeAssistantTurn(event.threadId, event.outputText);
}

export function handleTurnAbortedEvent(
  event: Extract<OrchestrationEvent, { method: 'turn.aborted' }>,
) {
  activeChatsStore.updateChat(event.threadId, {
    status: 'idle',
    error: event.reason,
    orchestrationStatus: 'aborted',
    streamingMessage: undefined,
    isProcessingStep: false,
  });
}

export function handleRuntimeErrorEvent(
  event: Extract<OrchestrationEvent, { method: 'runtime.error' }>,
) {
  activeChatsStore.updateChat(event.threadId, {
    status: 'error',
    error: event.message,
    orchestrationStatus: 'errored',
  });
}

export function handleRuntimeWarningEvent(
  event: Extract<OrchestrationEvent, { method: 'runtime.warning' }>,
) {
  toastStore.show(event.message, event.threadId, 5000);
}
