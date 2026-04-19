import { _getApiBase } from '../api';
import type {
  AuthStatusData,
  BrandingData,
  CoreUpdateStatus,
  MonitoringMetric,
  MonitoringStatsData,
  ServerCapabilities,
  SystemStatus,
} from './systemRuntime';

async function resolveApiBase(apiBaseOverride?: string): Promise<string> {
  return apiBaseOverride ?? (await _getApiBase());
}

export async function fetchAuthStatus(): Promise<AuthStatusData> {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}/api/auth/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch auth status');
  }
  return (await response.json()) as AuthStatusData;
}

export async function renewAuth(): Promise<{
  success: boolean;
  error?: string;
}> {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}/api/auth/renew`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('Failed to renew auth');
  }
  return (await response.json()) as { success: boolean; error?: string };
}

export async function verifyManagedRuntimeConnection(
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}/api/system/verify-managed-runtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(region ? { region } : {}),
  });
  return (await response.json()) as { verified: boolean; error?: string };
}

export async function verifyBedrockConnection(
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  return verifyManagedRuntimeConnection(region);
}

export async function requestSystemStatus(
  apiBaseOverride?: string,
): Promise<SystemStatus> {
  const apiBase = await resolveApiBase(apiBaseOverride);
  const response = await fetch(`${apiBase}/api/system/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch system status');
  }
  return (await response.json()) as SystemStatus;
}

export async function fetchMonitoringStats(): Promise<MonitoringStatsData | null> {
  const apiBase = await resolveApiBase();
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
  const apiBase = await resolveApiBase();
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
  const apiBase = await resolveApiBase();
  const params = new URLSearchParams();
  if (start) {
    params.set('start', start.toISOString());
  }
  if (end) {
    params.set('end', end.toISOString());
  }
  const response = await fetch(`${apiBase}/monitoring/events?${params}`);
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown[];
  };
  return result.success ? (result.data ?? []) : [];
}

export async function fetchBranding(): Promise<BrandingData> {
  const apiBase = await resolveApiBase();
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

export async function requestCoreUpdateStatus(
  apiBaseOverride?: string,
): Promise<CoreUpdateStatus> {
  const apiBase = await resolveApiBase(apiBaseOverride);
  const response = await fetch(`${apiBase}/api/system/core-update`);
  const result = (await response.json()) as CoreUpdateStatus;
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

export async function applyCoreUpdate(apiBase: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`${apiBase}/api/system/core-update`, {
    method: 'POST',
  });
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to apply core update');
  }
  return result;
}

export async function fetchServerCapabilities(): Promise<ServerCapabilities> {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}/api/system/capabilities`);
  if (!response.ok) {
    throw new Error('Failed to fetch server capabilities');
  }
  return (await response.json()) as ServerCapabilities;
}
