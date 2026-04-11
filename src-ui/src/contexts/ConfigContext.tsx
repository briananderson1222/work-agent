import {
  useConfigQuery,
  useUpdateConfigMutation,
} from '@stallion-ai/sdk';
import { log } from '@/utils/logger';
import type { AppConfig } from '../types';

type ConfigData = AppConfig & {
  defaultMaxSteps?: number;
};

export const CONFIG_DEFAULTS = {
  defaultChatFontSize: 14,
  region: 'us-east-1',
  userId: 'default-user', // Static userId until auth is implemented
  apiBase:
    typeof window !== 'undefined'
      ? (window as Window & { __API_BASE__?: string }).__API_BASE__ ||
        (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env
          ?.VITE_API_BASE ||
        'http://localhost:3141'
      : 'http://localhost:3141',
} as const;

export function useConfig(): ConfigData | null {
  const { data, error } = useConfigQuery();

  if (error) log.api('Failed to fetch config:', error);

  return data || null;
}

export function useConfigActions() {
  const updateMutation = useUpdateConfigMutation({
    onError: (error) => log.api('Failed to update config:', error),
  });

  return {
    updateConfig: (config: Partial<ConfigData>) =>
      updateMutation.mutateAsync(config),
    isSaving: updateMutation.isPending,
  };
}
