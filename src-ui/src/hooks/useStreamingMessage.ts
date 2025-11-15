import { useCallback } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';

export function useStreamingMessage() {
  const { updateChat } = useActiveChatActions();
  
  const handleStreamEvent = useCallback((
    sessionId: string,
    data: any,
    state: {
      currentTextChunk: string;
      contentParts: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }>;
      pendingApprovals?: Map<string, string>; // JSON.stringify(toolArgs) -> approvalId
    }
  ) => {
    if (data.type === 'start-step') {
      updateChat(sessionId, { isProcessingStep: true });
    } else if (data.type === 'finish-step') {
      updateChat(sessionId, { isProcessingStep: false });
    }
    
    // Track tools that need approval with their approvalId
    if (data.type === 'tool-approval-request') {
      const pendingApprovals = new Map(state.pendingApprovals || []);
      const argsKey = JSON.stringify(data.toolArgs);
      pendingApprovals.set(argsKey, data.approvalId);
      
      console.log('[useStreamingMessage] tool-approval-request:', {
        toolName: data.toolName,
        approvalId: data.approvalId,
        argsKey,
        toolArgs: data.toolArgs
      });
      
      return {
        updated: false,
        currentTextChunk: state.currentTextChunk,
        contentParts: state.contentParts,
        pendingApprovals
      };
    }
    
    if (data.type === 'text-delta' && (data.delta || data.text)) {
      const textDelta = data.delta || data.text;
      const newTextChunk = state.currentTextChunk + textDelta;
      
      updateChat(sessionId, {
        streamingMessage: {
          role: 'assistant',
          content: newTextChunk,
          contentParts: state.contentParts.length > 0 
            ? [...state.contentParts, { type: 'text', content: newTextChunk }] 
            : undefined,
        },
        isProcessingStep: true
      });
      
      return { 
        updated: true, 
        currentTextChunk: newTextChunk,
        contentParts: state.contentParts,
        pendingApprovals: state.pendingApprovals
      };
    }
    
    if (data.type === 'tool-input-available') {
      const newContentParts = [...state.contentParts];
      
      if (state.currentTextChunk) {
        newContentParts.push({ type: 'text', content: state.currentTextChunk });
      }
      
      const argsKey = JSON.stringify(data.input);
      const approvalId = state.pendingApprovals?.get(argsKey);
      const needsApproval = !!approvalId;
      
      console.log('[useStreamingMessage] tool-input-available:', {
        toolName: data.toolName,
        argsKey,
        input: data.input,
        approvalId,
        needsApproval,
        pendingApprovalsKeys: Array.from(state.pendingApprovals?.keys() || [])
      });
      
      newContentParts.push({
        type: 'tool',
        tool: {
          id: data.toolCallId,
          name: data.toolName,
          args: data.input,
          needsApproval,
          approvalId,
        }
      });
      
      updateChat(sessionId, {
        streamingMessage: {
          role: 'assistant',
          content: newContentParts.map(p => p.type === 'text' ? p.content : '').join(''),
          contentParts: newContentParts,
        }
      });
      
      return { 
        updated: true,
        currentTextChunk: '',
        contentParts: newContentParts,
        pendingApprovals: state.pendingApprovals
      };
    }
    
    if (data.type === 'tool-output-available' || data.type === 'tool-result') {
      const toolCallId = data.toolCallId;
      const output = data.output || data.result;
      const error = data.error;
      
      const newContentParts = state.contentParts.map(part => {
        if (part.type === 'tool' && part.tool?.id === toolCallId) {
          return {
            ...part,
            tool: {
              ...part.tool,
              result: output,
              error: error,
              state: error ? 'error' : 'complete'
            }
          };
        }
        return part;
      });
      
      updateChat(sessionId, {
        streamingMessage: {
          role: 'assistant',
          content: newContentParts.map(p => p.type === 'text' ? p.content : '').join(''),
          contentParts: newContentParts,
        }
      });
      
      return {
        updated: true,
        currentTextChunk: state.currentTextChunk,
        contentParts: newContentParts,
        pendingApprovals: state.pendingApprovals
      };
    }
    
    return { 
      updated: false,
      currentTextChunk: state.currentTextChunk,
      contentParts: state.contentParts,
      pendingApprovals: state.pendingApprovals
    };
  }, [updateChat]);
  
  const clearStreamingMessage = useCallback((sessionId: string) => {
    updateChat(sessionId, { streamingMessage: undefined, isProcessingStep: false });
  }, [updateChat]);
  
  return { handleStreamEvent, clearStreamingMessage };
}
