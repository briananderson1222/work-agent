import { createWorkspaceContext } from '@stallion-ai/sdk';

interface SFDCContext {
  accounts?: any[];
  opportunities?: any[];
  tasks?: any[];
}

interface SalesState {
  // Personal context (loaded on workspace mount)
  myDetails: {
    name?: string;
    email?: string;
    role?: string;
    userId?: string;
  } | null;
  myTerritories: any[];
  myAccounts: any[];
  
  // Meeting-specific cache
  sfdcCache: Record<string, SFDCContext>; // meetingId -> SFDC data
  loggedActivities: Record<string, {id: string, subject: string}>; // meetingId -> logged activity
  
  // Metadata
  lastRefresh: number;
  contextLoaded: boolean;
}

const { Provider, useWorkspaceContext } = createWorkspaceContext<SalesState>({
  workspaceSlug: 'stallion',
  initialState: {
    myDetails: null,
    myTerritories: [],
    myAccounts: [],
    sfdcCache: {},
    loggedActivities: {},
    lastRefresh: 0,
    contextLoaded: false,
  },
  persist: true,
});

export { Provider as SalesProvider, useWorkspaceContext as useSales };
