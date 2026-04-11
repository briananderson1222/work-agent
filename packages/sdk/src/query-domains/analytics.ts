import { _getApiBase } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  useApiMutation,
  useApiQuery,
} from '../query-core';

export interface FeedbackRatingInput {
  agentSlug: string;
  conversationId: string;
  messageIndex: number;
  messagePreview: string;
  rating: 'thumbs_up' | 'thumbs_down';
  reason?: string;
}

export interface FeedbackRatingDeleteInput {
  conversationId: string;
  messageIndex: number;
}

export async function fetchUsageStats(): Promise<any> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/analytics/usage`);
  if (!response.ok) throw new Error('Failed to fetch usage');
  const result = await response.json();
  return result.data;
}

export async function resetUsageStats(): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/analytics/usage`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to reset usage');
  }
}

export async function rescanAnalytics(): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/analytics/rescan`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to rescan analytics');
  }
}

export function useUsageQuery(config?: QueryConfig<any>) {
  return useApiQuery(['analytics', 'usage'], () => fetchUsageStats(), config);
}

export function useActivityUsageQuery(
  from: string,
  to: string,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['analytics', 'usage', from, to],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/analytics/usage?from=${from}&to=${to}`,
      );
      if (!response.ok) throw new Error('Failed to fetch activity usage');
      return (await response.json()).data;
    },
    config,
  );
}

export function useAchievementsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['analytics', 'achievements'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/analytics/achievements`);
      if (!response.ok) throw new Error('Failed to fetch achievements');
      const result = await response.json();
      return result.data;
    },
    config,
  );
}

export async function fetchInsights(days = 14): Promise<any> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/insights?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch insights');
  return (await response.json()).data;
}

export function useInsightsQuery(days = 14, config?: QueryConfig<any>) {
  return useApiQuery(['insights', days], () => fetchInsights(days), config);
}

export async function fetchFeedbackRatings(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/feedback/ratings`);
  if (!response.ok) throw new Error('Failed to fetch ratings');
  return (await response.json()).data || [];
}

export async function saveFeedbackRating(
  input: FeedbackRatingInput,
): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/feedback/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to save feedback rating');
  }
}

export async function deleteFeedbackRating(
  input: FeedbackRatingDeleteInput,
): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/feedback/rate`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to delete feedback rating');
  }
}

export async function analyzeFeedback(): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/feedback/analyze`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to analyze feedback');
  }
}

export async function clearFeedbackAnalysis(): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/api/feedback/clear-analysis`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to clear feedback analysis');
  }
}

export function useFeedbackRatingsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'ratings'],
    () => fetchFeedbackRatings(),
    config,
  );
}

export function useFeedbackGuidelinesQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'guidelines'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/feedback/guidelines`);
      if (!response.ok) throw new Error('Failed to fetch guidelines');
      return (await response.json()).data?.summary || null;
    },
    config,
  );
}

export function useFeedbackStatusQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['feedback', 'status'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/feedback/status`);
      if (!response.ok) throw new Error('Failed to fetch feedback status');
      return (await response.json()).data || null;
    },
    config,
  );
}

export function useAnalyticsRescanMutation(
  options?: MutationOptions<void, void>,
) {
  return useApiMutation(async () => rescanAnalytics(), {
    invalidateKeys: [
      ['analytics', 'usage'],
      ['analytics', 'achievements'],
    ],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useResetUsageStatsMutation(
  options?: MutationOptions<void, void>,
) {
  return useApiMutation(async () => resetUsageStats(), {
    invalidateKeys: [['analytics', 'usage']],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useAnalyzeFeedbackMutation(
  options?: MutationOptions<void, void>,
) {
  return useApiMutation(async () => analyzeFeedback(), {
    invalidateKeys: [
      ['feedback', 'ratings'],
      ['feedback', 'guidelines'],
      ['feedback', 'status'],
    ],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useClearFeedbackAnalysisMutation(
  options?: MutationOptions<void, void>,
) {
  return useApiMutation(async () => clearFeedbackAnalysis(), {
    invalidateKeys: [
      ['feedback', 'ratings'],
      ['feedback', 'guidelines'],
      ['feedback', 'status'],
    ],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useSaveFeedbackRatingMutation(
  options?: MutationOptions<void, FeedbackRatingInput>,
) {
  return useApiMutation(async (input) => saveFeedbackRating(input), {
    invalidateKeys: [['feedback', 'ratings']],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function useDeleteFeedbackRatingMutation(
  options?: MutationOptions<void, FeedbackRatingDeleteInput>,
) {
  return useApiMutation(async (input) => deleteFeedbackRating(input), {
    invalidateKeys: [['feedback', 'ratings']],
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}
