import { useCallback } from 'react';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';

export function useStreamingMessage(apiBase: string) {
  const { updateChat } = useActiveChatActions();
  const { showToast } = useToast();
  
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
      const chatState = activeChatsStore.getSnapshot()[sessionId];
      const sessionAutoApprove = chatState?.sessionAutoApprove || [];
      
      // If tool is in session autoApprove list, automatically approve it
      if (sessionAutoApprove.includes(data.toolName)) {
        console.log('[useStreamingMessage] Auto-approving tool from session list:', data.toolName);
        
        // Send approval immediately
        fetch(`${apiBase}/tool-approval/${data.approvalId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true }),
        }).catch(err => console.error('Failed to auto-approve tool:', err));
        
        // Don't add to pendingApprovals since it's auto-approved
        return {
          updated: false,
          currentTextChunk: state.currentTextChunk,
          contentParts: state.contentParts,
          pendingApprovals: state.pendingApprovals
        };
      }
      
      const pendingApprovals = new Map(state.pendingApprovals || []);
      const argsKey = JSON.stringify(data.toolArgs);
      pendingApprovals.set(argsKey, data.approvalId);
      
      console.log('[useStreamingMessage] tool-approval-request:', {
        toolName: data.toolName,
        approvalId: data.approvalId,
        argsKey,
        toolArgs: data.toolArgs
      });
      
      // Show toast notification
      const agentName = chatState?.agentName || 'Agent';
      showToast(`${agentName} is requesting approval to use ${data.toolName}`, sessionId);
      
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
  }, [updateChat, showToast]);
  
  const clearStreamingMessage = useCallback((sessionId: string) => {
    updateChat(sessionId, { streamingMessage: undefined, isProcessingStep: false });
  }, [updateChat]);
  
  return { handleStreamEvent, clearStreamingMessage };
}
