import { createContext, useContext, ReactNode, useSyncExternalStore } from 'react';
import { useApiQuery, transformTool } from '@stallion-ai/sdk';

// Local state store (not API data)
interface LocalSalesState {
  sfdcCache: Record<string, any>;
  loggedActivities: Record<string, { id: string; subject: string }>;
  emailToName: Record<string, string>;
}

class LocalSalesStore {
  private data: LocalSalesState = {
    sfdcCache: {},
    loggedActivities: {},
    emailToName: {},
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

  addEmailName(email: string, name: string) {
    if (!this.data.emailToName[email]) {
      this.data.emailToName[email] = name;
      this.notify();
    }
  }

  getNameForEmail(email: string): string | undefined {
    return this.data.emailToName[email];
  }

  clear() {
    this.data = { sfdcCache: {}, loggedActivities: {}, emailToName: {} };
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
    addEmailName: (email: string, name: string) => store.addEmailName(email, name),
    getNameForEmail: (email: string) => store.getNameForEmail(email),
    clear: () => store.clear(),
  };
}

// SDK query hook for API data
export function useSalesData(config?: { staleTime?: number }) {
  return useApiQuery(
    ['salesData'], // Cache key
    async () => {
      const details = await transformTool('work-agent', 'sat-sfdc_get_my_personal_details', {}, 'data => data');
      
      if (!details?.sfdcId) {
        throw new Error('No user ID returned');
      }

      const [territoriesResult, accountsResult] = await Promise.allSettled([
        transformTool('work-agent', 'sat-sfdc_list_user_assigned_territories', { userId: details.sfdcId }, 'data => data'),
        transformTool('work-agent', 'sat-sfdc_list_user_assigned_accounts', { userId: details.sfdcId }, 'data => data')
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
