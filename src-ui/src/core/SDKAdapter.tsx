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

// Detect backend port - use environment variable or default to 3141
const getApiBase = () => {
  return import.meta.env.VITE_API_BASE || 'http://localhost:3141';
};

export function SDKAdapter({ children, apiBase, authToken }: SDKAdapterProps) {
  const effectiveApiBase = apiBase || getApiBase();
  
  const sdk = useMemo(
    () => new SDK({ apiBase: effectiveApiBase, authToken }, defaultManifest),
    [effectiveApiBase, authToken]
  );

  return <SDKProvider value={sdk}>{children}</SDKProvider>;
}
