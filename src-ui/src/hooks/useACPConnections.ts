import {
  type ACPConnectionInfo,
  useACPConnectionsQuery,
} from '@stallion-ai/sdk';

export type { ACPConnectionInfo };

export function useACPConnections() {
  return useACPConnectionsQuery();
}
