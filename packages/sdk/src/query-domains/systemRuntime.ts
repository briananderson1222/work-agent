import type { AuthStatus, UserIdentity } from '@stallion-ai/contracts/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MutationOptions,
  type QueryConfig,
  useApiQuery,
} from '../query-core';
import {
  applyCoreUpdate,
  fetchAuthStatus,
  fetchBranding,
  fetchMonitoringMetrics,
  fetchMonitoringStats,
  fetchServerCapabilities,
  renewAuth,
  requestCoreUpdateStatus,
  requestSystemStatus,
  verifyBedrockConnection,
} from './systemRuntimeRequests';

export {
  applyCoreUpdate,
  fetchAuthStatus,
  fetchBranding,
  fetchMonitoringEvents,
  fetchMonitoringMetrics,
  fetchMonitoringStats,
  fetchServerCapabilities,
  renewAuth,
  requestCoreUpdateStatus,
  requestSystemStatus,
  verifyBedrockConnection,
} from './systemRuntimeRequests';

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
    region: string | null;
  };
  acp: {
    connected: boolean;
    connections: Array<{ id: string; status: string }>;
  };
  providers?: {
    configured: Array<{
      id: string;
      type: string;
      enabled: boolean;
      capabilities?: string[];
    }>;
    detected: {
      ollama: boolean;
      bedrock: boolean;
    };
  };
  clis: Record<string, boolean>;
  capabilities?: Record<
    string,
    {
      ready: boolean;
      source: string | null;
    }
  >;
  recommendation?: {
    type: 'providers' | 'runtimes' | 'connections';
    actionLabel: string;
    title: string;
    detail: string;
  };
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
    mutationFn: async () => applyCoreUpdate(apiBase),
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
    () => fetchServerCapabilities(),
    config,
  );
}
