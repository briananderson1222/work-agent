import { useCallback, RefObject } from 'react';
import { useActiveChatActions, useCreateChatSession, useOpenConversation } from '../contexts/ActiveChatsContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { AgentSummary } from '../types';

interface DerivedSession {
  id: string;
  conversationId?: string;
  agentSlug: string;
}

interface UseChatDockActionsOptions {
  apiBase: string;
  sessions: DerivedSession[];
  agents: AgentSummary[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  setIsUserScrolledUp: (value: boolean) => void;
  messagesContainerRef: RefObject<HTMLDivElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export function useChatDockActions({
  apiBase,
  sessions,
  agents,
  activeSessionId,
  setActiveSessionId,
  setIsUserScrolledUp,
  messagesContainerRef,
  textareaRef,
}: UseChatDockActionsOptions) {
  const { isDockMaximized, setDockState, setActiveChat } = useNavigation();
  const { updateChat, removeChat } = useActiveChatActions();
  const createChatSession = useCreateChatSession();
  const openConversationAction = useOpenConversation(apiBase);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [messagesContainerRef, setIsUserScrolledUp]);

  const focusSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, isDockMaximized);
    updateChat(sessionId, { hasUnread: false });
    scrollToBottom();
  }, [setActiveSessionId, setActiveChat, setDockState, isDockMaximized, updateChat, scrollToBottom]);

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
    
    setTimeout(() => {
      textareaRef.current?.focus();
      scrollToBottom();
    }, 100);
  }, [createChatSession, setActiveSessionId, setActiveChat, setDockState, textareaRef, scrollToBottom]);

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
    scrollToBottom();
  }, [agents, sessions, focusSession, openConversationAction, setActiveSessionId, setActiveChat, setDockState, scrollToBottom]);

  return {
    focusSession,
    removeSession,
    openChatForAgent,
    openConversation,
  };
}
