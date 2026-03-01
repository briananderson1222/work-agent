import { defaultStorage } from './storage';
import type { SavedConnection, StorageAdapter } from './types';

const DEFAULT_KEY = 'stallion-connect-connections';
const ACTIVE_KEY_SUFFIX = '-active';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class ConnectionStore {
  private storage: StorageAdapter;
  private storageKey: string;
  private activeKey: string;
  private listeners: Set<() => void> = new Set();

  // Stable snapshot cache — useSyncExternalStore requires referential stability
  private _cachedAll: SavedConnection[] | null = null;
  private _cachedActive: SavedConnection | null = null;
  private _cacheValid = false;

  constructor(opts: { storage?: StorageAdapter; storageKey?: string } = {}) {
    this.storage = opts.storage ?? defaultStorage;
    this.storageKey = opts.storageKey ?? DEFAULT_KEY;
    this.activeKey = this.storageKey + ACTIVE_KEY_SUFFIX;
  }

  private read(): { connections: SavedConnection[]; activeId: string | null } {
    try {
      const raw = this.storage.get(this.storageKey);
      const connections: SavedConnection[] = raw ? JSON.parse(raw) : [];
      const activeId = this.storage.get(this.activeKey);
      return { connections, activeId };
    } catch {
      return { connections: [], activeId: null };
    }
  }

  private invalidateCache(): void {
    this._cacheValid = false;
    this._cachedAll = null;
    this._cachedActive = null;
  }

  private ensureCache(): void {
    if (this._cacheValid && this._cachedAll !== null) return;
    const { connections, activeId } = this.read();
    this._cachedAll = connections;
    this._cachedActive =
      (activeId
        ? connections.find((c) => c.id === activeId) ?? connections[0]
        : connections[0]) ?? null;
    this._cacheValid = true;
  }

  private write(connections: SavedConnection[], activeId: string | null): void {
    this.storage.set(this.storageKey, JSON.stringify(connections));
    if (activeId) {
      this.storage.set(this.activeKey, activeId);
    } else {
      this.storage.remove(this.activeKey);
    }
    this.invalidateCache();
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getAll(): SavedConnection[] {
    this.ensureCache();
    return this._cachedAll!;
  }

  getActive(): SavedConnection | null {
    this.ensureCache();
    return this._cachedActive;
  }

  add(name: string, url: string): SavedConnection {
    const { connections, activeId } = this.read();
    // Avoid duplicate URLs
    const existing = connections.find((c) => c.url === url);
    if (existing) {
      // Just activate it
      this.write(connections, existing.id);
      return existing;
    }
    const conn: SavedConnection = { id: uuid(), name: name || url, url };
    const updated = [...connections, conn];
    this.write(updated, activeId ?? conn.id);
    return conn;
  }

  remove(id: string): void {
    const { connections, activeId } = this.read();
    const updated = connections.filter((c) => c.id !== id);
    const newActive =
      activeId === id ? (updated[0]?.id ?? null) : activeId;
    this.write(updated, newActive);
  }

  update(
    id: string,
    changes: Partial<Pick<SavedConnection, 'name' | 'url'>>,
  ): void {
    const { connections, activeId } = this.read();
    const updated = connections.map((c) =>
      c.id === id ? { ...c, ...changes } : c,
    );
    this.write(updated, activeId);
  }

  setActive(id: string): void {
    const { connections } = this.read();
    const found = connections.find((c) => c.id === id);
    if (!found) return;
    const updated = connections.map((c) =>
      c.id === id ? { ...c, lastConnected: Date.now() } : c,
    );
    this.write(updated, id);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Imports a URL stored under a legacy single-URL key into this store.
   * Call once on startup to migrate old users.
   */
  migrate(legacyKey: string): void {
    const legacyUrl = this.storage.get(legacyKey);
    if (!legacyUrl) return;
    const { connections } = this.read();
    const alreadyExists = connections.some((c) => c.url === legacyUrl);
    if (!alreadyExists) {
      this.add('Default', legacyUrl);
    }
    this.storage.remove(legacyKey);
  }
}
