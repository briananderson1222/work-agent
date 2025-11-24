import { useCallback } from 'react';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';
import { useToolApproval } from './useToolApproval';
import type { StreamState, HandlerContext } from './streaming/types';
import { StepHandler } from './streaming/StepHandler';
import { ReasoningHandler } from './streaming/ReasoningHandler';
import { TextDeltaHandler } from './streaming/TextDeltaHandler';
import { ToolApprovalHandler } from './streaming/ToolApprovalHandler';
import { ToolLifecycleHandler } from './streaming/ToolLifecycleHandler';
import { createNoOpResult } from './streaming/stateHelpers';

export function useStreamingMessage(apiBase: string, onNavigateToChat?: (sessionId: string) => void) {
  const { updateChat } = useActiveChatActions();
  const { showToolApproval } = useToast();
  const handleToolApproval = useToolApproval(apiBase);

  const handleStreamEvent = useCallback((
    sessionId: string,
    data: any,
    state: StreamState
  ) => {
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
      new StepHandler(context),
      new ReasoningHandler(context),
      new ToolApprovalHandler(context),
      new TextDeltaHandler(context),
      new ToolLifecycleHandler(context),
    ];

    // Find and execute handler
    const handler = handlers.find(h => h.canHandle(data));
    return handler ? handler.handle(data, state) : createNoOpResult(state);
  }, [updateChat, showToolApproval, handleToolApproval, onNavigateToChat]);

  const clearStreamingMessage = useCallback((sessionId: string) => {
    updateChat(sessionId, { streamingMessage: undefined, isProcessingStep: false });
  }, [updateChat]);

  return { handleStreamEvent, clearStreamingMessage };
}
