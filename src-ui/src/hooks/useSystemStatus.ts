/**
 * useSystemStatus — fetches /api/system/status through shared SDK queries.
 * Used by OnboardingGate, Agents page, Schedule page.
 */

import {
  useSystemStatusQuery,
  verifyBedrockConnection,
  verifyManagedRuntimeConnection,
} from '@stallion-ai/sdk';

export function useSystemStatus(pollInterval?: number) {
  return useSystemStatusQuery(pollInterval);
}

export function verifyBedrock(
  _apiBase: string,
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  return verifyBedrockConnection(region);
}

export function verifyManagedRuntime(
  _apiBase: string,
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  return verifyManagedRuntimeConnection(region);
}
