/**
 * useSystemStatus — fetches /api/system/status with SSE-driven invalidation.
 * Used by OnboardingGate, Agents page, Schedule page.
 */

import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';

export interface SystemStatus {
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

export function useSystemStatus(pollInterval?: number) {
  const { apiBase } = useApiBase();

  return useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/system/status`);
      if (!res.ok) throw new Error('Failed to fetch system status');
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.status === 'error' ? 5_000 : (pollInterval ?? false),
    staleTime: 10_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

export async function verifyBedrock(
  apiBase: string,
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  const res = await fetch(`${apiBase}/api/system/verify-bedrock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(region ? { region } : {}),
  });
  return res.json();
}
