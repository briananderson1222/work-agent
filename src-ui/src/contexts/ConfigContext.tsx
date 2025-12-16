import { createContext, useContext, ReactNode } from 'react';
import { useConfigQuery, useApiMutation, useInvalidateQuery } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

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
    ? (window as any).__API_BASE__ || (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3141'
    : 'http://localhost:3141',
} as const;

const ConfigContext = createContext<{} | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigContext.Provider value={{}}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigData | null {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used within ConfigProvider');

  const { data, error } = useConfigQuery();
  
  if (error) log.api('Failed to fetch config:', error);
  
  return data || null;
}

export function useConfigActions() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfigActions must be used within ConfigProvider');
  
  const invalidate = useInvalidateQuery();

  const updateMutation = useApiMutation(
    async (config: Partial<ConfigData>) => {
      const apiBase = CONFIG_DEFAULTS.apiBase;
      const response = await fetch(`${apiBase}/config/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    {
      onSuccess: () => invalidate(['config']),
      onError: (error) => log.api('Failed to update config:', error),
    }
  );

  return {
    updateConfig: (config: Partial<ConfigData>) => updateMutation.mutateAsync(config),
  };
}
