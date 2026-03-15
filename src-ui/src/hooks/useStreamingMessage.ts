import { useCallback } from 'react';
import { log } from '@/utils/logger';
import {
  activeChatsStore,
  useActiveChatActions,
} from '../contexts/ActiveChatsContext';
import { useStreaming } from '../contexts/StreamingContext';
import { useToast } from '../contexts/ToastContext';
import { ReasoningHandler } from './streaming/ReasoningHandler';
import { StepHandler } from './streaming/StepHandler';
import { createNoOpResult } from './streaming/stateHelpers';
import { TextDeltaHandler } from './streaming/TextDeltaHandler';
import { ToolApprovalHandler } from './streaming/ToolApprovalHandler';
import { ToolLifecycleHandler } from './streaming/ToolLifecycleHandler';
import { WaitingHandler } from './streaming/WaitingHandler';
import type { HandlerContext, StreamState } from './streaming/types';
import { useToolApproval } from './useToolApproval';

export function useStreamingMessage(
  apiBase: string,
  onNavigateToChat?: (sessionId: string) => void,
) {
  const { updateChat } = useActiveChatActions();
  const { showToolApproval } = useToast();
  const handleToolApproval = useToolApproval(apiBase);
  const { setStreamingMessage, clearStreamingMessage: clearStreamingMsg } =
    useStreaming();

  const handleStreamEvent = useCallback(
    (sessionId: string, data: any, state: StreamState) => {
      if (data.type === 'text-delta') {
      }

      // Build handler context
      const context: HandlerContext = {
        sessionId,
        updateChat,
        apiBase,
        showToolApproval,
        handleToolApproval,
        onNavigateToChat,
        activeChatsStore,
      };

      // Create handlers (order matters - first match wins)
      const handlers = [
        new WaitingHandler(context),
        new StepHandler(context),
        new ReasoningHandler(context),
        new ToolApprovalHandler(context),
        new TextDeltaHandler(context),
        new ToolLifecycleHandler(context),
      ];

      // Find and execute handler
      const handler = handlers.find((h) => h.canHandle(data));

      // Handle error events explicitly
      if (data.type === 'error') {
        const errorMsg = data.errorText || data.message || 'An error occurred';
        const isModelError =
          /model|access.*denied|validation.*exception|not.*found.*model|throttl/i.test(
            errorMsg,
          );
        log.chat(
          '[Stream] Error from server:',
          errorMsg,
          isModelError ? '(model-related)' : '',
        );
        updateChat(sessionId, {
          status: 'error',
          streamingMessage: undefined,
        });
        const displayMsg = isModelError
          ? `⚠️ Model error: ${errorMsg}\n\nThe configured model may be unavailable or deprecated. Use the model selector in the chat header to switch models.`
          : `⚠️ ${errorMsg}`;
        return {
          ...createNoOpResult(state),
          streamingMessage: { role: 'assistant' as const, content: displayMsg },
        };
      }

      const result = handler
        ? handler.handle(data, state)
        : createNoOpResult(state);

      // If handler returned a streaming message, update context immediately
      if (result.streamingMessage) {
        setStreamingMessage(sessionId, result.streamingMessage);
      }

      return result;
    },
    [
      updateChat,
      showToolApproval,
      handleToolApproval,
      onNavigateToChat,
      setStreamingMessage,
      apiBase,
    ],
  );

  const clearStreamingMessage = useCallback(
    (sessionId: string) => {
      clearStreamingMsg(sessionId);
      updateChat(sessionId, {
        streamingMessage: undefined,
        isProcessingStep: false,
      });
    },
    [clearStreamingMsg, updateChat],
  );

  return { handleStreamEvent, clearStreamingMessage };
}
