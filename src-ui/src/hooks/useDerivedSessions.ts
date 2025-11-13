import { useMemo, useSyncExternalStore } from 'react';
import { useConversations, useMessages, useConversationStatus } from '../contexts/ConversationsContext';
import { useActiveChatState, useAllActiveChats } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import type { ChatSession } from '../types';

// Hook to get all sessions for an agent (includes both backend conversations and draft sessions)
export function useDerivedSessions(apiBase: string, agentSlug: string | null): ChatSession[] {
  const agents = useAgents(apiBase);
  const conversations = useConversations(apiBase, agentSlug || '', !!agentSlug);
  const allChats = useAllActiveChats();
  
  return useMemo(() => {
    if (!agentSlug) return [];
    
    const sessions: ChatSession[] = [];
    
    // Add backend conversations
    for (const conv of conversations) {
      const agent = agents.find(a => a.slug === conv.agentSlug);
      const chatState = allChats[conv.id];
      
      const messages = [];
      // Add streaming message if present
      if (chatState?.streamingMessage) {
        messages.push(chatState.streamingMessage);
      }
      
      sessions.push({
        id: conv.id,
        conversationId: conv.id,
        agentSlug: conv.agentSlug,
        agentName: agent?.name || conv.agentSlug,
        title: conv.title || `${agent?.name || 'Agent'} Chat`,
        messages,
        input: chatState?.input || '',
        attachments: chatState?.attachments || [],
        queuedMessages: chatState?.queuedMessages || [],
        inputHistory: chatState?.inputHistory || [],
        hasUnread: chatState?.hasUnread || false,
        error: chatState?.error,
        status: 'idle' as const,
        source: 'manual' as const,
        createdAt: new Date(conv.createdAt).getTime(),
        updatedAt: new Date(conv.updatedAt).getTime(),
        model: undefined,
      });
    }
    
    // Add draft sessions (chats that don't have backend conversations yet)
    for (const [chatId, chatState] of Object.entries(allChats)) {
      // Skip if already added from conversations
      if (sessions.find(s => s.id === chatId)) continue;
      
      // Only include drafts for the current agent
      if (chatState.agentSlug !== agentSlug) continue;
      
      const messages = [];
      // Add streaming message if present
      if (chatState.streamingMessage) {
        messages.push(chatState.streamingMessage);
      }
      
      sessions.push({
        id: chatId,
        conversationId: chatId,
        agentSlug: chatState.agentSlug!,
        agentName: chatState.agentName || agentSlug,
        title: chatState.title || 'New Chat',
        messages,
        input: chatState.input || '',
        attachments: chatState.attachments || [],
        queuedMessages: chatState.queuedMessages || [],
        inputHistory: chatState.inputHistory || [],
        hasUnread: chatState.hasUnread || false,
        error: chatState.error,
        status: 'idle' as const,
        source: 'manual' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: undefined,
      });
    }
    
    return sessions;
  }, [agentSlug, conversations, agents, allChats]);
}

// Hook to get full session data for a specific conversation (with messages and UI state)
export function useEnrichedSession(
  apiBase: string, 
  agentSlug: string | null, 
  conversationId: string | null,
  baseSession: ChatSession | null
): ChatSession | null {
  const messages = useMessages(apiBase, agentSlug || '', conversationId || '', !!(agentSlug && conversationId));
  const { status } = useConversationStatus(agentSlug || '', conversationId || '');
  const chatState = useActiveChatState(conversationId || '');
  
  return useMemo(() => {
    if (!baseSession || !conversationId) return baseSession;
    
    // Map conversation status to session status
    const sessionStatus = status === 'streaming' ? 'sending' : status === 'idle' ? 'idle' : 'error';
    
    // Combine backend messages with streaming message
    const allMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
    }));
    
    // Add streaming message if present
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
  }, [baseSession, conversationId, messages, status, chatState]);
}
