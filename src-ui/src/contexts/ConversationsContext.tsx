import { useQueryClient } from '@stallion-ai/sdk';
import { type ReactNode, useCallback } from 'react';
import { ConversationsContext } from './conversation-context';
import type { ConversationsContextType } from './conversation-types';
import { conversationsStore } from './conversations-store';

export * from './conversation-hooks';
export type * from './conversation-types';
export * from './conversations-store';

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const fetchMessages = useCallback<ConversationsContextType['fetchMessages']>(
    (apiBase, agentSlug, conversationId) =>
      conversationsStore.fetchMessages(
        apiBase,
        agentSlug,
        conversationId,
        queryClient,
      ),
    [queryClient],
  );

  const refreshMessages = useCallback<
    ConversationsContextType['refreshMessages']
  >(
    (apiBase, agentSlug, conversationId) =>
      conversationsStore.refreshMessages(
        apiBase,
        agentSlug,
        conversationId,
        queryClient,
      ),
    [queryClient],
  );

  const deleteConversation = useCallback<
    ConversationsContextType['deleteConversation']
  >(
    (apiBase, agentSlug, conversationId) =>
      conversationsStore.deleteConversation(apiBase, agentSlug, conversationId),
    [],
  );

  const sendMessage = useCallback<ConversationsContextType['sendMessage']>(
    (
      apiBase,
      agentSlug,
      conversationId,
      content,
      title,
      onStreamEvent,
      onConversationStarted,
      onError,
      signal,
      model,
      attachments,
      projectSlug,
      chatOptions,
    ) =>
      conversationsStore.sendMessage(
        apiBase,
        agentSlug,
        conversationId,
        content,
        title,
        onStreamEvent,
        onConversationStarted,
        onError,
        signal,
        model,
        attachments,
        projectSlug,
        chatOptions,
      ),
    [],
  );

  const setStatus = useCallback<ConversationsContextType['setStatus']>(
    (agentSlug, conversationId, status) => {
      conversationsStore.setStatus(agentSlug, conversationId, status);
    },
    [],
  );

  return (
    <ConversationsContext.Provider
      value={{
        fetchMessages,
        refreshMessages,
        deleteConversation,
        sendMessage,
        setStatus,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}
