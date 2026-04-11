import { useCallback } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import {
  useCreateChatSession,
  useOpenConversation,
} from './useActiveChatSessions';
import type { AgentData } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { resolveAgentExecution } from '../utils/execution';

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
      const convId =
        sessions.find((s) => s.id === sessionId)?.conversationId ?? null;
      setActiveChat(convId);
      setDockState(true, isDockMaximized);
      updateChat(sessionId, { hasUnread: false });
    },
    [
      sessions,
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
        const next = remaining[remaining.length - 1] ?? null;
        setActiveSessionId(next?.id ?? null);
        setActiveChat(next?.conversationId ?? null);
      }
    },
    [removeChat, activeSessionId, sessions, setActiveSessionId, setActiveChat],
  );

  const openChatForAgent = useCallback(
    (agent: AgentData, projectSlug?: string, projectName?: string) => {
      const execution = resolveAgentExecution(agent);
      const sessionId = createChatSession(
        agent.slug,
        agent.name,
        undefined,
        projectSlug,
        projectName,
        execution,
      );
      setActiveSessionId(sessionId);
      // New chat has no conversationId yet — URL gets no ?chat= param
      setActiveChat(null);
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
    async (
      conversationId: string,
      agentSlug: string,
      projectSlug?: string,
      projectName?: string,
    ) => {
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
        resolveAgentExecution(agent),
      );
      setActiveSessionId(sessionId);
      setActiveChat(conversationId);
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
