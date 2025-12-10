import { useCallback } from 'react';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';
import { useStreaming } from '../contexts/StreamingContext';
import { useToolApproval } from './useToolApproval';
import { log } from '@/utils/logger';
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
  const { setStreamingMessage, clearStreamingMessage: clearStreamingMsg } = useStreaming();

  const handleStreamEvent = useCallback((
    sessionId: string,
    data: any,
    state: StreamState
  ) => {
    if (data.type === 'text-delta') {
      console.log('[useStreamingMessage] text-delta:', data.delta || data.text);
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
      new StepHandler(context),
      new ReasoningHandler(context),
      new ToolApprovalHandler(context),
      new TextDeltaHandler(context),
      new ToolLifecycleHandler(context),
    ];

    // Find and execute handler
    const handler = handlers.find(h => h.canHandle(data));
    const result = handler ? handler.handle(data, state) : createNoOpResult(state);
    
    // If handler returned a streaming message, update context immediately
    if (result.streamingMessage) {
      console.log('[useStreamingMessage] Setting streaming message, content length:', result.streamingMessage.content.length);
      setStreamingMessage(sessionId, result.streamingMessage);
    }
    
    return result;
  }, [updateChat, showToolApproval, handleToolApproval, onNavigateToChat, setStreamingMessage]);

  const clearStreamingMessage = useCallback((sessionId: string) => {
    clearStreamingMsg(sessionId);
    updateChat(sessionId, { streamingMessage: undefined, isProcessingStep: false });
  }, [clearStreamingMsg, updateChat]);

  return { handleStreamEvent, clearStreamingMessage };
}
