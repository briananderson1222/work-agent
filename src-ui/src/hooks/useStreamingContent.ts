import { useEffect, useRef, useState } from 'react';
import { activeChatsStore } from '../contexts/ActiveChatsContext';

type ContentPart = { type: 'text' | 'tool' | 'reasoning'; content?: string; tool?: any };

type StreamingState = {
  hasContent: boolean;
  contentParts: ContentPart[];
};

/**
 * Hook that subscribes to streaming content.
 * Returns a ref for direct DOM text updates (current streaming text)
 * and state for completed contentParts.
 */
export function useStreamingContent(sessionId: string) {
  const textRef = useRef<HTMLElement>(null);
  const lastTextInPartsLengthRef = useRef(0);
  const [state, setState] = useState<StreamingState>({ hasContent: false, contentParts: [] });
  
  useEffect(() => {
    const unsubscribe = activeChatsStore.subscribe(() => {
      const chat = activeChatsStore.getSnapshot()[sessionId];
      const streamingMessage = chat?.streamingMessage;
      const content = streamingMessage?.content || '';
      const contentParts = streamingMessage?.contentParts || [];
      
      // Calculate text that's already in contentParts
      const textInParts = contentParts
        .filter(p => p.type === 'text')
        .map(p => p.content || '')
        .join('');
      
      // Update textRef when content changes OR when text moves into contentParts
      if (textRef.current && (textInParts.length !== lastTextInPartsLengthRef.current || content.length !== textInParts.length)) {
        const currentStreamingText = content.slice(textInParts.length);
        textRef.current.textContent = currentStreamingText;
        lastTextInPartsLengthRef.current = textInParts.length;
      }
      
      // Update state for contentParts (React batched, but that's OK for completed parts)
      const hasContent = content.length > 0 || contentParts.length > 0;
      setState(prev => {
        if (prev.hasContent !== hasContent || prev.contentParts !== contentParts) {
          return { hasContent, contentParts };
        }
        return prev;
      });
    });
    
    return unsubscribe;
  }, [sessionId]);
  
  return { textRef, ...state };
}
