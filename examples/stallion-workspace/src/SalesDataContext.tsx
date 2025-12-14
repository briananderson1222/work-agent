import { createContext, useContext, ReactNode, useSyncExternalStore } from 'react';
import { useApiQuery, transformTool } from '@stallion-ai/sdk';

// Local state store (not API data)
interface LocalSalesState {
  sfdcCache: Record<string, any>;
  loggedActivities: Record<string, { id: string; subject: string }>;
}

class LocalSalesStore {
  private data: LocalSalesState = {
    sfdcCache: {},
    loggedActivities: {},
  };
  
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.data;

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  setSfdcCache(meetingId: string, data: any) {
    this.data.sfdcCache[meetingId] = data;
    this.notify();
  }

  setLoggedActivity(meetingId: string, activity: { id: string; subject: string }) {
    this.data.loggedActivities[meetingId] = activity;
    this.notify();
  }

  clear() {
    this.data = { sfdcCache: {}, loggedActivities: {} };
    this.notify();
  }
}

const localSalesStore = new LocalSalesStore();

const LocalSalesContext = createContext<LocalSalesStore | null>(null);

export function SalesDataProvider({ children }: { children: ReactNode }) {
  return (
    <LocalSalesContext.Provider value={localSalesStore}>
      {children}
    </LocalSalesContext.Provider>
  );
}

// Hook for local state
export function useLocalSalesState() {
  const store = useContext(LocalSalesContext);
  if (!store) {
    throw new Error('useLocalSalesState must be used within SalesDataProvider');
  }
  
  const data = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  
  return {
    ...data,
    setSfdcCache: (meetingId: string, data: any) => store.setSfdcCache(meetingId, data),
    setLoggedActivity: (meetingId: string, activity: { id: string; subject: string }) => 
      store.setLoggedActivity(meetingId, activity),
    clear: () => store.clear(),
  };
}

// SDK query hook for API data - auto-caches, dedupes, handles StrictMode
export function useSalesData(config?: { staleTime?: number }) {
  return useApiQuery(
    ['salesData'], // Cache key
    async () => {
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

      return {
        myDetails: {
          userId: details.sfdcId,
          name: details.alias,
          email: details.email,
          role: details.role,
        },
        myTerritories: territories,
        myAccounts: accounts,
      };
    },
    config // Optional: override staleTime
  );
}

// Backward compatibility hook
export function useSalesContext() {
  const { data, isLoading, error } = useSalesData();
  
  return {
    myDetails: data?.myDetails || null,
    myTerritories: data?.myTerritories || [],
    myAccounts: data?.myAccounts || [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
