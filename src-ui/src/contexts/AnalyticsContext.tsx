import React, { createContext, useContext } from 'react';
import { useUsageQuery, useAchievementsQuery, useInvalidateQuery } from '@stallion-ai/sdk';

const AnalyticsContext = createContext<{
  refresh: () => void;
  rescan: () => Promise<void>;
} | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const invalidate = useInvalidateQuery();
  
  const refresh = () => {
    invalidate(['analytics', 'usage']);
    invalidate(['analytics', 'achievements']);
  };
  
  const rescan = async () => {
    // TODO: Implement rescan endpoint call
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
  if (!context) throw new Error('useAnalytics must be used within AnalyticsProvider');

  const { data: usageStats, isLoading: usageLoading, error: usageError } = useUsageQuery();
  const { data: achievements, isLoading: achievementsLoading, error: achievementsError } = useAchievementsQuery();

  return {
    usageStats,
    achievements,
    loading: usageLoading || achievementsLoading,
    error: usageError || achievementsError,
    refresh: context.refresh,
    rescan: context.rescan,
  };
}
