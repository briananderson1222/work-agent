import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';

type AgentData = {
  slug: string;
  name: string;
  description?: string;
  model?: string;
  icon?: string;
  updatedAt?: string;
  commands?: Record<string, any>;
  ui?: any;
  toolsConfig?: any;
  workflowWarnings?: string[];
};

class AgentsStore {
  private agents: AgentData[] = [];
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.agents;
  };

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  async fetchAll(apiBase: string) {
    const key = 'all';
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/api/agents`);
        const result = await response.json();
        
        if (result.success) {
          this.agents = result.data;
          this.notify();
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async fetchOne(apiBase: string, slug: string) {
    if (this.fetching.has(slug)) {
      return this.fetching.get(slug);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${slug}`);
        const result = await response.json();
        
        if (result.success) {
          const idx = this.agents.findIndex(a => a.slug === slug);
          if (idx >= 0) {
            this.agents[idx] = result.data;
          } else {
            this.agents.push(result.data);
          }
          this.notify();
        }
      } catch (error) {
        console.error(`Failed to fetch agent ${slug}:`, error);
      } finally {
        this.fetching.delete(slug);
      }
    })();

    this.fetching.set(slug, promise);
    return promise;
  }

  async create(apiBase: string, agent: AgentData) {
    try {
      const response = await fetch(`${apiBase}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      const result = await response.json();
      
      if (result.success) {
        this.agents.push(result.data);
        this.notify();
      }
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  }

  async update(apiBase: string, slug: string, agent: Partial<AgentData>) {
    try {
      const response = await fetch(`${apiBase}/agents/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      const result = await response.json();
      
      if (result.success) {
        const idx = this.agents.findIndex(a => a.slug === slug);
        if (idx >= 0) this.agents[idx] = result.data;
        this.notify();
      }
    } catch (error) {
      console.error(`Failed to update agent ${slug}:`, error);
      throw error;
    }
  }

  async delete(apiBase: string, slug: string) {
    try {
      const response = await fetch(`${apiBase}/agents/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      
      if (result.success) {
        this.agents = this.agents.filter(a => a.slug !== slug);
        this.notify();
      }
    } catch (error) {
      console.error(`Failed to delete agent ${slug}:`, error);
      throw error;
    }
  }
}

const agentsStore = new AgentsStore();

type AgentsContextType = {
  fetchAgents: (apiBase: string) => Promise<void>;
  fetchAgent: (apiBase: string, slug: string) => Promise<void>;
  createAgent: (apiBase: string, agent: AgentData) => Promise<void>;
  updateAgent: (apiBase: string, slug: string, agent: Partial<AgentData>) => Promise<void>;
  deleteAgent: (apiBase: string, slug: string) => Promise<void>;
};

const AgentsContext = createContext<AgentsContextType | undefined>(undefined);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const fetchAgents = useCallback((apiBase: string) => {
    return agentsStore.fetchAll(apiBase);
  }, []);

  const fetchAgent = useCallback((apiBase: string, slug: string) => {
    return agentsStore.fetchOne(apiBase, slug);
  }, []);

  const createAgent = useCallback((apiBase: string, agent: AgentData) => {
    return agentsStore.create(apiBase, agent);
  }, []);

  const updateAgent = useCallback((apiBase: string, slug: string, agent: Partial<AgentData>) => {
    return agentsStore.update(apiBase, slug, agent);
  }, []);

  const deleteAgent = useCallback((apiBase: string, slug: string) => {
    return agentsStore.delete(apiBase, slug);
  }, []);

  return (
    <AgentsContext.Provider value={{ 
      fetchAgents, 
      fetchAgent, 
      createAgent, 
      updateAgent, 
      deleteAgent 
    }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents(apiBase: string, shouldFetch: boolean = true): AgentData[] {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error('useAgents must be used within AgentsProvider');
  }

  const { fetchAgents } = context;

  const agents = useSyncExternalStore(
    agentsStore.subscribe,
    agentsStore.getSnapshot,
    agentsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchAgents(apiBase);
    }
  }, [apiBase, shouldFetch, fetchAgents]);

  return agents;
}

export function useAgent(apiBase: string, slug: string, shouldFetch: boolean = true): AgentData | null {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error('useAgent must be used within AgentsProvider');
  }

  const { fetchAgent } = context;

  const agents = useSyncExternalStore(
    agentsStore.subscribe,
    agentsStore.getSnapshot,
    agentsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch && slug) {
      fetchAgent(apiBase, slug);
    }
  }, [apiBase, slug, shouldFetch, fetchAgent]);

  return agents.find(a => a.slug === slug) || null;
}

export function useAgentActions() {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error('useAgentActions must be used within AgentsProvider');
  }
  return {
    createAgent: context.createAgent,
    updateAgent: context.updateAgent,
    deleteAgent: context.deleteAgent,
  };
}
