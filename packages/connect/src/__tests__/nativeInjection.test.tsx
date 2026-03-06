/**
 * Tests for native scan / discover injection through ConnectionsProvider.
 * Verifies that nativeScan and nativeDiscover props are forwarded via context
 * and consumed correctly by QRScanner and useNetworkDiscovery.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderHook,
  act,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ConnectionStore } from '../core/ConnectionStore';
import {
  ConnectionsProvider,
  useConnections,
} from '../react/ConnectionsContext';
import { useNetworkDiscovery } from '../react/useNetworkDiscovery';
import type {
  StorageAdapter,
  NativeScanFn,
  NativeDiscoverFn,
} from '../core/types';

function memoryAdapter(): StorageAdapter {
  const s: Record<string, string> = {};
  return {
    get: (k) => s[k] ?? null,
    set: (k, v) => {
      s[k] = v;
    },
    remove: (k) => {
      delete s[k];
    },
  };
}

function makeStore() {
  return new ConnectionStore({ storage: memoryAdapter() });
}

// ─── ConnectionsContext — native prop forwarding ──────────────────────────────

describe('ConnectionsProvider — nativeScan / nativeDiscover forwarding', () => {
  it('exposes nativeScan undefined by default', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store}>{children}</ConnectionsProvider>
      ),
    });
    expect(result.current.nativeScan).toBeUndefined();
  });

  it('exposes nativeDiscover undefined by default', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store}>{children}</ConnectionsProvider>
      ),
    });
    expect(result.current.nativeDiscover).toBeUndefined();
  });

  it('mdnsEnabled defaults to true', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store}>{children}</ConnectionsProvider>
      ),
    });
    expect(result.current.mdnsEnabled).toBe(true);
  });

  it('forwards injected nativeScan to context consumers', () => {
    const nativeScan: NativeScanFn = vi
      .fn()
      .mockResolvedValue('http://server:3141');
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store} nativeScan={nativeScan}>
          {children}
        </ConnectionsProvider>
      ),
    });
    expect(result.current.nativeScan).toBe(nativeScan);
  });

  it('forwards injected nativeDiscover to context consumers', () => {
    const nativeDiscover: NativeDiscoverFn = vi.fn().mockResolvedValue([]);
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store} nativeDiscover={nativeDiscover}>
          {children}
        </ConnectionsProvider>
      ),
    });
    expect(result.current.nativeDiscover).toBe(nativeDiscover);
  });

  it('forwards mdnsEnabled=false to context', () => {
    const store = makeStore();
    const { result } = renderHook(() => useConnections(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider store={store} mdnsEnabled={false}>
          {children}
        </ConnectionsProvider>
      ),
    });
    expect(result.current.mdnsEnabled).toBe(false);
  });
});

// ─── useNetworkDiscovery — nativeDiscover integration ─────────────────────────

describe('useNetworkDiscovery — nativeDiscover option', () => {
  it('calls nativeDiscover when provided and includes results', async () => {
    const nativeDiscover: NativeDiscoverFn = vi
      .fn()
      .mockResolvedValue([
        { url: 'http://192.168.1.5:3141', name: 'Office Server', latency: 0 },
      ]);

    const { result } = renderHook(() =>
      useNetworkDiscovery({ nativeDiscover, nativeOnly: true }),
    );

    act(() => {
      result.current.scan();
    });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(nativeDiscover).toHaveBeenCalledOnce();
    expect(result.current.discovered).toHaveLength(1);
    expect(result.current.discovered[0].url).toBe('http://192.168.1.5:3141');
    expect(result.current.discovered[0].name).toBe('Office Server');
  });

  it('returns empty list when nativeDiscover resolves to []', async () => {
    const nativeDiscover: NativeDiscoverFn = vi.fn().mockResolvedValue([]);

    const { result } = renderHook(() =>
      useNetworkDiscovery({ nativeDiscover, nativeOnly: true }),
    );

    act(() => {
      result.current.scan();
    });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.discovered).toHaveLength(0);
  });

  it('falls back gracefully when nativeDiscover rejects', async () => {
    const nativeDiscover: NativeDiscoverFn = vi
      .fn()
      .mockRejectedValue(new Error('NSD failed'));

    const { result } = renderHook(() =>
      useNetworkDiscovery({ nativeDiscover, nativeOnly: true }),
    );

    act(() => {
      result.current.scan();
    });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.discovered).toHaveLength(0);
  });

  it('merges native results with subnet scan when nativeOnly is false', async () => {
    // Patch RTCPeerConnection so subnet detection resolves immediately with no subnets.
    // detectSubnets falls back to ['192.168.1.'], so stub fetch to reject immediately
    // so probe batches complete instantly without network delays.
    const nativeDiscover: NativeDiscoverFn = vi
      .fn()
      .mockResolvedValue([
        { url: 'http://10.0.0.5:3141', name: 'mdns-server', latency: 0 },
      ]);

    // Stub RTCPeerConnection to resolve instantly with no candidates
    const origRTC = (globalThis as any).RTCPeerConnection;
    (globalThis as any).RTCPeerConnection = class {
      createDataChannel() {}
      onicecandidate: any;
      onicegatheringstatechange: any;
      iceGatheringState = 'complete';
      async createOffer() {
        return {};
      }
      async setLocalDescription() {
        // Fire gathering complete synchronously so detectSubnets finishes fast
        setTimeout(() => this.onicegatheringstatechange?.(), 0);
      }
      close() {}
    };

    // Stub fetch so probe batches (192.168.1.x) reject immediately
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const { result } = renderHook(() =>
      useNetworkDiscovery({ nativeDiscover, nativeOnly: false }),
    );

    act(() => {
      result.current.scan();
    });

    await waitFor(() => expect(result.current.scanning).toBe(false), {
      timeout: 5000,
    });

    expect(nativeDiscover).toHaveBeenCalledOnce();
    // Native result must be present (subnet scan adds nothing since fetch is stubbed)
    const urls = result.current.discovered.map((s) => s.url);
    expect(urls).toContain('http://10.0.0.5:3141');

    (globalThis as any).RTCPeerConnection = origRTC;
    vi.unstubAllGlobals();
  });
});
