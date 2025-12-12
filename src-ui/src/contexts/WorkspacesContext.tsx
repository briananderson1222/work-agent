import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore } from 'react';
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

  getSnapshot = () => this.workspaces;

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
    const key = `one:${slug}`;
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }

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
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
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
    }
  }

  async update(apiBase: string, slug: string, updates: Partial<WorkspaceData>) {
    try {
      const response = await fetch(`${apiBase}/workspaces/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json();
      
      if (result.success) {
        const idx = this.workspaces.findIndex(w => w.slug === slug);
        if (idx >= 0) {
          this.workspaces[idx] = result.data;
          this.notify();
        }
      }
    } catch (error) {
      log.api('Failed to update workspace:', error);
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
      log.api('Failed to delete workspace:', error);
    }
  }
}

const workspacesStore = new WorkspacesStore();

const WorkspacesContext = createContext<{
  fetchAll: (apiBase: string) => Promise<void>;
  fetchOne: (apiBase: string, slug: string) => Promise<void>;
  create: (apiBase: string, workspace: WorkspaceData) => Promise<void>;
  update: (apiBase: string, slug: string, updates: Partial<WorkspaceData>) => Promise<void>;
  delete: (apiBase: string, slug: string) => Promise<void>;
} | null>(null);

export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const fetchAll = useCallback((apiBase: string) => workspacesStore.fetchAll(apiBase), []);
  const fetchOne = useCallback((apiBase: string, slug: string) => workspacesStore.fetchOne(apiBase, slug), []);
  const create = useCallback((apiBase: string, workspace: WorkspaceData) => workspacesStore.create(apiBase, workspace), []);
  const update = useCallback((apiBase: string, slug: string, updates: Partial<WorkspaceData>) => workspacesStore.update(apiBase, slug, updates), []);
  const deleteWorkspace = useCallback((apiBase: string, slug: string) => workspacesStore.delete(apiBase, slug), []);

  return (
    <WorkspacesContext.Provider value={{ fetchAll, fetchOne, create, update, delete: deleteWorkspace }}>
      {children}
    </WorkspacesContext.Provider>
  );
}

// Hook for actions
export function useWorkspacesActions() {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error('useWorkspacesActions must be used within WorkspacesProvider');
  }
  return context;
}

// Hook for data subscription (no side effects)
export function useWorkspaces(apiBase: string) {
  const workspaces = useSyncExternalStore(
    workspacesStore.subscribe,
    workspacesStore.getSnapshot
  );
  return workspaces;
}

// Hook for single workspace (no auto-fetch)
export function useWorkspace(apiBase: string, slug: string, enabled = true) {
  const workspaces = useSyncExternalStore(
    workspacesStore.subscribe,
    workspacesStore.getSnapshot
  );
  return workspaces.find(w => w.slug === slug) || null;
}
