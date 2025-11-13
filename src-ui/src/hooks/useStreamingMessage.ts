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
    }
  ) => {
    if (data.type === 'text-delta' && (data.delta || data.text)) {
      const textDelta = data.delta || data.text;
      const newTextChunk = state.currentTextChunk + textDelta;
      
      // Update streaming message in real-time
      updateChat(sessionId, {
        streamingMessage: {
          role: 'assistant',
          content: newTextChunk,
          contentParts: state.contentParts.length > 0 
            ? [...state.contentParts, { type: 'text', content: newTextChunk }] 
            : undefined,
        }
      });
      
      return { 
        updated: true, 
        currentTextChunk: newTextChunk,
        contentParts: state.contentParts 
      };
    }
    
    if (data.type === 'tool-input-available') {
      const newContentParts = [...state.contentParts];
      
      // Finalize current text chunk
      if (state.currentTextChunk) {
        newContentParts.push({ type: 'text', content: state.currentTextChunk });
      }
      
      const toolCall = {
        id: data.toolCallId,
        name: data.toolName,
        args: data.input,
      };
      
      newContentParts.push({ type: 'tool', tool: toolCall });
      
      // Update with tool call
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
        contentParts: newContentParts
      };
    }
    
    return { 
      updated: false,
      currentTextChunk: state.currentTextChunk,
      contentParts: state.contentParts
    };
  }, [updateChat]);
  
  const clearStreamingMessage = useCallback((sessionId: string) => {
    updateChat(sessionId, { streamingMessage: undefined });
  }, [updateChat]);
  
  return { handleStreamEvent, clearStreamingMessage };
}
