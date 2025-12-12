import { createContext, useContext, ReactNode, useSyncExternalStore, useCallback } from 'react';
import { log } from '@/utils/logger';

interface ToolMapping {
  server?: string;
  toolName?: string;
  originalName?: string;
}

interface AgentTools {
  [agentSlug: string]: {
    tools: Record<string, ToolMapping>;
    loading: boolean;
    error: string | null;
  };
}

class AgentToolsStore {
  private data: AgentTools = {};
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.data;

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  async fetch(apiBase: string, agentSlug: string) {
    // Return existing promise if already fetching
    if (this.fetching.has(agentSlug)) {
      return this.fetching.get(agentSlug);
    }

    // Initialize agent data if not exists
    if (!this.data[agentSlug]) {
      this.data[agentSlug] = { tools: {}, loading: true, error: null };
      this.notify();
    } else {
      this.data[agentSlug].loading = true;
      this.data[agentSlug].error = null;
      this.notify();
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/tools`);
        const result = await response.json();
        
        if (result.success) {
          const mappings = result.data.reduce((acc: Record<string, ToolMapping>, tool: any) => {
            acc[tool.name] = {
              server: tool.server,
              toolName: tool.toolName,
              originalName: tool.originalName,
            };
            return acc;
          }, {});
          
          this.data[agentSlug] = {
            tools: mappings,
            loading: false,
            error: null,
          };
        } else {
          throw new Error(result.error || 'Failed to fetch tools');
        }
      } catch (err) {
        log.api('Failed to fetch agent tools:', err);
        this.data[agentSlug] = {
          tools: {},
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      } finally {
        this.fetching.delete(agentSlug);
        this.notify();
      }
    })();

    this.fetching.set(agentSlug, promise);
    return promise;
  }

  getTools(agentSlug: string): Record<string, ToolMapping> {
    return this.data[agentSlug]?.tools || {};
  }

  isLoading(agentSlug: string): boolean {
    return this.data[agentSlug]?.loading || false;
  }

  getError(agentSlug: string): string | null {
    return this.data[agentSlug]?.error || null;
  }
}

const agentToolsStore = new AgentToolsStore();

const AgentToolsContext = createContext<{
  store: AgentToolsStore;
} | null>(null);

export function AgentToolsProvider({ children }: { children: ReactNode }) {
  return (
    <AgentToolsContext.Provider value={{ store: agentToolsStore }}>
      {children}
    </AgentToolsContext.Provider>
  );
}

export function useAgentTools(apiBase: string, agentSlug: string | undefined) {
  const context = useContext(AgentToolsContext);
  if (!context) {
    throw new Error('useAgentTools must be used within AgentToolsProvider');
  }

  const data = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot
  );

  const fetch = useCallback(() => {
    if (agentSlug) {
      context.store.fetch(apiBase, agentSlug);
    }
  }, [apiBase, agentSlug]);

  if (!agentSlug) {
    return {};
  }

  return data[agentSlug]?.tools || {};
}

export function useAgentToolsWithState(apiBase: string, agentSlug: string | undefined) {
  const context = useContext(AgentToolsContext);
  if (!context) {
    throw new Error('useAgentToolsWithState must be used within AgentToolsProvider');
  }

  const data = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot
  );

  const fetch = useCallback(() => {
    if (agentSlug) {
      context.store.fetch(apiBase, agentSlug);
    }
  }, [apiBase, agentSlug]);

  if (!agentSlug) {
    return { tools: {}, loading: false, error: null, fetch };
  }

  return {
    tools: data[agentSlug]?.tools || {},
    loading: data[agentSlug]?.loading || false,
    error: data[agentSlug]?.error || null,
    fetch,
  };
}
