import { useCallback } from 'react';
import {
  useActiveChatActions,
  useCreateChatSession,
  useOpenConversation,
} from '../contexts/ActiveChatsContext';
import type { AgentData } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';

interface DerivedSession {
  id: string;
  conversationId?: string;
  agentSlug: string;
}

interface UseChatDockActionsOptions {
  sessions: DerivedSession[];
  agents: AgentData[];
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

  const focusSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setActiveChat(sessionId);
      setDockState(true, isDockMaximized);
      updateChat(sessionId, { hasUnread: false });
    },
    [
      setActiveSessionId,
      setActiveChat,
      setDockState,
      isDockMaximized,
      updateChat,
    ],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      removeChat(sessionId);
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        const next = remaining[remaining.length - 1]?.id ?? null;
        setActiveSessionId(next);
        setActiveChat(next);
      }
    },
    [removeChat, activeSessionId, sessions, setActiveSessionId, setActiveChat],
  );

  const openChatForAgent = useCallback(
    (agent: AgentData, projectSlug?: string, projectName?: string) => {
      const sessionId = createChatSession(
        agent.slug,
        agent.name,
        undefined,
        projectSlug,
        projectName,
      );
      setActiveSessionId(sessionId);
      setActiveChat(sessionId);
      setDockState(true, isDockMaximized);
    },
    [
      createChatSession,
      setActiveSessionId,
      setActiveChat,
      setDockState,
      isDockMaximized,
    ],
  );

  const openConversation = useCallback(
    async (conversationId: string, agentSlug: string, projectSlug?: string, projectName?: string) => {
      const agent = agents.find((a) => a.slug === agentSlug);
      if (!agent) return;

      const existing = sessions.find(
        (s) => s.conversationId === conversationId,
      );
      if (existing) {
        focusSession(existing.id);
        return;
      }

      const sessionId = await openConversationAction(
        conversationId,
        agentSlug,
        agent.name,
        projectSlug,
        projectName,
      );
      setActiveSessionId(sessionId);
      setActiveChat(sessionId);
      setDockState(true, false);
    },
    [
      agents,
      sessions,
      focusSession,
      openConversationAction,
      setActiveSessionId,
      setActiveChat,
      setDockState,
    ],
  );

  return {
    focusSession,
    removeSession,
    openChatForAgent,
    openConversation,
  };
}
