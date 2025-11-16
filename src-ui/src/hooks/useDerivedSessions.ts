import { useMemo, useSyncExternalStore } from 'react';
import { useConversations, useMessages, useConversationStatus, conversationsStore } from '../contexts/ConversationsContext';
import { useActiveChatState, useAllActiveChats } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import type { ChatSession } from '../types';

// Hook to get all open tabs (with messages loaded from backend)
export function useDerivedSessions(apiBase: string, agentSlug: string | null): ChatSession[] {
  const agents = useAgents(apiBase);
  const allChats = useAllActiveChats();
  
  // Subscribe to conversations store for messages
  const conversationsSnapshot = useSyncExternalStore(
    conversationsStore.subscribe,
    conversationsStore.getSnapshot,
    conversationsStore.getSnapshot
  );
  
  return useMemo(() => {
    const sessions: ChatSession[] = [];
    
    // Show all active chats (agentSlug filter is optional for ChatDock)
    for (const [chatId, chatState] of Object.entries(allChats)) {
      // If agentSlug is provided, filter by it (for workspace views)
      if (agentSlug && chatState.agentSlug !== agentSlug) continue;
      
      const agent = agents.find(a => a.slug === chatState.agentSlug);
      
      // Get conversation metadata for title
      const conversationsList = conversationsSnapshot.conversations[chatState.agentSlug!] || [];
      const conversationMeta = conversationsList.find(c => c.id === chatState.conversationId);
      
      // Get status from ActiveChatsContext (UI state)
      const sessionStatus = chatState.status || 'idle';
      
      // Get messages from backend
      const messagesKey = chatState.conversationId ? `messages:${chatState.agentSlug}:${chatState.conversationId}` : null;
      const backendMessages = messagesKey ? conversationsSnapshot.messages[messagesKey] || [] : [];
      
      // Get optimistic messages (user's message before backend confirms)
      // Only show optimistic messages that are newer than what backend has
      const optimisticMessages = (chatState.messages || [])
        .slice(backendMessages.length) // Only messages after backend count
        .map(m => ({
          ...m,
          timestamp: m.timestamp || Date.now(),
          optimistic: true,
        }));
      
      // Merge all message sources
      const messages = [...backendMessages, ...optimisticMessages];
      
      console.log('[useDerivedSessions]', { chatId, status: sessionStatus, messagesCount: messages.length, hasStreaming: !!chatState.streamingMessage });
      
      // Merge backend and ephemeral messages, sort by timestamp
      const ephemeralMessages = chatState.ephemeralMessages || [];
      
      // Assign sequential timestamps to backend messages that don't have them
      const messagesWithTimestamps = messages.map((m, index) => ({
        ...m,
        timestamp: m.timestamp || index + 1, // Sequential: 1, 2, 3... (before any real timestamps)
      }));
      
      const allMessages = [...messagesWithTimestamps, ...ephemeralMessages]
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      // Add streaming message (assistant response in progress)
      if (chatState.streamingMessage) {
        console.log('[useDerivedSessions] Adding streaming message:', chatState.streamingMessage.content?.substring(0, 50));
        allMessages.push(chatState.streamingMessage as any);
      }
      
      // Compute isThinking: sending but not actively processing a step
      const isThinking = sessionStatus === 'sending' && !chatState.isProcessingStep;
      
      // Derive agent name and title reactively
      const agentName = agent?.name || chatState.agentSlug || 'Unknown Agent';
      const title = conversationMeta?.title || chatState.title || `${agentName} Chat`;
      
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
        model: undefined,
      });
    }
    
    return sessions;
  }, [agents, allChats, conversationsSnapshot]);
}

// Hook to get full session data for a specific conversation (with messages and UI state)
