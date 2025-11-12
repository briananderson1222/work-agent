import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';

type StatsData = {
  contextWindowPercentage?: number;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  turns?: number;
  toolCalls?: number;
  estimatedCost?: number;
  systemPromptTokens?: number;
  mcpServerTokens?: number;
  userMessageTokens?: number;
  assistantMessageTokens?: number;
  contextFilesTokens?: number;
  modelStats?: Record<string, any>;
};

class StatsStore {
  private stats = new Map<string, StatsData>();
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.stats;
  };

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  async fetch(agentSlug: string, conversationId: string, apiBase: string, force: boolean = false) {
    const key = `${agentSlug}:${conversationId}`;
    
    if (!force && this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        // Use empty string for conversationId if not set - backend will return agent-level stats
        const url = `${apiBase}/agents/${agentSlug}/conversations/${conversationId || ''}/stats`;
          
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
          this.stats.set(key, result.data);
          this.notify();
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  clear(agentSlug: string, conversationId: string) {
    const key = `${agentSlug}:${conversationId}`;
    this.stats.delete(key);
    this.notify();
  }
}

const statsStore = new StatsStore();

type StatsContextType = {
  fetchStats: (agentSlug: string, conversationId: string, apiBase: string, force?: boolean) => Promise<void>;
  clearStats: (agentSlug: string, conversationId: string) => void;
};

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  const fetchStats = useCallback((agentSlug: string, conversationId: string, apiBase: string, force: boolean = false) => {
    return statsStore.fetch(agentSlug, conversationId, apiBase, force);
  }, []);

  const clearStats = useCallback((agentSlug: string, conversationId: string) => {
    statsStore.clear(agentSlug, conversationId);
  }, []);

  return (
    <StatsContext.Provider value={{ fetchStats, clearStats }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats(agentSlug: string, conversationId: string, apiBase: string, shouldFetch: boolean = true) {
  const context = useContext(StatsContext);
  if (!context) {
    throw new Error('useStats must be used within StatsProvider');
  }

  const { fetchStats } = context;
  const key = `${agentSlug}:${conversationId}`;

  const allStats = useSyncExternalStore(
    statsStore.subscribe,
    statsStore.getSnapshot,
    statsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchStats(agentSlug, conversationId, apiBase);
    }
  }, [agentSlug, conversationId, apiBase, shouldFetch, fetchStats]);

  const refetch = useCallback(() => {
    return fetchStats(agentSlug, conversationId, apiBase, true);
  }, [agentSlug, conversationId, apiBase, fetchStats]);

  return { 
    stats: allStats.get(key) || null,
    refetch
  };
}
