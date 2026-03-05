/**
 * ApiBaseContext — thin backward-compat wrapper over @stallion-ai/connect.
 * Consumers continue to call useApiBase() / <ApiBaseProvider> with the same API shape.
 * On Tauri Android, TauriConnectBridge injects native scan + mDNS discovery.
 */
import { type ReactNode } from 'react';
import { useConnections } from '@stallion-ai/connect';
import { TauriConnectBridge } from '../components/TauriConnectBridge';
import { useMobileSettings } from '../hooks/useMobileSettings';

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE || 'http://localhost:3141';

function ApiBaseProviderInner({ children }: { children: ReactNode }) {
  const { settings } = useMobileSettings();
  return (
    <TauriConnectBridge
      defaultUrl={DEFAULT_API_BASE}
      mdnsEnabled={settings.mdnsDiscoveryEnabled}
    >
      {children as any}
    </TauriConnectBridge>
  );
}

export function ApiBaseProvider({ children }: { children: ReactNode }) {
  return <ApiBaseProviderInner>{children}</ApiBaseProviderInner>;
}

export function useApiBase() {
  const { apiBase, setApiBase, resetToDefault, isCustom } = useConnections();
  return { apiBase, setApiBase, resetToDefault, isCustom };
}
