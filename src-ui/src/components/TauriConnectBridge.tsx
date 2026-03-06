/**
 * TauriConnectBridge — injects native Tauri implementations into
 * ConnectionsProvider on Android. Browser / desktop consumers receive
 * undefined for both callbacks, preserving the existing web fallback paths.
 *
 * Usage: replace <ConnectionsProvider ...> with <TauriConnectBridge ...>
 * in the provider tree; all ConnectionsProvider props are forwarded.
 */

import { ConnectionsProvider } from '@stallion-ai/connect';
import type { DiscoveredServer, NativeDiscoverFn, NativeScanFn } from '@stallion-ai/connect';
import React, { useMemo } from 'react';
import { isAndroidApp } from '../lib/tauri';

type ConnectionsProviderProps = React.ComponentProps<typeof ConnectionsProvider>;

export function TauriConnectBridge({
  children,
  mdnsEnabled = true,
  ...rest
}: ConnectionsProviderProps) {
  const nativeScan = useMemo<NativeScanFn | undefined>(() => {
    if (!isAndroidApp()) return undefined;
    return async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        // barcode-scanner returns { content, format, bounds } on success;
        // throws when user cancels (cancel plugin command stops the scan)
        const result = await invoke<{ content: string; format: string }>(
          'plugin:barcode-scanner|scan',
          { windowed: false, formats: ['QR_CODE'] },
        );
        return result?.content ?? null;
      } catch {
        // User cancelled or permission denied
        return null;
      }
    };
  }, []);

  const nativeDiscover = useMemo<NativeDiscoverFn | undefined>(() => {
    if (!isAndroidApp() || !mdnsEnabled) return undefined;
    return async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        // Kotlin resolves with { servers: DiscoveredServer[] }
        const result = await invoke<{ servers: DiscoveredServer[] }>('plugin:stallion-mdns|discover');
        console.log('[mDNS] discover result:', result);
        return result?.servers ?? [];
      } catch (err) {
        console.error('[mDNS] discover error:', err);
        return [];
      }
    };
  }, [mdnsEnabled]);

  return (
    <ConnectionsProvider
      {...rest}
      nativeScan={nativeScan}
      nativeDiscover={nativeDiscover}
      mdnsEnabled={mdnsEnabled}
    >
      {children}
    </ConnectionsProvider>
  );
}
