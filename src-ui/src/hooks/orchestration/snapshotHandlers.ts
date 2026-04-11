import type { ChatUIState } from '../../contexts/active-chats-store';
import { activeChatsStore } from '../../contexts/active-chats-store';
import type { OrchestrationSnapshotPayload } from './types';

type SnapshotChatState = Pick<
  ChatUIState,
  'provider' | 'orchestrationSessionStarted' | 'orchestrationStatus'
>;

export type OrchestrationSnapshotSyncPlan = {
  sessionUpdates: Array<{
    threadId: string;
    updates: Partial<ChatUIState>;
  }>;
  exitedThreadIds: string[];
};

export function buildOrchestrationSnapshotSyncPlan(
  payload: OrchestrationSnapshotPayload,
  chats: Record<string, SnapshotChatState>,
) {
  const liveThreadIds = new Set(
    payload.sessions.map((session) => session.threadId),
  );

  const sessionUpdates = payload.sessions
    .map((session) => {
      if (!chats[session.threadId]) return null;
      return {
        threadId: session.threadId,
        updates: {
          provider: session.provider,
          model: session.model,
          orchestrationProvider: session.provider,
          orchestrationModel: session.model,
          orchestrationSessionStarted: true,
          orchestrationStatus: session.status,
          status: session.status === 'running' ? 'sending' : 'idle',
        } satisfies Partial<ChatUIState>,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const exitedThreadIds = Object.entries(chats)
    .filter(
      ([threadId, chat]) =>
        chat.provider !== 'bedrock' &&
        chat.orchestrationSessionStarted &&
        !liveThreadIds.has(threadId),
    )
    .map(([threadId]) => threadId);

  return {
    sessionUpdates,
    exitedThreadIds,
  } satisfies OrchestrationSnapshotSyncPlan;
}

export function applyOrchestrationSnapshot(
  payload: OrchestrationSnapshotPayload,
) {
  const snapshot = activeChatsStore.getSnapshot();
  const plan = buildOrchestrationSnapshotSyncPlan(payload, snapshot);

  for (const { threadId, updates } of plan.sessionUpdates) {
    activeChatsStore.updateChat(threadId, updates);
  }

  for (const threadId of plan.exitedThreadIds) {
    activeChatsStore.updateChat(threadId, {
      orchestrationSessionStarted: false,
      orchestrationStatus: 'exited',
      status: 'idle',
      isProcessingStep: false,
      streamingMessage: undefined,
    });
  }
}
