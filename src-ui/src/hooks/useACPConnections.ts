import {
  type ACPConnectionInfo,
  type ACPConnectionRegistryEntry,
  useACPConnectionRegistryQuery,
  useACPConnectionsQuery,
} from '@stallion-ai/sdk';

export type { ACPConnectionInfo, ACPConnectionRegistryEntry };

export function useACPConnections() {
  return useACPConnectionsQuery();
}

export function useACPConnectionRegistry() {
  return useACPConnectionRegistryQuery();
}
