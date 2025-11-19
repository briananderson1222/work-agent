import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useApiBase } from './ApiBaseContext';

interface UsageStats {
  lifetime: {
    totalMessages: number;
    totalSessions: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    uniqueAgents: string[];
    firstMessageDate?: string;
    lastMessageDate?: string;
  };
  byModel: Record<string, {
    messages: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  byAgent: Record<string, {
    sessions: number;
    messages: number;
    cost: number;
  }>;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  threshold?: number;
}

class AnalyticsStore {
  private apiBase: string;
  private listeners = new Set<() => void>();
  private usageStats: UsageStats | null = null;
  private achievements: Achievement[] = [];
  private loading = false;
  private error: string | null = null;
  private cachedSnapshot: any = null;

  constructor(apiBase: string) {
    this.apiBase = apiBase;
    this.updateSnapshot();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.cachedSnapshot;

  private updateSnapshot() {
    this.cachedSnapshot = {
      usageStats: this.usageStats,
      achievements: this.achievements,
      loading: this.loading,
      error: this.error,
    };
  }

  private notify() {
    this.updateSnapshot();
    this.listeners.forEach(listener => listener());
  }

  async fetchUsageStats() {
    this.loading = true;
    this.error = null;
    this.notify();

    try {
      const response = await fetch(`${this.apiBase}/api/analytics/usage`);
      if (!response.ok) throw new Error('Failed to fetch usage stats');
      const result = await response.json();
      this.usageStats = result.data;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  async fetchAchievements() {
    this.loading = true;
    this.error = null;
    this.notify();

    try {
      const response = await fetch(`${this.apiBase}/api/analytics/achievements`);
      if (!response.ok) throw new Error('Failed to fetch achievements');
      const result = await response.json();
      this.achievements = result.data;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  async rescan() {
    this.loading = true;
    this.error = null;
    this.notify();

    try {
      const response = await fetch(`${this.apiBase}/api/analytics/rescan`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to rescan analytics');
      const result = await response.json();
      this.usageStats = result.data;
      await this.fetchAchievements();
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      this.notify();
    }
  }
}

const AnalyticsContext = createContext<AnalyticsStore | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { apiBase } = useApiBase();
  const [store] = React.useState(() => new AnalyticsStore(apiBase));

  React.useEffect(() => {
    store.fetchUsageStats();
    store.fetchAchievements();
  }, [store]);

  return <AnalyticsContext.Provider value={store}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  const store = useContext(AnalyticsContext);
  if (!store) throw new Error('useAnalytics must be used within AnalyticsProvider');

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ...state,
    refresh: () => {
      store.fetchUsageStats();
      store.fetchAchievements();
    },
    rescan: () => store.rescan(),
  };
}
