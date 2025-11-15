import { useCallback } from 'react';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';

export function useToolApproval(apiBase: string) {
  const { updateChat } = useActiveChatActions();

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

    // Update tool call state immediately
    const updatedParts = state.streamingMessage.contentParts.map(part => {
      if (part.type === 'tool' && part.tool?.approvalId === approvalId) {
        return {
          ...part,
          tool: {
            ...part.tool,
            needsApproval: false,
            cancelled: !approved,
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
      console.error('Failed to send tool approval:', err);
    }
  }, [apiBase, updateChat]);
}
