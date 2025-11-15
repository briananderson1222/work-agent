import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';

type ConfigData = {
  apiEndpoint?: string;
  region?: string;
  defaultModel?: string;
  defaultChatFontSize?: number;
  systemPrompt?: string;
  templateVariables?: Array<{
    key: string;
    type: string;
    value?: string;
    format?: string;
  }>;
  logLevel?: string;
  meetingNotifications?: {
    enabled?: boolean;
    thresholds?: number[];
  };
};

export const CONFIG_DEFAULTS = {
  defaultChatFontSize: 14,
  region: 'us-east-1',
  userId: 'default-user', // Static userId until auth is implemented
  apiBase: typeof window !== 'undefined' 
    ? (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || 'http://localhost:3141'
    : 'http://localhost:3141',
} as const;

class ConfigStore {
  private config: ConfigData | null = null;
  private listeners = new Set<() => void>();
  private fetching: Promise<void> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.config;
  };

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  async fetch(apiBase: string) {
    if (this.fetching) {
      return this.fetching;
    }

    this.fetching = (async () => {
      try {
        const response = await fetch(`${apiBase}/config/app`);
        const result = await response.json();
        
        if (result.success) {
          this.config = result.data;
          this.notify();
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      } finally {
        this.fetching = null;
      }
    })();

    return this.fetching;
  }

  async update(apiBase: string, config: Partial<ConfigData>) {
    try {
      const response = await fetch(`${apiBase}/config/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      
      if (result.success) {
        this.config = result.data;
        this.notify();
      }
    } catch (error) {
      console.error('Failed to update config:', error);
      throw error;
    }
  }
}

const configStore = new ConfigStore();

type ConfigContextType = {
  fetchConfig: (apiBase: string) => Promise<void>;
  updateConfig: (apiBase: string, config: Partial<ConfigData>) => Promise<void>;
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const fetchConfig = useCallback((apiBase: string) => {
    return configStore.fetch(apiBase);
  }, []);

  const updateConfig = useCallback((apiBase: string, config: Partial<ConfigData>) => {
    return configStore.update(apiBase, config);
  }, []);

  return (
    <ConfigContext.Provider value={{ fetchConfig, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(apiBase: string, shouldFetch: boolean = true): ConfigData | null {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }

  const { fetchConfig } = context;

  const config = useSyncExternalStore(
    configStore.subscribe,
    configStore.getSnapshot,
    configStore.getSnapshot
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchConfig(apiBase);
    }
  }, [apiBase, shouldFetch, fetchConfig]);

  return config;
}

export { useApiBase } from './ApiBaseContext';

export function useConfigActions() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfigActions must be used within ConfigProvider');
  }
  return { updateConfig: context.updateConfig };
}
