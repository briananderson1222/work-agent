import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type StreamingMessage = {
  role: 'assistant';
  content: string;
  contentParts?: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }>;
};

type StreamingContextType = {
  getStreamingMessage: (sessionId: string) => StreamingMessage | undefined;
  setStreamingMessage: (sessionId: string, message: StreamingMessage | undefined) => void;
  clearStreamingMessage: (sessionId: string) => void;
};

const StreamingContext = createContext<StreamingContextType | undefined>(undefined);

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [streamingMessages, setStreamingMessages] = useState<Record<string, StreamingMessage>>({});

  const getStreamingMessage = useCallback((sessionId: string) => {
    return streamingMessages[sessionId];
  }, [streamingMessages]);

  const setStreamingMessage = useCallback((sessionId: string, message: StreamingMessage | undefined) => {
    // DEBUG: Log when streaming message is set
    if (message) {
    }
    setStreamingMessages(prev => {
      if (message === undefined) {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      }
      // DEBUG: Log state update
      return { ...prev, [sessionId]: message };
    });
  }, []);

  const clearStreamingMessage = useCallback((sessionId: string) => {
    setStreamingMessages(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  return (
    <StreamingContext.Provider value={{ getStreamingMessage, setStreamingMessage, clearStreamingMessage }}>
      {children}
    </StreamingContext.Provider>
  );
}

export function useStreaming() {
  const context = useContext(StreamingContext);
  if (!context) {
    throw new Error('useStreaming must be used within StreamingProvider');
  }
  return context;
}
