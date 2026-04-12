import { useMemo, useSyncExternalStore } from 'react';
import { useAllActiveChats } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { conversationsStore } from '../contexts/ConversationsContext';
import type { ChatSession } from '../types';
import { deriveLatestPlanArtifactFromMessages } from '../utils/planArtifacts';

// Hook to get all open tabs (with messages loaded from backend)
export function useDerivedSessions(
  _apiBase: string,
  agentSlug: string | null,
  projectSlug?: string | null,
): ChatSession[] {
  const agents = useAgents();
  const allChats = useAllActiveChats();

  // Subscribe to conversations store for messages
  const conversationsSnapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot,
  );

  return useMemo(() => {
    const sessions: ChatSession[] = [];

    // Show all active chats (agentSlug filter is optional for ChatDock)
    for (const [chatId, chatState] of Object.entries(allChats)) {
      // If agentSlug is provided, filter by it (for workspace views)
      if (agentSlug && chatState.agentSlug !== agentSlug) continue;
      // If projectSlug is provided, filter by it
      if (projectSlug && chatState.projectSlug !== projectSlug) continue;

      const agent = agents.find((a) => a.slug === chatState.agentSlug);

      // Get conversation metadata for title
      const conversationsList =
        conversationsSnapshot.conversations[chatState.agentSlug!] || [];
      const conversationMeta = conversationsList.find(
        (c) => c.id === chatState.conversationId,
      );

      // Get status from ActiveChatsContext (UI state)
      const sessionStatus = chatState.status || 'idle';

      // Get messages from backend
      const messagesKey = chatState.conversationId
        ? `messages:${chatState.agentSlug}:${chatState.conversationId}`
        : null;
      const backendMessages = messagesKey
        ? conversationsSnapshot.messages[messagesKey] || []
        : [];

      // During sending, use chatState.messages as source of truth to avoid race conditions
      // with fetchMessages updating conversationsSnapshot before chatState.messages is updated
      let messages: any[];
      if (
        sessionStatus === 'sending' &&
        chatState.messages &&
        chatState.messages.length > 0
      ) {
        // Use optimistic messages during sending
        messages = chatState.messages.map((m) => ({
          ...m,
          timestamp: (m as any).timestamp || Date.now(),
          optimistic: true,
        }));
      } else {
        // Guard: if backend snapshot is momentarily stale (empty) but chatState
        // has messages, fall back to chatState.messages to prevent blank flash
        const effectiveBackend =
          backendMessages.length > 0
            ? backendMessages
            : chatState.messages || [];

        const optimisticMessages = (chatState.messages || [])
          .slice(effectiveBackend.length)
          .map((m) => ({
            ...m,
            timestamp: (m as any).timestamp || Date.now(),
            optimistic: true,
          }));

        messages = [...effectiveBackend, ...optimisticMessages];
      }

      // Merge backend and ephemeral messages, sort by timestamp
      const ephemeralMessages = chatState.ephemeralMessages || [];

      // Preserve backend timestamps, only assign fallback for messages without timestamps
      const messagesWithTimestamps = messages.map((m, index) => ({
        ...m,
        timestamp: m.timestamp || Date.now() - (messages.length - index) * 1000, // Fallback: recent timestamps in reverse order
      }));

      // NOTE: Streaming message is rendered separately via StreamingText component
      // to bypass React batching and enable smooth character-by-character display

      const allMessages = [
        ...messagesWithTimestamps,
        ...ephemeralMessages,
      ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const latestPlanArtifact =
        chatState.planArtifact ||
        deriveLatestPlanArtifactFromMessages(
          allMessages.filter((message) => !message.ephemeral) as any,
        );

      // Compute isThinking: sending but not actively processing a step
      const isThinking =
        sessionStatus === 'sending' && !chatState.isProcessingStep;

      // Derive agent name and title reactively
      const agentName = agent?.name || chatState.agentSlug || 'Unknown Agent';
      const title =
        conversationMeta?.title || chatState.title || `${agentName} Chat`;

      sessions.push({
        id: chatId,
        conversationId: chatState.conversationId,
        agentSlug: chatState.agentSlug!,
        agentName,
        title,
        messages: allMessages,
        input: chatState.input || '',
        attachments: chatState.attachments || [],
        queuedMessages: chatState.queuedMessages || [],
        inputHistory: chatState.inputHistory || [],
        hasUnread: chatState.hasUnread || false,
        error: chatState.error,
        status: sessionStatus,
        isThinking,
        abortController: chatState.abortController,
        source: 'manual' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: chatState.provider,
        providerOptions: chatState.providerOptions,
        model: chatState.model,
        orchestrationProvider: chatState.orchestrationProvider,
        orchestrationModel: chatState.orchestrationModel,
        orchestrationStatus: chatState.orchestrationStatus,
        projectSlug: chatState.projectSlug,
        projectName: chatState.projectName,
        focusDirectoryId: chatState.focusDirectoryId,
        currentModeId: chatState.currentModeId,
        planArtifact: latestPlanArtifact,
        pendingApprovals: chatState.pendingApprovals,
        isProcessingStep: chatState.isProcessingStep,
      });
    }

    return sessions;
  }, [agents, allChats, conversationsSnapshot, agentSlug, projectSlug]);
}

// Hook to get full session data for a specific conversation (with messages and UI state)
