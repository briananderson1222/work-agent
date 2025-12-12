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
  emailToName: Record<string, string>;
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

class SalesDataStore {
  private data: SalesData = {
    myDetails: null,
    myTerritories: [],
    myAccounts: [],
    emailToName: {},
    loading: false,
    error: null,
    lastFetch: 0,
  };
  
  private listeners = new Set<() => void>();
  private fetchPromise: Promise<void> | null = null;
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.data;

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  addEmailName(email: string, name: string) {
    if (!this.data.emailToName[email]) {
      this.data = {
        ...this.data,
        emailToName: { ...this.data.emailToName, [email]: name }
      };
      this.notify();
    }
  }

  getNameForEmail(email: string): string | undefined {
    return this.data.emailToName[email];
  }

  async fetch(force = false) {
    // Return existing promise if already fetching
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Use cache if fresh and not forcing
    const now = Date.now();
    if (!force && this.data.lastFetch && (now - this.data.lastFetch) < this.CACHE_TTL) {
      console.log('[SalesDataStore] Using cached data');
      return;
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

        console.log('[SalesDataStore] ✅ Loaded:', {
          user: details.alias,
          territories: territories.length,
          accounts: accounts.length,
        });
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
      emailToName: {},
      loading: false,
      error: null,
      lastFetch: 0,
    };
    this.notify();
  }
}

const salesDataStore = new SalesDataStore();

const SalesDataContext = createContext<{
  data: SalesData;
  fetch: (force?: boolean) => Promise<void>;
  clear: () => void;
  addEmailName: (email: string, name: string) => void;
  getNameForEmail: (email: string) => string | undefined;
} | null>(null);

export function SalesDataProvider({ children }: { children: ReactNode }) {
  const data = useSyncExternalStore(
    salesDataStore.subscribe,
    salesDataStore.getSnapshot
  );

  const fetch = useCallback((force = false) => salesDataStore.fetch(force), []);
  const clear = useCallback(() => salesDataStore.clear(), []);
  const addEmailName = useCallback((email: string, name: string) => salesDataStore.addEmailName(email, name), []);
  const getNameForEmail = useCallback((email: string) => salesDataStore.getNameForEmail(email), []);

  return (
    <SalesDataContext.Provider value={{ data, fetch, clear, addEmailName, getNameForEmail }}>
      {children}
    </SalesDataContext.Provider>
  );
}

export function useSalesData() {
  const context = useContext(SalesDataContext);
  if (!context) {
    throw new Error('useSalesData must be used within SalesDataProvider');
  }
  return context;
}
