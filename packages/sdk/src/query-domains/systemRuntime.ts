import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthStatus, UserIdentity } from '@stallion-ai/contracts/auth';
import { _getApiBase } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  useApiQuery,
} from '../query-core';

export interface SystemPrerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'error' | 'missing';
  category: 'required' | 'optional';
  source?: string;
  installGuide?: { steps: string[]; commands?: string[] };
}

export interface SystemStatus {
  prerequisites?: SystemPrerequisite[];
  bedrock: {
    credentialsFound: boolean;
    verified: boolean | null;
    region: string;
  };
  acp: {
    connected: boolean;
    connections: Array<{ id: string; status: string }>;
  };
  clis: Record<string, boolean>;
  ready: boolean;
}

export interface AuthStatusData extends AuthStatus {
  user: UserIdentity | null;
}

export interface MonitoringAgentStat {
  slug: string;
  name: string;
  status: 'idle' | 'active' | 'running';
  model: string;
  conversationCount: number;
  messageCount: number;
  cost: number;
  healthy?: boolean;
}

export interface MonitoringStatsData {
  agents: MonitoringAgentStat[];
  summary: {
    totalAgents: number;
    activeAgents: number;
    runningAgents: number;
    totalMessages: number;
    totalCost: number;
  };
}

export interface MonitoringMetric {
  agentSlug: string;
  messageCount: number;
  conversationCount: number;
  totalCost: number;
}

export interface BrandingData {
  appName: string;
  logo: { src: string; alt?: string } | null;
  theme: Record<string, string> | null;
  welcomeMessage: string | null;
}

export interface ServerCapabilities {
  runtime?: string;
  voice?: {
    stt?: import('../voice/types').ProviderCapability[];
    tts?: import('../voice/types').ProviderCapability[];
  };
  context?: {
    providers?: Array<{
      id: string;
      name: string;
      visibleOn?: string[];
    }>;
  };
  scheduler?: boolean;
}

export interface CoreUpdateStatus {
  currentHash?: string;
  remoteHash?: string;
  branch?: string;
  behind?: number;
  ahead?: number;
  updateAvailable: boolean;
  noUpstream?: boolean;
  error?: string;
}

export async function fetchAuthStatus(): Promise<AuthStatusData> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/auth/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch auth status');
  }
  return (await response.json()) as AuthStatusData;
}

export async function renewAuth(): Promise<{ success: boolean; error?: string }> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/auth/renew`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('Failed to renew auth');
  }
  return (await response.json()) as { success: boolean; error?: string };
}

export async function verifyBedrockConnection(
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/system/verify-bedrock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(region ? { region } : {}),
  });
  return (await response.json()) as { verified: boolean; error?: string };
}

async function requestSystemStatus(apiBaseOverride?: string): Promise<SystemStatus> {
  const apiBase = apiBaseOverride ?? (await _getApiBase());
  const response = await fetch(`${apiBase}/api/system/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch system status');
  }
  return (await response.json()) as SystemStatus;
}

export async function fetchMonitoringStats(): Promise<MonitoringStatsData | null> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/monitoring/stats`);
  const result = (await response.json()) as {
    success: boolean;
    data?: MonitoringStatsData;
  };
  return result.success ? (result.data ?? null) : null;
}

export async function fetchMonitoringMetrics(
  range: 'today' | 'week' | 'month' | 'all',
): Promise<MonitoringMetric[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/monitoring/metrics?range=${range}`);
  const result = (await response.json()) as {
    success: boolean;
    data?: { metrics?: MonitoringMetric[] };
  };
  return result.success ? (result.data?.metrics ?? []) : [];
}

export async function fetchMonitoringEvents(
  start?: Date,
  end?: Date,
): Promise<unknown[]> {
  const apiBase = await _getApiBase();
  const params = new URLSearchParams();
  if (start) params.set('start', start.toISOString());
  if (end) params.set('end', end.toISOString());
  const response = await fetch(`${apiBase}/monitoring/events?${params}`);
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown[];
  };
  return result.success ? (result.data ?? []) : [];
}

