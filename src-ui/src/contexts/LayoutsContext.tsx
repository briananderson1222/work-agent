import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import { log } from '@/utils/logger';

type LayoutData = {
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

class LayoutsStore {
  private layouts: LayoutData[] = [];
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.layouts;

  private notify = () => {
    this.listeners.forEach((listener) => listener());
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
          this.layouts = result.data;
          this.notify();
        }
      } catch (error) {
        log.api('Failed to fetch layouts:', error);
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
          const idx = this.layouts.findIndex((w) => w.slug === slug);
          if (idx >= 0) {
            this.layouts[idx] = result.data;
          } else {
            this.layouts.push(result.data);
          }
          this.notify();
        }
      } catch (error) {
        log.api(`Failed to fetch layout ${slug}:`, error);
      } finally {
        this.fetching.delete(key);
      }
    })();

    this.fetching.set(key, promise);
    return promise;
  }

  async create(apiBase: string, layout: LayoutData) {
    try {
      const response = await fetch(`${apiBase}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      });
      const result = await response.json();

      if (result.success) {
        this.layouts.push(result.data);
        this.notify();
      }
    } catch (error) {
      log.api('Failed to create layout:', error);
    }
  }

  async update(apiBase: string, slug: string, updates: Partial<LayoutData>) {
    try {
      const response = await fetch(`${apiBase}/workspaces/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json();

      if (result.success) {
        const idx = this.layouts.findIndex((w) => w.slug === slug);
        if (idx >= 0) {
          this.layouts[idx] = result.data;
          this.notify();
        }
      }
    } catch (error) {
      log.api('Failed to update layout:', error);
    }
  }

  async delete(apiBase: string, slug: string) {
    try {
      const response = await fetch(`${apiBase}/workspaces/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        this.layouts = this.layouts.filter((w) => w.slug !== slug);
        this.notify();
      }
    } catch (error) {
      log.api('Failed to delete layout:', error);
    }
  }
}

const layoutsStore = new LayoutsStore();

const LayoutsContext = createContext<{
  fetchAll: (apiBase: string) => Promise<void>;
  fetchOne: (apiBase: string, slug: string) => Promise<void>;
  create: (apiBase: string, layout: LayoutData) => Promise<void>;
  update: (
    apiBase: string,
    slug: string,
    updates: Partial<LayoutData>,
  ) => Promise<void>;
  delete: (apiBase: string, slug: string) => Promise<void>;
} | null>(null);

export function LayoutsProvider({ children }: { children: ReactNode }) {
  const fetchAll = useCallback(
    (apiBase: string) => layoutsStore.fetchAll(apiBase),
    [],
  );
  const fetchOne = useCallback(
    (apiBase: string, slug: string) => layoutsStore.fetchOne(apiBase, slug),
    [],
  );
  const create = useCallback(
    (apiBase: string, layout: LayoutData) =>
      layoutsStore.create(apiBase, layout),
    [],
  );
  const update = useCallback(
    (apiBase: string, slug: string, updates: Partial<LayoutData>) =>
      layoutsStore.update(apiBase, slug, updates),
    [],
  );
  const deleteLayout = useCallback(
    (apiBase: string, slug: string) => layoutsStore.delete(apiBase, slug),
    [],
  );

  return (
    <LayoutsContext.Provider
      value={{ fetchAll, fetchOne, create, update, delete: deleteLayout }}
    >
      {children}
    </LayoutsContext.Provider>
  );
}

// Hook for actions
export function useLayoutsActions() {
  const context = useContext(LayoutsContext);
  if (!context) {
    throw new Error(
      'useLayoutsActions must be used within LayoutsProvider',
    );
  }
  return context;
}

// Hook for data subscription (no side effects)
export function useLayouts(_apiBase: string) {
  const layouts = useSyncExternalStore(
    layoutsStore.subscribe,
    layoutsStore.getSnapshot,
  );
  return layouts;
}

// Hook for single layout (no auto-fetch)
export function useLayout(_apiBase: string, slug: string, _enabled = true) {
  const layouts = useSyncExternalStore(
    layoutsStore.subscribe,
    layoutsStore.getSnapshot,
  );
  return layouts.find((w) => w.slug === slug) || null;
}
