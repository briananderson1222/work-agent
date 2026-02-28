/**
 * useACPConnections — single react-query source for ACP connection status.
 * Invalidated by useServerEvents on 'acp:status' SSE events.
 */

import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';

export interface ACPConnectionInfo {
  id: string;
  name: string;
  icon?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  enabled: boolean;
  status: string;
  modes: string[];
  sessionId: string | null;
  mcpServers: string[];
  currentModel: string | null;
  configOptions?: { category: string; currentValue?: string; options?: string[] }[];
}

export function useACPConnections() {
  const { apiBase } = useApiBase();

  return useQuery<ACPConnectionInfo[]>({
    queryKey: ['acp-connections'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/acp/connections`);
      if (!res.ok) return [];
      const { data } = await res.json();
      return data || [];
    },
    staleTime: 5_000,
  });
}
