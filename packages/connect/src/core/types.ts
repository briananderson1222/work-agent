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
