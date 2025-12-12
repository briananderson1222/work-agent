import { createContext, useContext, ReactNode, useSyncExternalStore, useCallback } from 'react';
import { transformTool } from '@stallion-ai/sdk';

interface SalesData {
  myDetails: {
    userId: string;
    name: string;
    email: string;
    role: string;
  } | null;
  myTerritories: any[];
  myAccounts: any[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

class SalesDataStore {
  private data: SalesData = {
    myDetails: null,
    myTerritories: [],
    myAccounts: [],
    loading: false,
    error: null,
    lastFetch: 0,
  };
  
  private listeners = new Set<() => void>();
  private fetchPromise: Promise<void> | null = null;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.data;

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  private isCacheValid(): boolean {
    if (!this.data.lastFetch) return false;
    return (Date.now() - this.data.lastFetch) < this.cacheTTL;
  }

  async fetch(force = false) {
    // Return cached data if valid and not forcing
    if (!force && this.isCacheValid()) {
      console.log('[SalesDataStore] Using cached data');
      return;
    }

    // Return existing promise if already fetching
    if (this.fetchPromise) {
      console.log('[SalesDataStore] Fetch already in progress');
      return this.fetchPromise;
    }

    this.data = { ...this.data, loading: true, error: null };
    this.notify();

    this.fetchPromise = (async () => {
      try {
        console.log('[SalesDataStore] Fetching sales data...');
        
        const details = await transformTool('work-agent', 'satSfdc_getMyPersonalDetails', {}, 'data => data');
        
        if (!details?.sfdcId) {
          throw new Error('No user ID returned');
        }

        const [territoriesResult, accountsResult] = await Promise.allSettled([
          transformTool('work-agent', 'satSfdc_listUserAssignedTerritories', { userId: details.sfdcId }, 'data => data'),
          transformTool('work-agent', 'satSfdc_listUserAssignedAccounts', { userId: details.sfdcId }, 'data => data')
        ]);

        const territories = territoriesResult.status === 'fulfilled' ? territoriesResult.value?.territories || [] : [];
        const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value?.accountTeamMembers || [] : [];

        this.data = {
          myDetails: {
            userId: details.sfdcId,
            name: details.alias,
            email: details.email,
            role: details.role,
          },
          myTerritories: territories,
          myAccounts: accounts,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        };

        console.log('[SalesDataStore] ✅ Loaded');
      } catch (err) {
        console.error('[SalesDataStore] ❌ Failed:', err);
        this.data = {
          ...this.data,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      } finally {
        this.fetchPromise = null;
        this.notify();
      }
    })();

    return this.fetchPromise;
  }

  clear() {
    this.data = {
      myDetails: null,
      myTerritories: [],
      myAccounts: [],
      loading: false,
      error: null,
      lastFetch: 0,
    };
    this.fetchPromise = null;
    this.notify();
  }
}

const salesDataStore = new SalesDataStore();

const SalesDataContext = createContext<{
  fetch: (force?: boolean) => Promise<void>;
  clear: () => void;
} | null>(null);

export function SalesDataProvider({ children }: { children: ReactNode }) {
  const fetch = useCallback((force = false) => salesDataStore.fetch(force), []);
  const clear = useCallback(() => salesDataStore.clear(), []);

  return (
    <SalesDataContext.Provider value={{ fetch, clear }}>
      {children}
    </SalesDataContext.Provider>
  );
}

// Hook for actions only (fetch/clear)
export function useSalesDataActions() {
  const context = useContext(SalesDataContext);
  if (!context) {
    throw new Error('useSalesDataActions must be used within SalesDataProvider');
  }
  return context;
}

// Hook for data subscription (no side effects)
export function useSalesData() {
  const data = useSyncExternalStore(
    salesDataStore.subscribe,
    salesDataStore.getSnapshot
  );
  return data;
}
