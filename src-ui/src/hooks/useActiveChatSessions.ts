import type { ProviderKind } from '@stallion-ai/contracts/provider';
import { fetchAgentConversations, useInvalidateQuery } from '@stallion-ai/sdk';
import { useCallback, useEffect } from 'react';
import { useConversationActions } from '../contexts/ConversationsContext';
import {
  activeChatsStore,
  type ChatUIState,
} from '../contexts/active-chats-store';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { log } from '../utils/logger';
import { sendOrchestrationTurn, startOrchestrationSession } from './useOrchestration';
import { useStreamingMessage } from './useStreamingMessage';
import type { FileAttachment } from '../types';
import { conversationsStore } from '../contexts/ConversationsContext';

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
          const ids = new Set(conversations.map((conversation) => conversation.id));
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

export function useSendMessage(
  apiBase: string,
  onActiveSessionChange?: (newSessionId: string) => void,
  onError?: (error: Error) => void,
  handleSlashCommand?: (
    sessionId: string,
    content: string,
  ) => Promise<boolean | string | 'CLEAR'>,
) {
  const { updateChat, clearInput, assignConversationId, addEphemeralMessage } =
    useActiveChatActions();
  const { sendMessage: sendToServer, fetchMessages } = useConversationActions();
  const { handleStreamEvent, clearStreamingMessage } = useStreamingMessage(
    apiBase,
    onActiveSessionChange,
  );
  const invalidate = useInvalidateQuery();

  return useCallback(
    async (
      sessionId: string,
      agentSlug: string,
      conversationId: string | undefined,
      content: string,
      attachments?: FileAttachment[],
    ) => {
      const allChats = activeChatsStore.getSnapshot();
      const currentState = allChats[sessionId];

      if (currentState?.status === 'sending') {
        clearInput(sessionId);
        updateChat(sessionId, {
          queuedMessages: [...(currentState.queuedMessages || []), content],
        });
        return;
      }

      if (content.startsWith('/') && handleSlashCommand) {
        const result = await handleSlashCommand(sessionId, content);
        if (result === true || result === 'CLEAR') {
          return;
        }
        if (typeof result === 'string' && result !== 'CLEAR') {
          addEphemeralMessage(sessionId, {
            role: 'system',
            content: `Slash command **${content}** was sent as user message`,
          });
          content = result;
        }
      }

      const contentParts: Array<{
        type: string;
        content?: string;
        url?: string;
        mediaType?: string;
        name?: string;
      }> = [];
      if (content) {
        contentParts.push({ type: 'text', content });
      }
      if (attachments) {
        for (const attachment of attachments) {
          contentParts.push({
            type: 'file',
            url: attachment.data,
            mediaType: attachment.type,
            name: attachment.name,
          });
        }
      }

      const updatedMessages = [
        ...(currentState?.messages || []),
        {
          role: 'user' as const,
          content,
          contentParts: contentParts.length > 0 ? contentParts : undefined,
        },
      ];

      const abortController = new AbortController();

      clearInput(sessionId);
      updateChat(sessionId, {
        status: 'sending',
        messages: updatedMessages,
        abortController,
        attachments: [],
      });

      const currentSessionId = sessionId;

      try {
        const title = !conversationId ? currentState?.title : undefined;
        const model = currentState?.model;
        const provider = currentState?.provider || 'bedrock';

        if (provider !== 'bedrock') {
          if (attachments && attachments.length > 0) {
            throw new Error(
              'Attachments are not supported yet for Claude or Codex sessions.',
            );
          }

          if (!currentState?.orchestrationSessionStarted) {
            await startOrchestrationSession({
              apiBase,
              threadId: sessionId,
              provider,
              modelId: model,
              modelOptions: currentState?.providerOptions,
            });
            updateChat(sessionId, { orchestrationSessionStarted: true });
          }

          await sendOrchestrationTurn({
            apiBase,
            threadId: sessionId,
            text: content,
            modelId: model,
            modelOptions: currentState?.providerOptions,
          });
          updateChat(sessionId, {
            status: 'sending',
            abortController: undefined,
          });
          return;
        }

        const result = await sendToServer(
          apiBase,
          agentSlug,
          conversationId,
          content,
          title,
          (data, state) => handleStreamEvent(currentSessionId, data, state),
          (nextConversationId, nextTitle) => {
            assignConversationId(sessionId, nextConversationId);
            if (nextTitle) {
              updateChat(sessionId, { title: nextTitle });
            }
            invalidate(['conversations', agentSlug]);
            onActiveSessionChange?.(sessionId);
          },
          onError,
          abortController.signal,
          model,
          attachments,
          currentState?.projectSlug,
        );

        const nextConversationId = result?.conversationId;
        const finishReason = result?.finishReason;

        try {
          if (nextConversationId) {
            await fetchMessages(apiBase, agentSlug, nextConversationId);
          }

          const messagesKey = `messages:${agentSlug}:${nextConversationId}`;
          const backendMessages =
            conversationsStore.getSnapshot().messages[messagesKey] || [];

          clearStreamingMessage(sessionId);

          const effectiveFinishReason =
            finishReason ||
            (backendMessages[backendMessages.length - 1] as any)?.finishReason;

          const updates: Partial<ChatUIState> = {
            status: 'idle',
            abortController: undefined,
            messages: backendMessages.map((message) => ({
              role: message.role,
              content: message.content,
              contentParts: message.contentParts,
            })),
          };

          if (effectiveFinishReason === 'tool-calls') {
            updates.ephemeralMessages = [
              {
                role: 'system',
                content:
                  '🔄 **Conversation paused** - I reached the maximum number of tool calls in this turn. Click Continue to let me keep working.',
                action: {
                  label: 'Continue',
                  handler: () =>
                    sendMessage(
                      sessionId,
                      agentSlug,
                      nextConversationId,
                      'continue',
                    ),
                },
              },
            ];
          } else if (effectiveFinishReason === 'length') {
            updates.ephemeralMessages = [
              {
                role: 'system',
                content:
                  '✂️ **Response truncated** - The output token limit was reached. Click Continue to pick up where I left off.',
                action: {
                  label: 'Continue',
                  handler: () =>
                    sendMessage(
                      sessionId,
                      agentSlug,
                      nextConversationId,
                      'continue',
                    ),
                },
              },
            ];
          } else if (
            effectiveFinishReason &&
            effectiveFinishReason !== 'stop' &&
            effectiveFinishReason !== 'end_turn'
          ) {
            updates.ephemeralMessages = [
              {
                role: 'system',
                content: `⚠️ **Response ended unexpectedly** — reason: ${effectiveFinishReason}`,
              },
            ];
          }

          updateChat(sessionId, updates);

          const updatedState = activeChatsStore.getSnapshot()[sessionId];
          if (
            updatedState?.queuedMessages &&
            updatedState.queuedMessages.length > 0 &&
            !updatedState.isEditingQueue
          ) {
            const [nextMessage, ...remainingQueue] = updatedState.queuedMessages;
            updateChat(sessionId, { queuedMessages: remainingQueue });
            setTimeout(() => {
              sendMessage(
                sessionId,
                agentSlug,
                updatedState.conversationId,
                nextMessage,
              );
            }, 100);
          }
        } catch (replaceError) {
          log.api('[useSendMessage] Error replacing messages:', replaceError);
          clearStreamingMessage(sessionId);
          updateChat(sessionId, { status: 'idle', abortController: undefined });
        }
      } catch (error) {
        const err = error as Error;
        updateChat(sessionId, {
          status: 'error',
          error: err.message,
          abortController: undefined,
        });
        clearStreamingMessage(sessionId);
      }
    },
    [
      addEphemeralMessage,
      apiBase,
      assignConversationId,
      clearInput,
      clearStreamingMessage,
      fetchMessages,
      handleSlashCommand,
      handleStreamEvent,
      invalidate,
      onActiveSessionChange,
      onError,
      sendToServer,
      updateChat,
    ],
  );
}

