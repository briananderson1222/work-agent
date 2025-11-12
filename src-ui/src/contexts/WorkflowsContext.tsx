import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';

type WorkflowMetadata = {
  id: string;
  name: string;
  description?: string;
  agentSlug: string;
};

type WorkflowCatalog = Record<string, WorkflowMetadata[]>;

class WorkflowsStore {
  private workflows: WorkflowCatalog = {};
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.workflows;
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
        const response = await fetch(`${apiBase}/workflows`);
        const result = await response.json();
        
        if (result.success) {
          this.workflows = result.data;
          this.notify();
        }
      } catch (error) {
        console.error('Failed to fetch workflows:', error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async fetchForAgent(apiBase: string, agentSlug: string) {
    if (this.fetching.has(agentSlug)) {
      return this.fetching.get(agentSlug);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/workflows/files`);
        const result = await response.json();
        
        if (result.success) {
          this.workflows[agentSlug] = result.data.map((w: any) => ({
            ...w,
            agentSlug,
          }));
          this.notify();
        }
      } catch (error) {
        console.error(`Failed to fetch workflows for agent ${agentSlug}:`, error);
      } finally {
        this.fetching.delete(agentSlug);
      }
    })();

    this.fetching.set(agentSlug, promise);
    return promise;
  }
}

const workflowsStore = new WorkflowsStore();

type WorkflowsContextType = {
  fetchWorkflows: (apiBase: string) => Promise<void>;
  fetchAgentWorkflows: (apiBase: string, agentSlug: string) => Promise<void>;
};

const WorkflowsContext = createContext<WorkflowsContextType | undefined>(undefined);

export function WorkflowsProvider({ children }: { children: ReactNode }) {
  const fetchWorkflows = useCallback((apiBase: string) => {
    return workflowsStore.fetchAll(apiBase);
  }, []);

  const fetchAgentWorkflows = useCallback((apiBase: string, agentSlug: string) => {
    return workflowsStore.fetchForAgent(apiBase, agentSlug);
  }, []);

  return (
    <WorkflowsContext.Provider value={{ fetchWorkflows, fetchAgentWorkflows }}>
      {children}
    </WorkflowsContext.Provider>
  );
}

export function useWorkflows(apiBase: string, shouldFetch: boolean = true): WorkflowCatalog {
  const context = useContext(WorkflowsContext);
  if (!context) {
    throw new Error('useWorkflows must be used within WorkflowsProvider');
  }

  const { fetchWorkflows } = context;

  const workflows = useSyncExternalStore(
    workflowsStore.subscribe,
    workflowsStore.getSnapshot,
    workflowsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchWorkflows(apiBase);
    }
  }, [apiBase, shouldFetch, fetchWorkflows]);

  return workflows;
}

export function useAgentWorkflows(apiBase: string, agentSlug: string, shouldFetch: boolean = true): WorkflowMetadata[] {
  const context = useContext(WorkflowsContext);
  if (!context) {
    throw new Error('useAgentWorkflows must be used within WorkflowsProvider');
  }

  const { fetchAgentWorkflows } = context;

  const workflows = useSyncExternalStore(
    workflowsStore.subscribe,
    workflowsStore.getSnapshot,
    workflowsStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch && agentSlug) {
      fetchAgentWorkflows(apiBase, agentSlug);
    }
  }, [apiBase, agentSlug, shouldFetch, fetchAgentWorkflows]);

  return workflows[agentSlug] || [];
}
