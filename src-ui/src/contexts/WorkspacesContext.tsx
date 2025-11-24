import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';
import { log } from '@/utils/logger';

type WorkspaceData = {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabs: Array<{
    id: string;
    label: string;
    component: string;
    prompts?: Array<{
      id: string;
      label: string;
      prompt: string;
      agent?: string;
    }>;
  }>;
  globalPrompts?: Array<{
    id: string;
    label: string;
    prompt: string;
    agent?: string;
  }>;
};

class WorkspacesStore {
  private workspaces: WorkspaceData[] = [];
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.workspaces;
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
        const response = await fetch(`${apiBase}/workspaces`);
        const result = await response.json();
        
        if (result.success) {
          this.workspaces = result.data;
          this.notify();
        }
      } catch (error) {
        log.api('Failed to fetch workspaces:', error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async fetchOne(apiBase: string, slug: string) {
    // Always fetch fresh data, don't use cached promise
    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/workspaces/${slug}`);
        const result = await response.json();
        
        if (result.success) {
          const idx = this.workspaces.findIndex(w => w.slug === slug);
          if (idx >= 0) {
            this.workspaces[idx] = result.data;
          } else {
            this.workspaces.push(result.data);
          }
          this.notify();
        }
      } catch (error) {
        log.api(`Failed to fetch workspace ${slug}:`, error);
      }
    })();

    return promise;
  }

  async create(apiBase: string, workspace: WorkspaceData) {
    try {
      const response = await fetch(`${apiBase}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      });
      const result = await response.json();
      
      if (result.success) {
        this.workspaces.push(result.data);
        this.notify();
      }
    } catch (error) {
      log.api('Failed to create workspace:', error);
      throw error;
    }
  }

  async update(apiBase: string, slug: string, workspace: Partial<WorkspaceData>) {
    try {
      const response = await fetch(`${apiBase}/workspaces/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      });
      const result = await response.json();
      
      if (result.success) {
        const idx = this.workspaces.findIndex(w => w.slug === slug);
        if (idx >= 0) this.workspaces[idx] = result.data;
        this.notify();
      }
    } catch (error) {
      log.api(`Failed to update workspace ${slug}:`, error);
      throw error;
    }
  }

  async delete(apiBase: string, slug: string) {
    try {
      const response = await fetch(`${apiBase}/workspaces/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      
      if (result.success) {
        this.workspaces = this.workspaces.filter(w => w.slug !== slug);
        this.notify();
      }
    } catch (error) {
      log.api(`Failed to delete workspace ${slug}:`, error);
      throw error;
    }
  }
}

const workspacesStore = new WorkspacesStore();

type WorkspacesContextType = {
  fetchWorkspaces: (apiBase: string) => Promise<void>;
  fetchWorkspace: (apiBase: string, slug: string) => Promise<void>;
  createWorkspace: (apiBase: string, workspace: WorkspaceData) => Promise<void>;
  updateWorkspace: (apiBase: string, slug: string, workspace: Partial<WorkspaceData>) => Promise<void>;
  deleteWorkspace: (apiBase: string, slug: string) => Promise<void>;
};

const WorkspacesContext = createContext<WorkspacesContextType | undefined>(undefined);

export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const fetchWorkspaces = useCallback((apiBase: string) => {
    return workspacesStore.fetchAll(apiBase);
  }, []);

  const fetchWorkspace = useCallback((apiBase: string, slug: string) => {
    return workspacesStore.fetchOne(apiBase, slug);
  }, []);

  const createWorkspace = useCallback((apiBase: string, workspace: WorkspaceData) => {
    return workspacesStore.create(apiBase, workspace);
  }, []);

  const updateWorkspace = useCallback((apiBase: string, slug: string, workspace: Partial<WorkspaceData>) => {
    return workspacesStore.update(apiBase, slug, workspace);
  }, []);

  const deleteWorkspace = useCallback((apiBase: string, slug: string) => {
    return workspacesStore.delete(apiBase, slug);
  }, []);

  return (
    <WorkspacesContext.Provider value={{ 
      fetchWorkspaces, 
      fetchWorkspace, 
      createWorkspace, 
      updateWorkspace, 
      deleteWorkspace 
    }}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces(apiBase: string, shouldFetch: boolean = true): WorkspaceData[] {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error('useWorkspaces must be used within WorkspacesProvider');
  }

  const { fetchWorkspaces } = context;

  const workspaces = useSyncExternalStore(
    workspacesStore.subscribe,
    workspacesStore.getSnapshot,
    workspacesStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchWorkspaces(apiBase);
    }
  }, [apiBase, shouldFetch, fetchWorkspaces]);

  return workspaces;
}

export function useWorkspace(apiBase: string, slug: string, shouldFetch: boolean = true): WorkspaceData | null {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspacesProvider');
  }

  const { fetchWorkspace } = context;

  const workspaces = useSyncExternalStore(
    workspacesStore.subscribe,
    workspacesStore.getSnapshot,
    workspacesStore.getSnapshot
  );

  useEffect(() => {
    // Always fetch when slug changes to get latest data
    if (shouldFetch && slug) {
      fetchWorkspace(apiBase, slug);
    }
  }, [apiBase, slug, shouldFetch, fetchWorkspace]);

  return workspaces.find(w => w.slug === slug) || null;
}

export function useWorkspaceActions() {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error('useWorkspaceActions must be used within WorkspacesProvider');
  }
  return {
    createWorkspace: context.createWorkspace,
    updateWorkspace: context.updateWorkspace,
    deleteWorkspace: context.deleteWorkspace,
  };
}
