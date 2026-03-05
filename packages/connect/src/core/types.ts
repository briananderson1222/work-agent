export interface SavedConnection {
  id: string;
  name: string;
  url: string;
  lastConnected?: number;
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'error';

export interface DiscoveredServer {
  url: string;
  name: string;
  latency: number; // ms
}

/** Returns the scanned URL string, or null if cancelled */
export type NativeScanFn = () => Promise<string | null>;

/** Returns a list of mDNS-discovered servers */
export type NativeDiscoverFn = () => Promise<DiscoveredServer[]>;
