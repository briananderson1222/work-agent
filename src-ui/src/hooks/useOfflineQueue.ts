/**
 * useOfflineQueue — IndexedDB-backed message queue for offline resilience.
 *
 * When the feature is enabled and the server is unreachable, outgoing messages
 * can be saved to IndexedDB instead of dropped. The queue flushes automatically
 * when `online` is true (passed by the caller, typically from useConnectionStatus).
 *
 * Each pending item stores the session/agent context needed to replay the message
 * when connectivity returns.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueuedCommand {
  id: string;
  timestamp: number;
  agentSlug: string;
  sessionId: string | null;
  text: string;
}

const DB_NAME = 'stallion-offline';
const STORE = 'queue';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(db: IDBDatabase): Promise<QueuedCommand[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedCommand[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(db: IDBDatabase, item: QueuedCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

interface UseOfflineQueueOptions {
  enabled: boolean;
  /** When true the caller has confirmed server connectivity; queue flushes. */
  online: boolean;
  /** Called for each item when flushing — should send the message to the server. */
  onFlush: (item: QueuedCommand) => Promise<void>;
}

export interface UseOfflineQueueResult {
  pending: QueuedCommand[];
  /** Enqueue a message to be sent when connectivity returns. */
  enqueue: (cmd: Omit<QueuedCommand, 'id' | 'timestamp'>) => Promise<void>;
  /** Remove an item from the queue without sending it. */
  discard: (id: string) => Promise<void>;
  /** Manually trigger a flush attempt. */
  flush: () => Promise<void>;
}

export function useOfflineQueue({
  enabled,
  online,
  onFlush,
}: UseOfflineQueueOptions): UseOfflineQueueResult {
  const [pending, setPending] = useState<QueuedCommand[]>([]);
  const dbRef = useRef<IDBDatabase | null>(null);
  const flushingRef = useRef(false);

  // Open DB and load existing queue on mount
  useEffect(() => {
    if (!enabled) return;
    openDB()
      .then((db) => {
        dbRef.current = db;
        return dbGetAll(db);
      })
      .then(setPending)
      .catch(() => {/* IndexedDB may be unavailable (private mode) */});

    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [enabled]);

  const enqueue = useCallback(
    async (cmd: Omit<QueuedCommand, 'id' | 'timestamp'>) => {
      if (!enabled || !dbRef.current) return;
      const item: QueuedCommand = {
        ...cmd,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      await dbPut(dbRef.current, item);
      setPending((prev) => [...prev, item]);
    },
    [enabled],
  );

  const discard = useCallback(async (id: string) => {
    if (!dbRef.current) return;
    await dbDelete(dbRef.current, id);
    setPending((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !dbRef.current || pending.length === 0) return;
    flushingRef.current = true;
    try {
      for (const item of [...pending]) {
        try {
          await onFlush(item);
          await dbDelete(dbRef.current!, item.id);
          setPending((prev) => prev.filter((i) => i.id !== item.id));
        } catch {
          // Stop flushing on first failure (server still down)
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [pending, onFlush]);

  // Auto-flush when we come back online
  useEffect(() => {
    if (enabled && online && pending.length > 0) {
      flush();
    }
  }, [enabled, online, flush, pending.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pending, enqueue, discard, flush };
}
