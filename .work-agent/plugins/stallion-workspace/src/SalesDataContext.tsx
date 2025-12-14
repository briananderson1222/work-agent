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
    if (email && name) {
      this.data.emailToName[email.toLowerCase()] = name;
      this.notify();
    }
  }

  getNameForEmail(email: string): string | undefined {
    return this.data.emailToName[email?.toLowerCase()];
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

// Individual query hooks - only fetch what you need
export function useMyPersonalDetails() {
  return useApiQuery(
    ['sfdc', 'personalDetails'],
    async () => {
      const details = await transformTool('work-agent', 'sat-sfdc_get_my_personal_details', {}, 'data => data');
      return {
        userId: details.sfdcId,
        name: details.alias,
        email: details.email,
        role: details.role,
      };
    },
    { staleTime: 10 * 60 * 1000 } // 10 min - rarely changes
  );
}

export function useMyTerritories(userId: string | undefined) {
  return useApiQuery(
    ['sfdc', 'territories', userId],
    async () => {
      const result = await transformTool('work-agent', 'sat-sfdc_list_user_assigned_territories', { userId }, 'data => data');
      return result?.territories || [];
    },
    { 
      enabled: !!userId,
      staleTime: 10 * 60 * 1000
    }
  );
}

export function useMyAccounts(userId: string | undefined) {
  return useApiQuery(
    ['sfdc', 'accounts', userId],
    async () => {
      const result = await transformTool('work-agent', 'sat-sfdc_list_user_assigned_accounts', { userId }, 'data => data');
      return result?.accountTeamMembers || [];
    },
    { 
      enabled: !!userId,
      staleTime: 5 * 60 * 1000
    }
  );
}

// Convenience hook that fetches all (for components that need everything)
export function useSalesData() {
  const { data: myDetails, isLoading: detailsLoading } = useMyPersonalDetails();
  const { data: myTerritories = [], isLoading: territoriesLoading } = useMyTerritories(myDetails?.userId);
  const { data: myAccounts = [], isLoading: accountsLoading } = useMyAccounts(myDetails?.userId);

  return {
    data: {
      myDetails: myDetails || null,
      myTerritories: myTerritories || [],
      myAccounts: myAccounts || [],
    },
    isLoading: detailsLoading || territoriesLoading || accountsLoading,
    error: null,
  };
}

// Backward compatibility hook
export function useSalesContext() {
  const { data, isLoading, error } = useSalesData();
  
  return {
    myDetails: data.myDetails,
    myTerritories: data.myTerritories,
    myAccounts: data.myAccounts,
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

