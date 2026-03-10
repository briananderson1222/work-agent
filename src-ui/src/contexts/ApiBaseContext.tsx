/**
 * ApiBaseContext — thin backward-compat wrapper over @stallion-ai/connect.
 * Consumers continue to call useApiBase() / <ApiBaseProvider> with the same API shape.
 */
import { type ReactNode } from 'react';
import { ConnectionsProvider, useConnections } from '@stallion-ai/connect';

const DEFAULT_API_BASE =
  (window as Window & { __API_BASE__?: string }).__API_BASE__ ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:3141';

export function ApiBaseProvider({ children }: { children: ReactNode }) {
  return (
    <ConnectionsProvider defaultUrl={DEFAULT_API_BASE}>
      {children as any}
    </ConnectionsProvider>
  );
}

export function useApiBase() {
  const { apiBase, setApiBase, resetToDefault, isCustom } = useConnections();
  return { apiBase, setApiBase, resetToDefault, isCustom };
}
