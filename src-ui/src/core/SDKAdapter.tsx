import { ReactNode, useMemo } from 'react';
import { SDK, SDKProvider, type PluginManifest } from '@stallion-ai/sdk';

interface SDKAdapterProps {
  children: ReactNode;
  apiBase?: string;
  authToken?: string;
}

const defaultManifest: PluginManifest = {
  name: 'core',
  version: '1.0.0',
  sdkVersion: '^0.3',
  capabilities: ['chat', 'mcp', 'storage'],
  permissions: ['storage.session', 'storage.local']
};

export function SDKAdapter({ children, apiBase = 'http://localhost:3141', authToken }: SDKAdapterProps) {
  const sdk = useMemo(
    () => new SDK({ apiBase, authToken }, defaultManifest),
    [apiBase, authToken]
  );

  return <SDKProvider value={sdk}>{children}</SDKProvider>;
}
