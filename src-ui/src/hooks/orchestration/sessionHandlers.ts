import { activeChatsStore } from '../../contexts/active-chats-store';
import type { OrchestrationEvent } from './types';

export function handleSessionLifecycleEvent(
  event: Extract<
    OrchestrationEvent,
    { method: 'session.started' | 'session.configured' }
  >,
) {
  activeChatsStore.updateChat(event.threadId, {
    provider: event.provider,
    orchestrationProvider: event.provider,
    orchestrationSessionStarted: true,
  });
}

export function handleSessionStateChangedEvent(
  event: Extract<OrchestrationEvent, { method: 'session.state-changed' }>,
) {
  activeChatsStore.updateChat(event.threadId, {
    status: event.to === 'running' ? 'sending' : 'idle',
    provider: event.provider,
    orchestrationProvider: event.provider,
    orchestrationStatus: event.to,
    orchestrationSessionStarted: true,
  });
}

export function handleSessionExitedEvent(
  event: Extract<OrchestrationEvent, { method: 'session.exited' }>,
) {
  activeChatsStore.updateChat(event.threadId, {
    status: 'idle',
    orchestrationStatus: 'exited',
    orchestrationSessionStarted: false,
  });
}
