/**
 * React integration tests for ConnectionsProvider / useConnections.
 * Uses jsdom + @testing-library/react so no browser needed.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionStore } from '../core/ConnectionStore';
import { ConnectionsProvider, useConnections } from '../react/ConnectionsContext';
import type { StorageAdapter } from '../core/types';

function memoryAdapter(): StorageAdapter {
  const s: Record<string, string> = {};
  return {
    get: (k) => s[k] ?? null,
    set: (k, v) => { s[k] = v; },
    remove: (k) => { delete s[k]; },
  };
}

function makeStore(_defaultUrl = 'http://localhost:3141') {
  return new ConnectionStore({ storage: memoryAdapter() });
}

function wrapper(store: ConnectionStore) {
  return ({ children }: { children: React.ReactNode }) => (
    <ConnectionsProvider store={store} defaultUrl="http://localhost:3141">
      {children}
    </ConnectionsProvider>
  );
}

describe('useConnections', () => {
  it('starts with empty connections when store is empty', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });
    expect(result.current.connections).toHaveLength(0);
    expect(result.current.activeConnection).toBeNull();
    expect(result.current.apiBase).toBe('http://localhost:3141');
  });

  it('addConnection() appears in connections and activates it', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current.addConnection('Home', 'http://192.168.1.10:3141');
    });

    expect(result.current.connections).toHaveLength(1);
    expect(result.current.activeConnection?.url).toBe('http://192.168.1.10:3141');
    expect(result.current.apiBase).toBe('http://192.168.1.10:3141');
  });

  it('removeConnection() removes from list', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current.addConnection('A', 'http://a:3141');
      result.current.addConnection('B', 'http://b:3141');
    });

    const idToRemove = result.current.connections[0].id;
    act(() => {
      result.current.removeConnection(idToRemove);
    });

    expect(result.current.connections).toHaveLength(1);
    expect(result.current.connections[0].name).toBe('B');
  });

  it('setActiveConnection() switches apiBase', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    let idB: string;
    act(() => {
      result.current.addConnection('A', 'http://a:3141');
      idB = result.current.addConnection('B', 'http://b:3141').id;
    });

    act(() => {
      result.current.setActiveConnection(idB!);
    });

    expect(result.current.apiBase).toBe('http://b:3141');
    expect(result.current.isCustom).toBe(true);
  });

  it('setApiBase() upserts by URL', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current.setApiBase('http://new-server:3141');
    });

    expect(result.current.connections).toHaveLength(1);
    expect(result.current.apiBase).toBe('http://new-server:3141');

    // Calling again with the same URL should not create a duplicate
    act(() => {
      result.current.setApiBase('http://new-server:3141');
    });
    expect(result.current.connections).toHaveLength(1);
  });

  it('resetToDefault() switches back to defaultUrl', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current.addConnection('Custom', 'http://custom:3141');
    });
    act(() => {
      result.current.resetToDefault();
    });

    expect(result.current.apiBase).toBe('http://localhost:3141');
    expect(result.current.isCustom).toBe(false);
  });

  it('updateConnection() reflects new name in connections list', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current.addConnection('Old Name', 'http://a:3141');
    });

    const id = result.current.connections[0].id;
    act(() => {
      result.current.updateConnection(id, { name: 'New Name' });
    });

    expect(result.current.connections[0].name).toBe('New Name');
  });
});

describe('useConnections — isCustom', () => {
  it('isCustom is false when using default URL', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });
    act(() => { result.current.addConnection('Default', 'http://localhost:3141'); });
    expect(result.current.isCustom).toBe(false);
  });

  it('isCustom is true when using a different URL', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: wrapper(store),
    });
    act(() => { result.current.addConnection('Remote', 'http://192.168.1.5:3141'); });
    expect(result.current.isCustom).toBe(true);
  });
});
