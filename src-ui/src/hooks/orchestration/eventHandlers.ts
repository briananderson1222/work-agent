import { activeChatsStore } from '../../contexts/active-chats-store';
import type { OrchestrationEvent } from './types';
import {
  handleRequestOpenedEvent,
  handleRequestResolvedEvent,
} from './approvalHandlers';
import {
  handleReasoningDeltaEvent,
  handleTextDeltaEvent,
  handleToolCompletedEvent,
  handleToolProgressEvent,
  handleToolStartedEvent,
} from './streamHandlers';
import {
  handleRuntimeErrorEvent,
  handleRuntimeWarningEvent,
  handleTurnAbortedEvent,
  handleTurnCompletedEvent,
  handleTurnStartedEvent,
} from './turnHandlers';
import {
  handleSessionExitedEvent,
  handleSessionLifecycleEvent,
  handleSessionStateChangedEvent,
} from './sessionHandlers';

export function handleOrchestrationEvent(
  apiBase: string,
  event: OrchestrationEvent,
) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;

  switch (event.method) {
    case 'session.started':
    case 'session.configured':
      handleSessionLifecycleEvent(event);
      return;
    case 'session.state-changed':
      handleSessionStateChangedEvent(event);
      return;
    case 'session.exited':
      handleSessionExitedEvent(event);
      return;
    case 'turn.started':
      handleTurnStartedEvent(event);
      return;
    case 'content.text-delta':
      handleTextDeltaEvent(event);
      return;
    case 'content.reasoning-delta':
      handleReasoningDeltaEvent(event);
      return;
    case 'tool.started':
      handleToolStartedEvent(event);
      return;
    case 'tool.progress':
      handleToolProgressEvent(event);
      return;
    case 'tool.completed':
      handleToolCompletedEvent(event);
      return;
    case 'request.opened':
      handleRequestOpenedEvent(apiBase, event);
      return;
    case 'request.resolved':
      handleRequestResolvedEvent(event);
      return;
    case 'turn.completed':
      handleTurnCompletedEvent(event);
      return;
    case 'turn.aborted':
      handleTurnAbortedEvent(event);
      return;
    case 'runtime.error':
      handleRuntimeErrorEvent(event);
      return;
    case 'runtime.warning':
      handleRuntimeWarningEvent(event);
      return;
  }
}
