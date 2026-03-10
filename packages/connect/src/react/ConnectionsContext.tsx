import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { ConnectionStore } from '../core/ConnectionStore';
import { defaultStorage } from '../core/storage';
import type { SavedConnection } from '../core/types';

const FALLBACK_URL = 'http://localhost:3141';
const LEGACY_KEY = 'project-stallion-api-base';

interface ConnectionsContextType {
  connections: SavedConnection[];
  activeConnection: SavedConnection | null;
  /** Active URL — backward-compat alias for activeConnection.url */
  apiBase: string;
  addConnection: (name: string, url: string) => SavedConnection;
  removeConnection: (id: string) => void;
  updateConnection: (
    id: string,
    changes: Partial<Pick<SavedConnection, 'name' | 'url'>>,
  ) => void;
  setActiveConnection: (id: string) => void;
  /** Convenience: upsert a connection by URL and activate it */
  setApiBase: (url: string) => void;
  resetToDefault: () => void;
  isCustom: boolean;
}

const ConnectionsContext = createContext<ConnectionsContextType | undefined>(
  undefined,
);

function makeDefaultStore(defaultUrl: string): ConnectionStore {
  const store = new ConnectionStore({
    storage: defaultStorage,
    storageKey: 'stallion-connect-connections',
  });

  // Migrate legacy single-URL key
  store.migrate(LEGACY_KEY);

  // Ensure there is always at least one (default) connection
  if (store.getAll().length === 0) {
    store.add('Default', defaultUrl);
  } else {
    // Sync the "Default" connection URL when the server port changes at runtime
    const def = store.getAll().find((c) => c.name === 'Default');
    if (def && def.url !== defaultUrl) {
      store.update(def.id, { url: defaultUrl });
    }
  }

  return store;
}

// Module-level singleton; created lazily so that the consuming app can pass
// defaultUrl via the provider before any store reads happen.
let _sharedStore: ConnectionStore | null = null;

export function ConnectionsProvider({
  children,
  store,
  defaultUrl = FALLBACK_URL,
}: {
  children: React.ReactNode;
  store?: ConnectionStore;
  /** Default URL for the initial connection when no persisted data exists */
  defaultUrl?: string;
}) {
  if (!store) {
    if (!_sharedStore) {
      _sharedStore = makeDefaultStore(defaultUrl);
    }
    store = _sharedStore;
  }

  const resolvedStore = store;

  const getAll = useCallback(() => resolvedStore.getAll(), [resolvedStore]);
  const getActive = useCallback(() => resolvedStore.getActive(), [resolvedStore]);
  const subscribe = useCallback((cb: () => void) => resolvedStore.subscribe(cb), [resolvedStore]);

  const connections = useSyncExternalStore(subscribe, getAll);
  const activeConnection = useSyncExternalStore(subscribe, getActive);

  const value = useMemo<ConnectionsContextType>(
    () => ({
      connections,
      activeConnection,
      apiBase: activeConnection?.url ?? defaultUrl,
      addConnection: (name, url) => resolvedStore.add(name, url),
      removeConnection: (id) => resolvedStore.remove(id),
      updateConnection: (id, changes) => resolvedStore.update(id, changes),
      setActiveConnection: (id) => resolvedStore.setActive(id),
      setApiBase: (url) => {
        const existing = resolvedStore.getAll().find((c) => c.url === url);
        if (existing) {
          resolvedStore.setActive(existing.id);
        } else {
          resolvedStore.add('', url);
        }
      },
      resetToDefault: () => {
        const existing = resolvedStore
          .getAll()
          .find((c) => c.url === defaultUrl);
        if (existing) {
          resolvedStore.setActive(existing.id);
        } else {
          const conn = resolvedStore.add('Default', defaultUrl);
          resolvedStore.setActive(conn.id);
        }
      },
      isCustom: (activeConnection?.url ?? defaultUrl) !== defaultUrl,
    }),
    [connections, activeConnection, resolvedStore, defaultUrl],
  );

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
}

export function useConnections(): ConnectionsContextType {
  const ctx = useContext(ConnectionsContext);
  if (!ctx) {
    throw new Error('useConnections must be used within a ConnectionsProvider');
  }
  return ctx;
}
