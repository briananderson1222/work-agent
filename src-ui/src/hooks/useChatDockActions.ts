import { useCallback } from 'react';
import { useActiveChatActions, useCreateChatSession, useOpenConversation } from '../contexts/ActiveChatsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { AgentSummary } from '../types';

interface DerivedSession {
  id: string;
  conversationId?: string;
  agentSlug: string;
}

interface UseChatDockActionsOptions {
  sessions: DerivedSession[];
  agents: AgentSummary[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export function useChatDockActions({
  sessions,
  agents,
  activeSessionId,
  setActiveSessionId,
}: UseChatDockActionsOptions) {
  const { apiBase } = useApiBase();
  const { isDockMaximized, setDockState, setActiveChat } = useNavigation();
  const { updateChat, removeChat } = useActiveChatActions();
  const createChatSession = useCreateChatSession();
  const openConversationAction = useOpenConversation(apiBase);

  const focusSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, isDockMaximized);
    updateChat(sessionId, { hasUnread: false });
  }, [setActiveSessionId, setActiveChat, setDockState, isDockMaximized, updateChat]);

  const removeSession = useCallback((sessionId: string) => {
    removeChat(sessionId);
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      const next = remaining[remaining.length - 1]?.id ?? null;
      setActiveSessionId(next);
      setActiveChat(next);
    }
  }, [removeChat, activeSessionId, sessions, setActiveSessionId, setActiveChat]);

  const openChatForAgent = useCallback((agent: AgentSummary) => {
    const sessionId = createChatSession(agent.slug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
  }, [createChatSession, setActiveSessionId, setActiveChat, setDockState]);

  const openConversation = useCallback(async (conversationId: string, agentSlug: string) => {
    const agent = agents.find(a => a.slug === agentSlug);
    if (!agent) return;
    
    const existing = sessions.find(s => s.conversationId === conversationId);
    if (existing) {
      focusSession(existing.id);
      return;
    }
    
    const sessionId = await openConversationAction(conversationId, agentSlug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
  }, [agents, sessions, focusSession, openConversationAction, setActiveSessionId, setActiveChat, setDockState]);

  return {
    focusSession,
    removeSession,
    openChatForAgent,
    openConversation,
  };
}