export function useCancelMessage() {
  const { updateChat } = useActiveChatActions();

  return useCallback(
    (sessionId: string) => {
      const state = activeChatsStore.getSnapshot()[sessionId];
      if (state?.abortController && state.status === 'sending') {
        (
          state.abortController as AbortController & {
            _userInitiated?: boolean;
          }
        )._userInitiated = true;
        state.abortController.abort('User cancelled');
        updateChat(sessionId, { status: 'idle', abortController: undefined });
      }
    },
    [updateChat],
  );
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
      execution?: {
        provider?: ProviderKind;
        model?: string;
        providerOptions?: Record<string, unknown>;
      },
    ) => {
      const sessionId = `${agentSlug}:${Date.now()}`;
      initChat(sessionId, {
        agentSlug,
        agentName,
        title: title || `${agentName} Chat`,
        projectSlug,
        projectName,
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
      execution?: {
        provider?: ProviderKind;
        model?: string;
        providerOptions?: Record<string, unknown>;
      },
    ) => {
      const sessionId = `${agentSlug}:${Date.now()}`;

      initChat(sessionId, {
        agentSlug,
        agentName,
        title: `${agentName} Chat`,
        conversationId,
        projectSlug,
        projectName,
        provider: execution?.provider,
        model: execution?.model,
        providerOptions: execution?.providerOptions,
      });

      await fetchMessages(apiBase, agentSlug, conversationId);
      const key = `messages:${agentSlug}:${conversationId}`;
      const messages = conversationsStore.getSnapshot().messages[key] || [];
      updateChat(sessionId, { messages });

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
      execution?: {
        provider?: ProviderKind;
        model?: string;
        providerOptions?: Record<string, unknown>;
      },
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
      const userMessages = backendMessages
        .filter((message) => message.role === 'user')
        .map((message) => message.content);
      const storedSlashCommands = (chat.inputHistory || []).filter((input) =>
        input.startsWith('/'),
      );
      updateChat(sessionId, {
        inputHistory: [...userMessages, ...storedSlashCommands],
      });
    }
  }, [apiBase, fetchMessages, updateChat]);
}