export async function fetchBranding(): Promise<BrandingData> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/branding`);
  const result = (await response.json()) as {
    success: boolean;
    data?: {
      name?: string;
      logo?: { src: string; alt?: string } | null;
      theme?: Record<string, string> | null;
      welcomeMessage?: string | null;
    };
  };
  const data = result.data ?? {};
  return {
    appName: data.name || 'Stallion',
    logo: data.logo ?? null,
    theme: data.theme ?? null,
    welcomeMessage: data.welcomeMessage ?? null,
  };
}

async function requestCoreUpdateStatus(
  apiBaseOverride?: string,
): Promise<CoreUpdateStatus> {
  const apiBase = apiBaseOverride ?? (await _getApiBase());
  const response = await fetch(`${apiBase}/api/system/core-update`);
  const result = (await response.json()) as CoreUpdateStatus;
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

export function useSystemStatusQuery(
  pollInterval?: number,
  config?: QueryConfig<SystemStatus>,
) {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: () => requestSystemStatus(),
    refetchInterval: (query) =>
      query.state.status === 'error' ? 5_000 : (pollInterval ?? false),
    staleTime: config?.staleTime ?? 10_000,
    gcTime: config?.gcTime,
    enabled: config?.enabled ?? true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

export function useAuthStatusQuery(config?: QueryConfig<AuthStatusData>) {
  return useApiQuery(['auth-status'], () => fetchAuthStatus(), {
    staleTime: config?.staleTime ?? 30_000,
    gcTime: config?.gcTime,
    enabled: config?.enabled ?? true,
  });
}

export function useRenewAuthMutation(
  options?: MutationOptions<{ success: boolean; error?: string }, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => renewAuth(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth-status'] });
      options?.onSuccess?.(data, undefined);
    },
    onError: (error) => {
      options?.onError?.(error as Error, undefined);
    },
  });
}

export function useVerifyBedrockMutation(
  options?: MutationOptions<
    { verified: boolean; error?: string },
    string | undefined
  >,
) {
  return useMutation({
    mutationFn: async (region?: string) => verifyBedrockConnection(region),
    onSuccess: (data, region) => {
      options?.onSuccess?.(data, region);
    },
    onError: (error, region) => {
      options?.onError?.(error as Error, region);
    },
  });
}

export function useSystemStatusForApiBaseQuery(
  apiBase: string,
  pollInterval?: number,
  config?: QueryConfig<SystemStatus>,
) {
  return useQuery({
    queryKey: ['system-status', apiBase],
    queryFn: () => requestSystemStatus(apiBase),
    refetchInterval: (query) =>
      query.state.status === 'error' ? 5_000 : (pollInterval ?? false),
    staleTime: config?.staleTime ?? 10_000,
    gcTime: config?.gcTime,
    enabled: !!apiBase && (config?.enabled ?? true),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

export function useMonitoringStatsQuery(
  config?: QueryConfig<MonitoringStatsData | null>,
) {
  return useQuery({
    queryKey: ['monitoring-stats'],
    queryFn: () => fetchMonitoringStats(),
    refetchInterval: 5_000,
    staleTime: config?.staleTime,
    gcTime: config?.gcTime,
    enabled: config?.enabled ?? true,
  });
}

export function useMonitoringMetricsQuery(
  range: 'today' | 'week' | 'month' | 'all',
  config?: QueryConfig<MonitoringMetric[]>,
) {
  return useQuery({
    queryKey: ['monitoring-metrics', range],
    queryFn: () => fetchMonitoringMetrics(range),
    refetchInterval: 30_000,
    staleTime: config?.staleTime,
    gcTime: config?.gcTime,
    enabled: config?.enabled ?? true,
  });
}

export function useBrandingQuery(config?: QueryConfig<BrandingData>) {
  return useApiQuery(['branding'], () => fetchBranding(), {
    staleTime: config?.staleTime ?? 5 * 60 * 1000,
    gcTime: config?.gcTime,
    enabled: config?.enabled ?? true,
  });
}

export function useCoreUpdateStatusQuery(
  apiBase: string,
  config?: QueryConfig<CoreUpdateStatus>,
) {
  return useQuery({
    queryKey: ['core-update-check', apiBase],
    queryFn: () => requestCoreUpdateStatus(apiBase),
    enabled: !!apiBase && (config?.enabled ?? true),
    staleTime: config?.staleTime,
    gcTime: config?.gcTime,
    retry: false,
  });
}

export function useApplyCoreUpdateMutation(
  apiBase: string,
  options?: MutationOptions<any, void>,
) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiBase}/api/system/core-update`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to apply core update');
      }
      return result;
    },
    onSuccess: (data) => {
      options?.onSuccess?.(data, undefined);
    },
    onError: (error) => {
      options?.onError?.(error as Error, undefined);
    },
  });
}

export function useServerCapabilitiesQuery(
  config?: QueryConfig<ServerCapabilities>,
) {
  return useApiQuery(
    ['system-capabilities'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/system/capabilities`);
      if (!response.ok) {
        throw new Error('Failed to fetch server capabilities');
      }
      return (await response.json()) as ServerCapabilities;
    },
    config,
  );
}
