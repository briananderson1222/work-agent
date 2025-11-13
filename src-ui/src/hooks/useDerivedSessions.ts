import { useMemo, useSyncExternalStore } from 'react';
import { useConversations, useMessages, useConversationStatus, conversationsStore } from '../contexts/ConversationsContext';
import { useActiveChatState, useAllActiveChats } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import type { ChatSession } from '../types';

// Hook to get all open tabs for an agent (conversations that have ActiveChat state)
export function useDerivedSessions(apiBase: string, agentSlug: string | null): ChatSession[] {
  const agents = useAgents(apiBase);
  const conversations = useConversations(apiBase, agentSlug || '', !!agentSlug);
  const allChats = useAllActiveChats();
  
  // Subscribe to status changes
  const statuses = useSyncExternalStore(
    conversationsStore.subscribe,
    () => conversationsStore.getSnapshot().statuses
  );
  
  // Debug: log when statuses change
  const streamingKeys = Object.keys(statuses).filter(k => statuses[k] === 'streaming');
  if (streamingKeys.length > 0) {
  }
  
  return useMemo(() => {
    if (!agentSlug) return [];
    
    const sessions: ChatSession[] = [];
    
    // Only show conversations that have an active chat (open tab)
    for (const [chatId, chatState] of Object.entries(allChats)) {
      // Only include chats for the current agent
      if (chatState.agentSlug !== agentSlug) continue;
      
      const agent = agents.find(a => a.slug === chatState.agentSlug);
      
      // Find matching backend conversation
      const conv = conversations.find(c => c.id === chatId);
      
      // Get status from ConversationsContext
      const statusKey = `${chatState.agentSlug}:${chatId}`;
      const convStatus = statuses[statusKey] || 'idle';
      const sessionStatus = convStatus === 'streaming' ? 'sending' : convStatus === 'idle' ? 'idle' : 'error';
      
      if (convStatus === 'streaming') {
      }
      
      const messages = [];
      // Add streaming message if present
      if (chatState.streamingMessage) {
        messages.push(chatState.streamingMessage);
      }
      
      sessions.push({
        id: chatId,
        conversationId: conv ? conv.id : chatId,
        agentSlug: chatState.agentSlug!,
        agentName: chatState.agentName || agent?.name || agentSlug,
        title: chatState.title || conv?.title || 'New Chat',
        messages,
        input: chatState.input || '',
        attachments: chatState.attachments || [],
        queuedMessages: chatState.queuedMessages || [],
        inputHistory: chatState.inputHistory || [],
        hasUnread: chatState.hasUnread || false,
        error: chatState.error,
        status: sessionStatus,
        source: 'manual' as const,
        createdAt: conv ? new Date(conv.createdAt).getTime() : Date.now(),
        updatedAt: conv ? new Date(conv.updatedAt).getTime() : Date.now(),
        model: undefined,
      });
    }
    
    return sessions;
  }, [agentSlug, conversations, agents, allChats, statuses]);
}

// Hook to get full session data for a specific conversation (with messages and UI state)
export function useEnrichedSession(
  apiBase: string, 
  agentSlug: string | null, 
  conversationId: string | null,
  baseSession: ChatSession | null
): ChatSession | null {
  const messages = useMessages(apiBase, agentSlug || '', conversationId || '', !!(agentSlug && conversationId));
  const chatState = useActiveChatState(conversationId || '');
  
  return useMemo(() => {
    if (!baseSession || !conversationId) return baseSession;
    
    // Use status from baseSession (already computed in useDerivedSessions)
    const sessionStatus = baseSession.status;
    
    const allMessages = [];
    
    // Get backend messages
    const backendMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      contentParts: m.contentParts,
      timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
    }));
    
    // Add backend messages first (conversation history)
    allMessages.push(...backendMessages);
    
    // Add ephemeral messages after backend (new user message before backend confirms)
    if (chatState?.ephemeralMessages && chatState.ephemeralMessages.length > 0) {
      allMessages.push(...chatState.ephemeralMessages.map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        timestamp: Date.now(),
      })));
    }
    
    // Add streaming message last (assistant response in progress)
    if (chatState?.streamingMessage) {
      allMessages.push(chatState.streamingMessage as any);
    }
    
    return {
      ...baseSession,
      messages: allMessages,
      input: chatState?.input || '',
      attachments: chatState?.attachments || [],
      queuedMessages: chatState?.queuedMessages || [],
      inputHistory: chatState?.inputHistory || [],
      hasUnread: chatState?.hasUnread || false,
      error: chatState?.error,
      status: sessionStatus,
    };
  }, [baseSession, conversationId, messages, chatState]);
}
