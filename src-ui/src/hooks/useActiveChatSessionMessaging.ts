import type { ProviderKind } from '@stallion-ai/contracts/provider';
import { useInvalidateQuery } from '@stallion-ai/sdk';
import { useCallback } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import {
  activeChatsStore,
  type ChatUIState,
} from '../contexts/active-chats-store';
import {
  conversationsStore,
  useConversationActions,
} from '../contexts/ConversationsContext';
import type { FileAttachment } from '../types';
import { runtimeConnectionIdToProviderKind } from '../utils/execution';
import { log } from '../utils/logger';
import { deriveLatestPlanArtifactFromMessages } from '../utils/planArtifacts';
import {
  type ActiveChatConversationMessage,
  buildOutgoingUserMessage,
  buildPostSendState,
} from './useActiveChatSessions.helpers';
import {
  sendOrchestrationTurn,
  startOrchestrationSession,
} from './useOrchestration';
import { useStreamingMessage } from './useStreamingMessage';

function inferRuntimeProvider(agentSlug: string): ProviderKind | undefined {
  if (!agentSlug.startsWith('__runtime:')) {
    return undefined;
  }
  return runtimeConnectionIdToProviderKind(
    agentSlug.slice('__runtime:'.length),
  );
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

  const sendMessage = useCallback(
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

      const { messages: updatedMessages } = buildOutgoingUserMessage(
        currentState?.messages,
        content,
        attachments,
      );

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
        const isProviderManaged =
          currentState?.executionMode === 'provider-managed';
        const model = isProviderManaged ? undefined : currentState?.model;
        const chatOptions = isProviderManaged
          ? {
              providerManagedFallback: true,
              executionScope: currentState?.executionScope,
              providerId: currentState?.providerId,
              providerModel: currentState?.model,
            }
          : undefined;
        const provider = isProviderManaged
          ? undefined
          : currentState?.orchestrationProvider ||
            currentState?.provider ||
            inferRuntimeProvider(agentSlug);

        if (provider && provider !== 'bedrock') {
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
          chatOptions,
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

          const { messages, noticeKind, effectiveFinishReason } =
            buildPostSendState(
              backendMessages as ActiveChatConversationMessage[],
              finishReason,
            );
          const latestPlanArtifact =
            deriveLatestPlanArtifactFromMessages(messages as any) ??
            activeChatsStore.getSnapshot()[sessionId]?.planArtifact ??
            null;

          const updates: Partial<ChatUIState> = {
            status: 'idle',
            abortController: undefined,
            messages,
            planArtifact: latestPlanArtifact,
          };

          if (noticeKind === 'tool-calls') {
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
          } else if (noticeKind === 'length') {
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
          } else if (noticeKind === 'unexpected') {
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
            const [nextMessage, ...remainingQueue] =
              updatedState.queuedMessages;
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
          ephemeralMessages: [
            {
              role: 'system',
              content: `Error: ${err.message}`,
            },
          ],
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

  return sendMessage;
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
