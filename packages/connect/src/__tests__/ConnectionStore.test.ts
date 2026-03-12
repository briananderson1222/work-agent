/**
 * ConnectionStore unit tests — pure Node, no DOM, no React.
 * Uses an in-memory storage adapter to stay deterministic.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConnectionStore } from '../core/ConnectionStore';
import type { StorageAdapter } from '../core/types';

// Minimal in-memory adapter so tests don't touch localStorage
function memoryAdapter(): StorageAdapter {
  const store: Record<string, string> = {};
  return {
    get: (k) => store[k] ?? null,
    set: (k, v) => {
      store[k] = v;
    },
    remove: (k) => {
      delete store[k];
    },
  };
}

function makeStore() {
  return new ConnectionStore({ storage: memoryAdapter() });
}

describe('ConnectionStore — basics', () => {
  it('starts empty', () => {
    expect(makeStore().getAll()).toHaveLength(0);
    expect(makeStore().getActive()).toBeNull();
  });

  it('add() returns the new connection', () => {
    const store = makeStore();
    const conn = store.add('Home', 'http://192.168.1.10:3141');
    expect(conn.name).toBe('Home');
    expect(conn.url).toBe('http://192.168.1.10:3141');
    expect(conn.id).toBeTruthy();
  });

  it('getAll() returns all added connections in insertion order', () => {
    const store = makeStore();
    store.add('A', 'http://a:3141');
    store.add('B', 'http://b:3141');
    store.add('C', 'http://c:3141');
    expect(store.getAll().map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('first added connection becomes active automatically', () => {
    const store = makeStore();
    const conn = store.add('First', 'http://first:3141');
    expect(store.getActive()?.id).toBe(conn.id);
  });

  it('remove() deletes a connection', () => {
    const store = makeStore();
    const a = store.add('A', 'http://a:3141');
    const b = store.add('B', 'http://b:3141');
    store.remove(a.id);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe(b.id);
  });

  it('remove() of active connection falls back to next one', () => {
    const store = makeStore();
    const a = store.add('A', 'http://a:3141');
    store.add('B', 'http://b:3141');
    store.setActive(a.id);
    store.remove(a.id);
    expect(store.getActive()?.name).toBe('B');
  });

  it('remove() last connection leaves getActive() null', () => {
    const store = makeStore();
    const a = store.add('A', 'http://a:3141');
    store.remove(a.id);
    expect(store.getActive()).toBeNull();
  });

  it('update() changes name and url', () => {
    const store = makeStore();
    const conn = store.add('Old', 'http://old:3141');
    store.update(conn.id, { name: 'New', url: 'http://new:3141' });
    const updated = store.getAll().find((c) => c.id === conn.id)!;
    expect(updated.name).toBe('New');
    expect(updated.url).toBe('http://new:3141');
  });

  it('setActive() activates a specific connection', () => {
    const store = makeStore();
    const a = store.add('A', 'http://a:3141');
    const b = store.add('B', 'http://b:3141');
    store.setActive(b.id);
    expect(store.getActive()?.id).toBe(b.id);
    // a should not be active
    expect(store.getActive()?.id).not.toBe(a.id);
  });

  it('setActive() stamps lastConnected', () => {
    const store = makeStore();
    const a = store.add('A', 'http://a:3141');
    expect(store.getActive()?.lastConnected).toBeUndefined();
    store.setActive(a.id);
    expect(store.getActive()?.lastConnected).toBeGreaterThan(0);
  });
});

describe('ConnectionStore — duplicate URL deduplication', () => {
  it('add() with the same URL returns existing connection without duplicating', () => {
    const store = makeStore();
    const first = store.add('Home', 'http://same:3141');
    const second = store.add('Different Name', 'http://same:3141');
    expect(store.getAll()).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });
});

describe('ConnectionStore — subscriptions', () => {
  it('subscribe() fires on add', () => {
    const store = makeStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.add('A', 'http://a:3141');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('subscribe() fires on remove', () => {
    const store = makeStore();
    const conn = store.add('A', 'http://a:3141');
    const fn = vi.fn();
    store.subscribe(fn);
    store.remove(conn.id);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const store = makeStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.add('A', 'http://a:3141');
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple subscribers all receive notifications', () => {
    const store = makeStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    store.subscribe(fn1);
    store.subscribe(fn2);
    store.add('A', 'http://a:3141');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionStore — migrate()', () => {
  it('imports a legacy single-URL and removes the old key', () => {
    const adapter = memoryAdapter();
    adapter.set('old-api-base', 'http://legacy:3141');

    const store = new ConnectionStore({ storage: adapter });
    store.migrate('old-api-base');

    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].url).toBe('http://legacy:3141');
    expect(adapter.get('old-api-base')).toBeNull();
  });

  it('migrate() is idempotent — does not duplicate if URL already exists', () => {
    const adapter = memoryAdapter();
    adapter.set('old-api-base', 'http://legacy:3141');

    const store = new ConnectionStore({ storage: adapter });
    store.add('Legacy', 'http://legacy:3141'); // pre-existing
    store.migrate('old-api-base');

    expect(store.getAll()).toHaveLength(1);
  });

  it('migrate() is a no-op when legacy key is absent', () => {
    const store = makeStore();
    store.migrate('nonexistent-key');
    expect(store.getAll()).toHaveLength(0);
  });
});

describe('ConnectionStore — persistence', () => {
  it('survives a store re-instantiation with the same storage', () => {
    const adapter = memoryAdapter();

    const store1 = new ConnectionStore({ storage: adapter });
    const conn = store1.add('Persisted', 'http://persisted:3141');
    store1.setActive(conn.id);

    // Simulate page reload — new store instance, same storage
    const store2 = new ConnectionStore({ storage: adapter });
    expect(store2.getAll()).toHaveLength(1);
    expect(store2.getActive()?.url).toBe('http://persisted:3141');
  });
});
