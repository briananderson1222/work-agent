import { fetchAgentConversations } from '@stallion-ai/sdk';
import { useCallback, useEffect } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import { activeChatsStore } from '../contexts/active-chats-store';
import {
  conversationsStore,
  useConversationActions,
} from '../contexts/ConversationsContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ChatExecutionMetadata } from '../utils/execution';
import { useSendMessage } from './useActiveChatSessionMessaging';
import {
  type ActiveChatConversationMessage,
  buildRehydratedInputHistory,
  normalizeConversationMessages,
} from './useActiveChatSessions.helpers';

export function usePruneActiveChats() {
  useEffect(() => {
    const chats = activeChatsStore.getSnapshot();
    const entries = Object.entries(chats).filter(
      ([, chat]) => chat.conversationId && chat.agentSlug,
    );
    if (entries.length === 0) {
      return;
    }

    const byAgent = new Map<string, Array<[string, (typeof chats)[string]]>>();
    for (const entry of entries) {
      const slug = entry[1].agentSlug!;
      const agentSessions = byAgent.get(slug);
      if (agentSessions) {
        agentSessions.push(entry);
      } else {
        byAgent.set(slug, [entry]);
      }
    }

    (async () => {
      for (const [slug, sessions] of byAgent) {
        try {
          const conversations = await fetchAgentConversations(slug);
          const ids = new Set(
            conversations.map((conversation) => conversation.id),
          );
          for (const [sessionId, chat] of sessions) {
            if (!ids.has(chat.conversationId!)) {
              activeChatsStore.removeChat(sessionId);
            }
          }
        } catch {
          // Keep sessions if the backend is unavailable.
        }
      }
    })();
  }, []);
}

export function useCreateChatSession() {
  const { initChat } = useActiveChatActions();

  return useCallback(
    (
      agentSlug: string,
      agentName: string,
      title?: string,
      projectSlug?: string,
      projectName?: string,
      execution?: ChatExecutionMetadata,
    ) => {
      const sessionId = `${agentSlug}:${Date.now()}`;
      initChat(sessionId, {
        agentSlug,
        agentName,
        title: title || `${agentName} Chat`,
        projectSlug,
        projectName,
        executionMode: execution?.executionMode,
        executionScope: execution?.executionScope,
        runtimeConnectionId: execution?.runtimeConnectionId,
        providerId: execution?.providerId,
        provider: execution?.provider,
        model: execution?.model,
        providerOptions: execution?.providerOptions,
      });
      return sessionId;
    },
    [initChat],
  );
}

export function useOpenConversation(apiBase: string) {
  const { initChat, updateChat } = useActiveChatActions();
  const { fetchMessages } = useConversationActions();

  return useCallback(
    async (
      conversationId: string,
      agentSlug: string,
      agentName: string,
      projectSlug?: string,
      projectName?: string,
      execution?: ChatExecutionMetadata,
    ) => {
      const sessionId = `${agentSlug}:${Date.now()}`;

      initChat(sessionId, {
        agentSlug,
        agentName,
        title: `${agentName} Chat`,
        conversationId,
        projectSlug,
        projectName,
        executionMode: execution?.executionMode,
        executionScope: execution?.executionScope,
        runtimeConnectionId: execution?.runtimeConnectionId,
        providerId: execution?.providerId,
        provider: execution?.provider,
        model: execution?.model,
        providerOptions: execution?.providerOptions,
      });

      await fetchMessages(apiBase, agentSlug, conversationId);
      const key = `messages:${agentSlug}:${conversationId}`;
      const messages = conversationsStore.getSnapshot().messages[key] || [];
      updateChat(sessionId, {
        messages: normalizeConversationMessages(
          messages as ActiveChatConversationMessage[],
        ),
      });

      return sessionId;
    },
    [apiBase, fetchMessages, initChat, updateChat],
  );
}

export function useLaunchChat(apiBase: string) {
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);
  const navigation = useNavigation();

  return useCallback(
    async (
      agentSlug: string,
      agentName: string,
      initialMessage?: string,
      projectSlug?: string,
      projectName?: string,
      execution?: ChatExecutionMetadata,
    ) => {
      const sessionId = createChatSession(
        agentSlug,
        agentName,
        undefined,
        projectSlug,
        projectName,
        execution,
      );

      navigation.setActiveChat(sessionId);
      navigation.setDockState(true);

      if (initialMessage?.trim()) {
        await sendMessage(sessionId, agentSlug, undefined, initialMessage);
      }

      return sessionId;
    },
    [createChatSession, navigation, sendMessage],
  );
}

export function useRehydrateSessions(apiBase: string) {
  const { fetchMessages } = useConversationActions();
  const { updateChat } = useActiveChatActions();

  return useCallback(async () => {
    const allChats = activeChatsStore.getSnapshot();
    for (const [sessionId, chat] of Object.entries(allChats)) {
      if (!chat.conversationId || !chat.agentSlug) {
        continue;
      }

      await fetchMessages(apiBase, chat.agentSlug, chat.conversationId);
      const messagesKey = `messages:${chat.agentSlug}:${chat.conversationId}`;
      const backendMessages =
        conversationsStore.getSnapshot().messages[messagesKey] || [];
      updateChat(sessionId, {
        inputHistory: buildRehydratedInputHistory(
          backendMessages as ActiveChatConversationMessage[],
          chat.inputHistory,
        ),
      });
    }
  }, [apiBase, fetchMessages, updateChat]);
}
