import {
  useAchievementsQuery,
  useInvalidateQuery,
  useUsageQuery,
} from '@work-agent/sdk';
import type React from 'react';
import { createContext, useContext } from 'react';
import { useApiBase } from './ApiBaseContext';

const AnalyticsContext = createContext<{
  refresh: () => void;
  rescan: () => Promise<void>;
} | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const invalidate = useInvalidateQuery();
  const { apiBase } = useApiBase();

  const refresh = () => {
    invalidate(['analytics', 'usage']);
    invalidate(['analytics', 'achievements']);
  };

  const rescan = async () => {
    await fetch(`${apiBase}/api/analytics/rescan`, { method: 'POST' });
    refresh();
  };

  return (
    <AnalyticsContext.Provider value={{ refresh, rescan }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context)
    throw new Error('useAnalytics must be used within AnalyticsProvider');

  const {
    data: usageStats,
    isLoading: usageLoading,
    error: usageError,
  } = useUsageQuery();
  const {
    data: achievements,
    isLoading: achievementsLoading,
    error: achievementsError,
  } = useAchievementsQuery();

  return {
    usageStats,
    achievements,
    loading: usageLoading || achievementsLoading,
    error: usageError || achievementsError,
    refresh: context.refresh,
    rescan: context.rescan,
  };
}
