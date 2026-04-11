import { useEffect, useRef } from 'react';
import { fetchConversationById } from '@stallion-ai/sdk';
import { type ChatSession } from '../../types';

interface UseChatDockActiveChatSyncArgs {
  activeChat: string | null;
  apiBase: string;
  sessions: ChatSession[];
  openConversation: (
    conversationId: string,
    agentSlug: string,
    projectSlug?: string,
  ) => Promise<void> | void;
  setActiveChat: (value: string | null) => void;
  setActiveSessionId: (value: string | null) => void;
}

export function useChatDockActiveChatSync({
  activeChat,
  apiBase,
  sessions,
  openConversation,
  setActiveChat,
  setActiveSessionId,
}: UseChatDockActiveChatSyncArgs) {
  const triedChatRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeChat) return;
    if (triedChatRef.current === activeChat) return;

    const existing = sessions.find(
      (session) =>
        session.conversationId === activeChat || session.id === activeChat,
    );
    if (existing) {
      setActiveSessionId(existing.id);
      return;
    }

    triedChatRef.current = activeChat;

    (async () => {
      try {
        const conversation = await fetchConversationById(activeChat, apiBase);
        if (!conversation) {
          setActiveChat(null);
          return;
        }
        await openConversation(
          conversation.id,
          conversation.agentSlug,
          conversation.projectSlug ?? undefined,
        );
      } catch {
        setActiveChat(null);
      }
    })();
  }, [
    activeChat,
    apiBase,
    openConversation,
    sessions,
    setActiveChat,
    setActiveSessionId,
  ]);
}
