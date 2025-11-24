import { useCallback } from 'react';
import { log } from '@/utils/logger';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';

export function useToolApproval(apiBase: string) {
  const { updateChat } = useActiveChatActions();
  const { dismissToast } = useToast();

  return useCallback(async (
    sessionId: string,
    agentSlug: string,
    approvalId: string,
    toolName: string,
    action: 'once' | 'trust' | 'deny'
  ) => {
    const state = activeChatsStore.getSnapshot()[sessionId];
    if (!state?.streamingMessage?.contentParts) return;

    const approved = action !== 'deny';

    // Dismiss the toast for this approval
    const toastId = state.streamingMessage.approvalToasts?.get(approvalId);
    if (toastId) {
      dismissToast(toastId);
    }

    // For 'trust', add tool to session-specific autoApprove list
    if (action === 'trust') {
      const sessionAutoApprove = [...(state.sessionAutoApprove || [])];
      if (!sessionAutoApprove.includes(toolName)) {
        sessionAutoApprove.push(toolName);
      }
      updateChat(sessionId, { sessionAutoApprove });
    }

    // Remove from pending approvals
    const pendingApprovals = (state.pendingApprovals || []).filter(id => id !== approvalId);
    updateChat(sessionId, { pendingApprovals });

    // Update tool call state immediately
    const updatedParts = state.streamingMessage.contentParts.map(part => {
      if (part.type === 'tool' && part.tool?.approvalId === approvalId) {
        return {
          ...part,
          tool: {
            ...part.tool,
            needsApproval: false,
            cancelled: !approved,
            approvalStatus: action === 'trust' ? 'auto-approved' : (approved ? 'user-approved' : 'user-denied'),
          }
        };
      }
      return part;
    });

    updateChat(sessionId, {
      streamingMessage: {
        ...state.streamingMessage,
        contentParts: updatedParts,
      }
    });
    
    // Send approval to backend (same for 'once' and 'trust')
    try {
      await fetch(`${apiBase}/tool-approval/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
    } catch (err) {
      log.api('Failed to send tool approval:', err);
    }
  }, [apiBase, updateChat, dismissToast]);
}
