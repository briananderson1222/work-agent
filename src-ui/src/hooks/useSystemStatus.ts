/**
 * useSystemStatus — fetches /api/system/status through shared SDK queries.
 * Used by OnboardingGate, Agents page, Schedule page.
 */

import {
  useSystemStatusQuery,
  verifyBedrockConnection,
} from '@stallion-ai/sdk';

export function useSystemStatus(pollInterval?: number) {
  return useSystemStatusQuery(pollInterval);
}

export async function verifyBedrock(
  _apiBase: string,
  region?: string,
): Promise<{ verified: boolean; error?: string }> {
  return verifyBedrockConnection(region);
}
