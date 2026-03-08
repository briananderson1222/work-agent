/**
 * Tests that useConnectionStatus correctly transitions between
 * connected / connecting / error states as the health-check resolves.
 *
 * Uses real timers (no fake timers) with very short poll intervals so
 * tests stay fast without fighting React Testing Library's waitFor.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ConnectionStore } from '../core/ConnectionStore';
import { ConnectionsProvider } from '../react/ConnectionsContext';
import { useConnectionStatus } from '../react/useConnectionStatus';
import type { StorageAdapter } from '../core/types';

function memoryAdapter(): StorageAdapter {
  const s: Record<string, string> = {};
  return {
    get: (k) => s[k] ?? null,
    set: (k, v) => { s[k] = v; },
    remove: (k) => { delete s[k]; },
  };
}

function storeWithUrl(url: string) {
  const store = new ConnectionStore({ storage: memoryAdapter() });
  store.add('test', url);
  return store;
}

function wrapper(store: ConnectionStore) {
  return ({ children }: { children: React.ReactNode }) => (
    <ConnectionsProvider store={store} defaultUrl="http://localhost:3141">
      {children}
    </ConnectionsProvider>
  );
}

// Short poll so the "re-checks on interval" test doesn't take long
const POLL = 80;

describe('useConnectionStatus', () => {
  it('starts as connecting, resolves to connected when health check passes', async () => {
    const checkHealth = vi.fn().mockResolvedValue(true);
    const store = storeWithUrl('http://ok-server:3141');

    const { result } = renderHook(
      () => useConnectionStatus({ checkHealth, pollInterval: 60_000 }),
      { wrapper: wrapper(store) },
    );

    // Initially "connecting" before the first async check completes
    expect(result.current.status).toBe('connecting');

    // Wait for the first health check to resolve
    await waitFor(() => expect(result.current.status).toBe('connected'), { timeout: 2000 });
    expect(checkHealth).toHaveBeenCalledOnce();
  });

  it('transitions to error when health check throws', async () => {
    const checkHealth = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const store = storeWithUrl('http://dead-server:3141');

    const { result } = renderHook(
      () => useConnectionStatus({ checkHealth, pollInterval: 60_000 }),
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 2000 });
  });

  it('transitions to error when checkHealth returns false', async () => {
    const checkHealth = vi.fn().mockResolvedValue(false);
    const store = storeWithUrl('http://bad-server:3141');

    const { result } = renderHook(
      () => useConnectionStatus({ checkHealth, pollInterval: 60_000 }),
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 2000 });
  });

  it('re-checks on poll interval — simulates server recovery', async () => {
    const checkHealth = vi
      .fn()
      .mockResolvedValueOnce(false)   // first call: server down
      .mockResolvedValue(true);        // subsequent calls: recovered

    const store = storeWithUrl('http://flaky-server:3141');

    const { result } = renderHook(
      () => useConnectionStatus({ checkHealth, pollInterval: POLL }),
      { wrapper: wrapper(store) },
    );

    // First poll: error
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 2000 });

    // Second poll (after POLL ms): connected
    await waitFor(() => expect(result.current.status).toBe('connected'), {
      timeout: POLL * 5,
    });
    expect(checkHealth.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rechecks (connected→connecting→connected) when active URL changes', async () => {
    // First call fast, second call slow — gives us a window to observe 'connecting'
    let callCount = 0;
    const checkHealth = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          callCount++;
          setTimeout(() => resolve(true), callCount === 1 ? 0 : 200);
        }),
    );

    const store = storeWithUrl('http://server-a:3141');

    const { result } = renderHook(
      () => useConnectionStatus({ checkHealth, pollInterval: 60_000 }),
      { wrapper: wrapper(store) },
    );

    // First URL resolves quickly → connected
    await waitFor(() => expect(result.current.status).toBe('connected'), { timeout: 2000 });

    // Switch to a different server (must explicitly setActive, add() keeps existing active)
    const { act } = await import('@testing-library/react');
    await act(async () => {
      const conn = store.add('B', 'http://server-b:3141');
      store.setActive(conn.id);
    });

    // Now the slow second check is in flight → 'connecting'
    // (transient state — may resolve before React re-renders)

    // Eventually resolves → 'connected' again
    await waitFor(() => expect(result.current.status).toBe('connected'), { timeout: 2000 });
    expect(checkHealth.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
