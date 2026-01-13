import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast, useWorkspaceNavigation, Button, Pill, useSendToChat } from '@stallion-ai/sdk';
import { useSalesContext } from './useSalesContext';
import { LeadershipInsightModal } from './LeadershipInsightModal';
import { salesforceProvider } from './data';
import './workspace.css';

const SALESFORCE_BASE_URL = 'https://aws-crm.lightning.force.com';

// Feature flags
const ENABLE_MY_ACCOUNTS = true;

interface AutocompleteItem {
  id: string;
  title: string;
  description?: string;
  metadata?: any;
  badge?: string;
}

interface Account {
  id: string;
  name: string;
  owner?: { name: string };
  website?: string;
  geo_Text__c?: string;
  awsci_customer?: {
    customerRevenue?: {
      tShirtSize?: string;
    };
  };
  _sources?: Array<{
    type: 'owner' | 'territory';
    label: string;
  }>;
}

interface Opportunity {
  id: string;
  name: string;
  amount?: number;
  closeDate: string;
  stageName: string;
  probability: number;
  owner: {
    id: string;
    name: string;
    email: string;
  };
}

interface Task {
  id: string;
  subject: string;
  status: string;
  activityDate?: string;
  description?: string;
  priority?: string;
  sa_Activity__c?: string;
  type?: string;
  createdDate?: string;
  lastModifiedDate?: string;
  isClosed?: boolean;
  ownerId?: string;
  whatId?: string;
  what?: {
    __typename: string;
    name: string;
  };
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CRMProps {
  activeTab?: any; // Will be defined when this tab is active
}

export function CRM({ activeTab }: CRMProps) {
  const { showToast } = useToast();
  const { getTabState, setTabState } = useWorkspaceNavigation();
  const agentSlug = 'work-agent';
  const sendToChat = useSendToChat(agentSlug);
  const salesContext = useSalesContext();
  
  const userDetails = salesContext.myDetails ? {
    alias: salesContext.myDetails.name,
    sfdcId: salesContext.myDetails.userId
  } : null;
  
  // Parse initial state
  const initialState = useMemo(() => {
    const storedState = activeTab ? getTabState('crm') : '';
    const params = new URLSearchParams(storedState);
    const filters = params.get('filters') ? JSON.parse(params.get('filters')!) : [];
    const storedMode = params.get('mode') as 'my-accounts' | 'search' | null;
    return {
      mode: storedMode || 'my-accounts',
      searchType: (params.get('searchType') as 'owner' | 'territory') || 'owner',
      activeFilters: filters
    };
  }, [activeTab]);
  
  const [mode, setMode] = useState<'my-accounts' | 'search'>(initialState.mode);
  const [searchInput, setSearchInput] = useState('');
  const [searchType, setSearchType] = useState<'owner' | 'territory'>(initialState.searchType);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [activeFilters, setActiveFilters] = useState<Array<{
    type: 'owner' | 'territory' | 'error';
    label: string;
    value?: string;
    id?: string;
    error?: string;
  }>>(initialState.activeFilters);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(50); // Show 50 accounts initially
  const [isRestoring, setIsRestoring] = useState(false);
  const hasRestoredRef = useRef(false);
  const [showLeadershipModal, setShowLeadershipModal] = useState(false);
  
  // In-memory cache for enriched account details (persists until page refresh)
  const accountDetailsCache = useRef<Map<string, Account>>(new Map());
  
  // Account and detail state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [myAccountsCache, setMyAccountsCache] = useState<Account[]>([]);
  const [searchAccountsCache, setSearchAccountsCache] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [selectedGeos, setSelectedGeos] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [showCreateOppModal, setShowCreateOppModal] = useState(false);
  const [showLogActivityModal, setShowLogActivityModal] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [oppFormData, setOppFormData] = useState({
    name: '',
    stageName: 'Prospecting',
    closeDate: '',
    amount: '',
    probability: '10'
  });
  const [activityFormData, setActivityFormData] = useState({
    subject: '',
    activityDate: new Date().toISOString().split('T')[0],
    description: '',
    saActivity: ''
  });
  
  // Restore state when tab becomes active
  useEffect(() => {
    if (activeTab) {
      const storedState = getTabState('crm');
      if (storedState) {
        const params = new URLSearchParams(storedState);
        setMode((params.get('mode') as 'my-accounts' | 'search') || 'my-accounts');
        setSearchType((params.get('searchType') as 'owner' | 'territory') || 'owner');
        const filters = params.get('filters');
        if (filters) {
          setActiveFilters(JSON.parse(filters));
        }
      }
    }
  }, [activeTab, getTabState]);
  
  // Persist state changes
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    const currentState = getTabState('crm');
    const params = new URLSearchParams(currentState);
    params.set('mode', mode);
    params.set('searchType', searchType);
    if (activeFilters.length > 0) {
      params.set('filters', JSON.stringify(activeFilters));
    } else {
      params.delete('filters');
    }
    const stateString = params.toString();
    setTabState('crm', stateString);
  }, [mode, searchType, activeFilters, isInitialMount, setTabState, getTabState]);

  // Auto-load my accounts when data is ready
  useEffect(() => {
    if (ENABLE_MY_ACCOUNTS && mode === 'my-accounts' && accounts.length === 0 && activeFilters.length === 0 && !salesContext.loading && salesContext.myAccounts?.length > 0) {
      loadMyAccounts();
    }
  }, [mode, salesContext.loading, salesContext.myAccounts?.length]);

  // Restore accounts from filters on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    
    if (activeFilters.length > 0 && accounts.length === 0) {
      hasRestoredRef.current = true;
      setIsRestoring(true);
      // Re-fetch accounts based on restored filters
      const reloadFromFilters = async () => {
        for (const filter of activeFilters) {
          if (filter.type === 'owner' && filter.value) {
            await searchAccounts(filter.value);
          } else if (filter.type === 'territory' && filter.id) {
            await loadTerritoryAccounts(filter.id, filter.label);
          }
        }
        setIsRestoring(false);
      };
      reloadFromFilters();
    }
  }, []);

  const loadMyAccounts = async () => {
    if (salesContext.loading) {
      showToast('Loading user details...', 'info');
      return;
    }
    
    if (!userDetails?.sfdcId || !salesContext.myAccounts?.length) {
      showToast('User details not loaded yet', 'error');
      return;
    }
    
    
    // Use accounts from salesContext (already fetched via React Query)
    const myAccountsData = salesContext.myAccounts.map(member => ({
      ...member.account,
      _sources: [
        { type: 'owner', label: userDetails.alias },
        ...(member.account.territory ? [{ type: 'territory', label: member.account.territory.name }] : [])
      ]
    }));
    
    
    setAccounts(myAccountsData);
    setMyAccountsCache(myAccountsData);
  };


  // Debounced territory search
  useEffect(() => {
    if (!searchInput.trim() || searchType !== 'territory') {
      setShowAutocomplete(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const territories = await salesforceProvider.searchTerritories(searchInput);
        
        const items: AutocompleteItem[] = territories.map((t) => ({
          id: t.id,
          title: t.name,
          description: t.id,
          metadata: t
        }));
        
        setAutocompleteItems(items);
        setShowAutocomplete(true);
      } catch (error) {
        console.error('Failed to search territories:', error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, searchType]);

  // Owner search hint
  useEffect(() => {
    if (!searchInput.trim() || searchType !== 'owner') {
      setShowAutocomplete(false);
      return;
    }

    setAutocompleteItems([{
      id: 'owner-example',
      title: searchInput,
      description: 'Press Enter to search (format: First Last)',
      badge: 'Owner'
    }]);
    setShowAutocomplete(true);
  }, [searchInput, searchType]);

  // Cache search results whenever accounts change in search mode
  useEffect(() => {
    if (mode === 'search' && accounts.length > 0) {
      setSearchAccountsCache(accounts);
    }
  }, [accounts, mode]);

  // Persist selected account to URL
  useEffect(() => {
    if (isInitialMount) return;
    const params = new URLSearchParams(getTabState('crm'));
    if (selectedAccount) {
      params.set('selectedAccount', selectedAccount.id);
    } else {
      params.delete('selectedAccount');
    }
    setTabState('crm', params.toString());
  }, [selectedAccount]);

  const getCacheKey = (type: string, key: string) => `sfdc-${type}-${key}`;

  // Get unique filter options from accounts
  const allGeos = [...new Set(accounts.map(acc => acc.geo_Text__c).filter(Boolean))].sort();
  const allSizes = [...new Set(accounts.map(acc => acc.awsci_customer?.customerRevenue?.tShirtSize).filter(Boolean))].sort();

  // Filter accounts based on selected filters
  const filteredAccounts = accounts.filter(account => {
    if (nameFilter && !account.name.toLowerCase().includes(nameFilter.toLowerCase())) {
      return false;
    }
    if (selectedGeos.size > 0 && !selectedGeos.has(account.geo_Text__c || '')) {
      return false;
    }
    if (selectedSizes.size > 0 && !selectedSizes.has(account.awsci_customer?.customerRevenue?.tShirtSize || '')) {
      return false;
    }
    return true;
  });

  const handleAutocompleteSelect = async (item: AutocompleteItem) => {
    if (searchType === 'territory') {
      await loadTerritoryAccounts(item.id, item.title);
    } else {
      await searchAccounts(searchInput);
    }
    setSearchInput('');
    setShowAutocomplete(false);
  };

  const loadTerritoryAccounts = async (territoryId: string, territoryName: string) => {
    setLoading(true);
    try {
      const accounts = await salesforceProvider.getTerritoryAccounts(territoryId);
      
      const newAccounts = accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        owner: acc.owner,
        website: acc.website,
        geo_Text__c: acc.geo,
        awsci_customer: acc.segment ? { customerRevenue: { tShirtSize: acc.segment } } : undefined,
        _sources: [{ type: 'territory' as const, label: territoryName }]
      }));
      setAccounts(prev => {
        const combined = [...prev, ...newAccounts];
        return combined.reduce((acc, curr) => {
          const existing = acc.find(a => a.id === curr.id);
          if (existing) {
            existing._sources = [...(existing._sources || []), ...(curr._sources || [])];
          } else {
            acc.push(curr);
          }
          return acc;
        }, [] as Account[]);
      });
      
      setActiveFilters(prev => {
        if (isRestoring || prev.some(f => f.type === 'territory' && f.id === territoryId)) {
          return prev;
        }
        return [...prev, { type: 'territory', label: territoryName, id: territoryId }];
      });
    } catch (error) {
      console.error('Failed to load territory accounts:', error);
      showToast('Failed to load territory accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const searchAccounts = async (ownerSearch: string) => {
    if (!ownerSearch.trim()) return;
    
    setLoading(true);
    try {
      const owners = ownerSearch.split(',').map(owner => owner.trim()).filter(owner => owner);
      
      const searchPromises = owners.map(owner =>
        salesforceProvider.searchAccounts({ field: 'owner', operator: 'CONTAINS', value: owner })
      );
      
      const results = await Promise.all(searchPromises);
      const newAccounts = results.flat().map((acc) => ({
        id: acc.id,
        name: acc.name,
        owner: acc.owner,
        website: acc.website,
        geo_Text__c: acc.geo,
        awsci_customer: acc.segment ? { customerRevenue: { tShirtSize: acc.segment } } : undefined,
        _sources: [{ type: 'owner' as const, label: ownerSearch }]
      }));
      
      setAccounts(prev => {
        const combined = [...prev, ...newAccounts];
        return combined.reduce((acc, curr) => {
          const existing = acc.find(a => a.id === curr.id);
          if (existing) {
            existing._sources = [...(existing._sources || []), ...(curr._sources || [])];
          } else {
            acc.push(curr);
          }
          return acc;
        }, [] as Account[]);
      });
      
      const emptyOwners = owners.filter((owner, index) => !results[index] || results[index].length === 0);
      if (emptyOwners.length > 0) {
        setActiveFilters(prev => [...prev, { 
          type: 'error', 
          label: `No accounts: ${emptyOwners.join(', ')}`,
          error: emptyOwners.join(', ')
        }]);
      }
      
      if (newAccounts.length > 0) {
        setActiveFilters(prev => {
          if (isRestoring || prev.some(f => f.type === 'owner' && f.value === ownerSearch)) {
            return prev;
          }
          const updated = [...prev, { type: 'owner', label: ownerSearch, value: ownerSearch }];
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to search accounts:', error);
      setActiveFilters(prev => [...prev, { 
        type: 'error', 
        label: `Failed to search: ${ownerSearch}`,
        error: ownerSearch
      }]);
      showToast('Failed to search accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountDetails = async (account: Account, forceRefresh = false) => {
    
    // Clear previous account data immediately
    setOpportunities([]);
    setTasks([]);
    
    // Check if we have enriched details in cache
    let enrichedAccount = accountDetailsCache.current.get(account.id);
    
    if (!enrichedAccount || forceRefresh) {
      // Fetch full account details
      try {
        const details = await salesforceProvider.getAccountDetails(account.id);
        enrichedAccount = {
          ...account,
          owner: details.owner,
          geo_Text__c: details.geo,
          awsci_customer: details.segment ? { customerRevenue: { tShirtSize: details.segment } } : undefined,
          website: details.website
        };
        // Cache the enriched account
        accountDetailsCache.current.set(account.id, enrichedAccount);
      } catch (error) {
        console.error('Failed to fetch account details:', error);
        enrichedAccount = account; // Use basic account if fetch fails
      }
    }
    
    setSelectedAccount(enrichedAccount);
    
    // Scroll account into view
    setTimeout(() => {
      const accountElement = document.querySelector(`[data-account-id="${account.id}"]`);
      if (accountElement) {
        accountElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
    
    
    const oppsCacheKey = getCacheKey('opportunities', account.id);
    const tasksCacheKey = getCacheKey('tasks', account.id);
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cachedOpps = sessionStorage.getItem(oppsCacheKey);
      const cachedTasks = sessionStorage.getItem(tasksCacheKey);
      
      if (cachedOpps && cachedTasks) {
        setOpportunities(JSON.parse(cachedOpps));
        setTasks(JSON.parse(cachedTasks));
        return;
      }
    }
    
    setLoadingOpportunities(true);
    setLoadingTasks(true);
    
    try {
      // Load opportunities and tasks in parallel
      const [oppsVMs, tasksVMs] = await Promise.all([
        salesforceProvider.getAccountOpportunities(account.id).finally(() => setLoadingOpportunities(false)),
        userDetails?.alias 
          ? salesforceProvider.getUserTasks(userDetails.alias, { accountId: account.id }).finally(() => setLoadingTasks(false)) 
          : Promise.resolve([])
      ]);

      // Map to expected format
      const oppsResult = oppsVMs.map(o => ({
        id: o.id,
        name: o.name,
        amount: o.amount,
        closeDate: o.closeDate.toISOString().split('T')[0],
        stageName: o.stage,
        probability: o.probability,
        owner: o.owner
      }));
      
      const tasksResult = tasksVMs.map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        activityDate: t.dueDate?.toISOString().split('T')[0],
        description: t.description,
        priority: t.priority,
        sa_Activity__c: t.activityType,
        what: t.relatedTo ? { __typename: t.relatedTo.type, name: t.relatedTo.name } : undefined,
        whatId: t.relatedTo?.id
      }));

      setOpportunities(oppsResult || []);
      setTasks(tasksResult || []);
      
      // Cache results
      sessionStorage.setItem(oppsCacheKey, JSON.stringify(oppsResult || []));
      sessionStorage.setItem(tasksCacheKey, JSON.stringify(tasksResult || []));
    } catch (error) {
      console.error('Failed to load account details:', error);
      showToast('Failed to load account details', 'error');
      setLoadingOpportunities(false);
      setLoadingTasks(false);
    }
  };

  // Auto-load on mount - restore selected account only

  const handleRefresh = async () => {
    // Clear opportunity and task caches
    accounts.forEach(account => {
      sessionStorage.removeItem(getCacheKey('opportunities', account.id));
      sessionStorage.removeItem(getCacheKey('tasks', account.id));
    });
    
    setAccounts([]);
    setOpportunities([]);
    setTasks([]);
    setSearchError(null);
    
    // Refetch all active filters
    setLoading(true);
    try {
      const allAccounts: Account[] = [];
      for (const filter of activeFilters) {
        if (filter.type === 'owner' && filter.value) {
          const owners = filter.value.split(',').map(owner => owner.trim()).filter(owner => owner);
          const searchPromises = owners.map(owner =>
            salesforceProvider.searchAccounts({ field: 'owner', operator: 'CONTAINS', value: owner })
          );
          const results = await Promise.all(searchPromises);
          const accounts = results.flat().map(acc => ({
            id: acc.id,
            name: acc.name,
            owner: acc.owner,
            website: acc.website,
            geo_Text__c: acc.geo,
            awsci_customer: acc.segment ? { customerRevenue: { tShirtSize: acc.segment } } : undefined
          }));
          allAccounts.push(...accounts);
        } else if (filter.type === 'territory' && filter.id) {
          const result = await salesforceProvider.getTerritoryAccounts(filter.id);
          const accounts = result.map(acc => ({
            id: acc.id,
            name: acc.name,
            owner: acc.owner,
            website: acc.website,
            geo_Text__c: acc.geo,
            awsci_customer: acc.segment ? { customerRevenue: { tShirtSize: acc.segment } } : undefined
          }));
          allAccounts.push(...accounts);
        }
      }
      const uniqueAccounts = allAccounts.filter((account, index, self) =>
        index === self.findIndex(a => a.id === account.id)
      );
      setAccounts(uniqueAccounts);
    } catch (error) {
      console.error('Failed to refresh accounts:', error);
      showToast('Failed to refresh accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createOpportunity = () => {
    if (!selectedAccount) return;
    setOppFormData({
      name: '',
      stageName: 'Prospecting',
      closeDate: '',
      amount: '',
      probability: '10'
    });
    setShowCreateOppModal(true);
  };

  const handleCreateOpportunity = async () => {
    if (!selectedAccount || !oppFormData.name || !oppFormData.closeDate) return;
    
    setLoading(true);
    try {
      await salesforceProvider.createOpportunity({
        name: oppFormData.name,
        accountId: selectedAccount.id,
        stage: oppFormData.stageName,
        closeDate: new Date(oppFormData.closeDate),
        amount: oppFormData.amount ? parseFloat(oppFormData.amount) : undefined,
        probability: parseInt(oppFormData.probability),
        owner: { id: '', name: '', email: '' }
      });
      
      showToast('Opportunity created successfully', 'success');
      setShowCreateOppModal(false);
      await loadAccountDetails(selectedAccount, true);
    } catch (error) {
      console.error('Failed to create opportunity:', error);
      showToast('Failed to create opportunity', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createTask = () => {
    if (!selectedAccount) return;
    sendToChat(`Create a new task for account ${selectedAccount.name}`);
  };

  return (
    <>
      {/* Create Opportunity Modal */}
      {showCreateOppModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowCreateOppModal(false)}>
          <div style={{
            background: 'var(--color-bg)',
            padding: '1.5rem',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90vw',
            border: '1px solid var(--color-border)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--color-text)' }}>Create Opportunity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text)' }}>Name *</label>
                <input
                  type="text"
                  value={oppFormData.name}
                  onChange={(e) => setOppFormData({...oppFormData, name: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text)' }}>Stage *</label>
                <select
                  value={oppFormData.stageName}
                  onChange={(e) => setOppFormData({...oppFormData, stageName: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem'
                  }}
                >
                  <option>Prospecting</option>
                  <option>Qualification</option>
                  <option>Proposal</option>
                  <option>Negotiation</option>
                  <option>Closed Won</option>
                  <option>Closed Lost</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text)' }}>Close Date *</label>
                <input
                  type="date"
                  value={oppFormData.closeDate}
                  onChange={(e) => setOppFormData({...oppFormData, closeDate: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text)' }}>Amount</label>
                <input
                  type="number"
                  value={oppFormData.amount}
                  onChange={(e) => setOppFormData({...oppFormData, amount: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <Button variant="ghost" onClick={() => setShowCreateOppModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateOpportunity}
                  disabled={!oppFormData.name || !oppFormData.closeDate}
                  loading={loading}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log SA Activity Modal */}
      {showLogActivityModal && selectedOpportunity && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }} onClick={() => setShowLogActivityModal(false)}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Log SA Activity
              </h3>
            </div>

            {/* Context Section */}
            <div style={{
              padding: '1.5rem',
              background: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border-primary)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Account:</span>
                  <button
                    onClick={() => {
                      setSelectedOpportunity(null);
                      setShowLogActivityModal(false);
                      if (selectedAccount) loadAccountDetails(selectedAccount, true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      fontSize: '0.875rem'
                    }}
                  >
                    {selectedAccount?.name}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Opportunity:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedOpportunity.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Stage:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedOpportunity.stageName}</span>
                </div>
              </div>
            </div>

            {/* Form */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Subject <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={activityFormData.subject}
                  onChange={(e) => setActivityFormData({...activityFormData, subject: e.target.value})}
                  placeholder="Brief summary of the activity"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  SA Activity <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <select
                  value={activityFormData.saActivity}
                  onChange={(e) => setActivityFormData({...activityFormData, saActivity: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select activity type...</option>
                  <option>Architecture Review [Architecture]</option>
                  <option>Demo [Architecture]</option>
                  <option>Prototype/PoC/Pilot [Architecture]</option>
                  <option>Well Architected [Architecture]</option>
                  <option>Meeting / Office Hours [Management]</option>
                  <option>Account Planning [Management]</option>
                  <option>Immersion Day [Workshops]</option>
                  <option>GameDay [Workshops]</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Activity Date <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="date"
                  value={activityFormData.activityDate}
                  onChange={(e) => setActivityFormData({...activityFormData, activityDate: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                    Description
                  </label>
                  <button
                    onClick={async () => {
                      setIsGeneratingAi(true);
                      try {
                        const prompt = `Generate a professional activity description for this SA activity:
Subject: ${activityFormData.subject || 'Not provided'}
Activity Type: ${activityFormData.saActivity || 'Not provided'}
Account: ${selectedAccount?.name}
Opportunity: ${selectedOpportunity.name}
${activityFormData.description ? `Current description: ${activityFormData.description}` : ''}

Provide a concise, professional description (2-3 sentences) suitable for Salesforce activity logging.`;
                        
                        const data = await invokeAgent('work-agent', prompt);
                        setAiGeneratedText(data.output);
                        setShowAiPreview(true);
                      } catch (error) {
                        showToast('Failed to generate description', 'error');
                      } finally {
                        setIsGeneratingAi(false);
                      }
                    }}
                    disabled={isGeneratingAi || !activityFormData.subject}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: isGeneratingAi || !activityFormData.subject ? 'not-allowed' : 'pointer',
                      opacity: isGeneratingAi || !activityFormData.subject ? 0.5 : 1
                    }}
                  >
                    {isGeneratingAi ? '✨ Generating...' : '✨ AI Assist'}
                  </button>
                </div>
                <textarea
                  value={activityFormData.description}
                  onChange={(e) => setActivityFormData({...activityFormData, description: e.target.value})}
                  rows={4}
                  placeholder="Detailed description of the activity and outcomes"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    resize: 'vertical',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '1.5rem',
              borderTop: '1px solid var(--border-primary)',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              background: 'var(--bg-secondary)'
            }}>
              <Button variant="ghost" onClick={() => setShowLogActivityModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!activityFormData.subject || !activityFormData.saActivity) return;
                  setLoading(true);
                  try {
                    await salesforceProvider.createTask({
                      subject: activityFormData.subject,
                      activityType: activityFormData.saActivity,
                      dueDate: activityFormData.activityDate ? new Date(activityFormData.activityDate) : undefined,
                      description: activityFormData.description,
                      relatedTo: { type: 'Opportunity', id: selectedOpportunity.id, name: selectedOpportunity.name },
                      status: 'completed'
                    });
                    showToast('Activity logged successfully', 'success');
                    setShowLogActivityModal(false);
                    if (selectedAccount) await loadAccountDetails(selectedAccount, true);
                  } catch (error) {
                    console.error('Failed to log activity:', error);
                    showToast('Failed to log activity', 'error');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={!activityFormData.subject || !activityFormData.saActivity}
                loading={loading}
              >
                  Log Activity
                </Button>
              </div>
            </div>
          </div>
      )}

      {/* AI Preview Modal */}
      {showAiPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          backdropFilter: 'blur(4px)'
        }} onClick={() => setShowAiPreview(false)}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '500px',
            maxWidth: '90vw',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                AI Generated Description
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <textarea
                value={aiGeneratedText}
                onChange={(e) => setAiGeneratedText(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  resize: 'vertical',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0 }}>
                Review and edit the generated text before applying
              </p>
            </div>
            <div style={{
              padding: '1.5rem',
              borderTop: '1px solid var(--border-primary)',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              background: 'var(--bg-secondary)'
            }}>
              <Button variant="ghost" onClick={() => setShowAiPreview(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setActivityFormData({...activityFormData, description: aiGeneratedText});
                  setShowAiPreview(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}

    <div className="workspace-container">
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        gap: '0.5rem',
      }}>
        <button
          onClick={() => setShowLeadershipModal(true)}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Leadership Insight
        </button>
        <button
          onClick={() => {
            const prompt = `# Generate Insights

## Workflow

1. **Confirm scope** - Which timeframe and filter? (default: last 7 days, user's tasks)
2. **[P] Retrieve data:**
   - Get tasks/activities from SFDC for specified period
   - Get existing insights created by user for same period
3. **Cross-reference** - Match activities to existing insights by:
   - Account/Opportunity IDs
   - Activity date overlap
   - Description similarity
4. **Filter unlogged activities** - Exclude activities already covered by insights
5. **Analyze remaining activities** - Group by account/opportunity and identify significant items with business impact:
   - Customer wins or milestones
   - Technical blockers or challenges
   - Strategic opportunities
   - Risk indicators
   - Partner engagement highlights
6. **[P] Draft insights** - For each significant item, create insight draft with:
   - Title (AI-generated or manual)
   - Description (situation, action, result)
   - Category (Highlight, Lowlight, Risk, Observation, Blocker, Challenge)
   - Related accounts/opportunities
   - Relevant AWS services (if applicable)
   - Relevant tags
7. **Present drafts** - Numbered list with quick summary (or report "No new insights needed")
8. **User selects** - Which numbered insights to create
9. **[P] Create insights** - Submit selected insights to SFDC

## What Makes a Good Leadership Insight

**MUST:**
- Focus on business outcomes and impact
- Highlight strategic value or risk
- Provide context on "why this matters"
- Connect to customer goals or AWS priorities

**MUST NOT:**
- Simply log that an activity happened
- Include routine/expected activities without notable outcomes
- Create insights for administrative tasks
- Create insights just to have something to report

**SHOULD:**
- If all significant activities are already covered by insights, report "No new insights needed"
- Only propose insights with clear business value

## Activity Significance Criteria

- **Highlight**: Successful outcomes, customer adoption, competitive wins
- **Lowlight**: Setbacks, lost opportunities, delays
- **Risk**: Potential issues, customer concerns, technical debt
- **Observation**: Market trends, customer patterns, feedback themes
- **Blocker**: Issues preventing progress
- **Challenge**: Difficulties being addressed

## Questions to Ask

1. "Which timeframe to review?" (default: last 7 days)
2. "Filter by account, opportunity, or all activities?" (default: all)
3. "Which numbered insights should I create?" (only if insights proposed)

## Output Format

### When insights are proposed:
\`\`\`
📊 Leadership Insights - [Date Range]

Activities reviewed: [count] tasks/activities
Existing insights: [count] insights already created
New opportunities: [count] activities without insights

1. [Category] - [Title]
   - Account: [Account Name] [link]
   - Opportunity: [Opportunity Name] [link] (if applicable)
   - Activity: [Activity subject/date]
   - Summary: [Brief description]
   - AWS Services: [Service names] (if applicable)
   - Tags: [Suggested tags]
   
2. [Category] - [Title]
   - Account: [Account Name] [link]
   - Activity: [Activity subject/date]
   - Summary: [Brief description]
   - AWS Services: [Service names] (if applicable)
   - Tags: [Suggested tags]

**Action Required:**
Which insights should I create? (provide numbers)
\`\`\`

### When no insights needed:
\`\`\`
📊 Leadership Insights - [Date Range]

Activities reviewed: [count] tasks/activities
Existing insights: [count] insights already created

✅ No new insights needed - all significant activities are already covered by existing insights.
\`\`\`

## Notes

- Default to last 7 days unless user specifies otherwise
- MUST skip activities already covered by existing insights
- MUST focus on items with business impact or strategic value, not routine activities
- SHOULD report "No new insights needed" if everything significant is already covered
- Include SFDC links for accounts/opportunities/existing insights
- MAY use AI enrichment if available to improve insight quality
- Suggest relevant AWS services and tags based on activity content
- MAY group related activities into single insight when appropriate`;

            sendToChat(prompt);
          }}
          style={{
            padding: '0.5rem',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Ask AI to generate insights"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
      
      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__sidebar">
          <div className="workspace-dashboard__sidebar-header">
            <h3>Accounts</h3>
            
            {/* Mode Toggle */}
            {ENABLE_MY_ACCOUNTS && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                onClick={() => {
                  if (mode !== 'my-accounts') {
                    setMode('my-accounts');
                    setSelectedAccount(null);
                    setOpportunities([]);
                    setTasks([]);
                    // Restore from cache or load fresh
                    if (myAccountsCache.length > 0) {
                      setAccounts(myAccountsCache);
                    } else {
                      loadMyAccounts();
                    }
                  }
                }}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  border: mode === 'my-accounts' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: mode === 'my-accounts' ? 'var(--color-bg)' : 'var(--color-bg)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: mode === 'my-accounts' ? 600 : 400
                }}
              >
                My Accounts
              </button>
              <button
                onClick={() => {
                  if (mode !== 'search') {
                    setMode('search');
                    // Restore search results from cache
                    setAccounts(searchAccountsCache);
                    setSelectedAccount(null);
                    setOpportunities([]);
                    setTasks([]);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  border: mode === 'search' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: mode === 'search' ? 600 : 400
                }}
              >
                Search
              </button>
            </div>
            )}

            {/* Search Controls - Only show in search mode */}
            {mode === 'search' && (
            <div>
              {/* Search Type Selector */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    onClick={() => setSearchType('owner')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.75rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: searchType === 'owner' ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: searchType === 'owner' ? 'white' : 'var(--color-text-primary)',
                      cursor: 'pointer',
                      fontWeight: searchType === 'owner' ? 600 : 400
                    }}
                  >
                    By Owner
                  </button>
                  <button
                    onClick={() => setSearchType('territory')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.75rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: searchType === 'territory' ? '#198754' : 'var(--color-bg)',
                      color: searchType === 'territory' ? 'white' : 'var(--color-text-primary)',
                      cursor: 'pointer',
                      fontWeight: searchType === 'territory' ? 600 : 400
                    }}
                  >
                    By Territory
                  </button>
                </div>

            {/* Search Input with Autocomplete */}
            <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
              <input
                type="text"
                placeholder={searchType === 'owner' ? 'First Last...' : 'Territory name...'}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && searchInput.trim()) {
                    if (searchType === 'owner') {
                      searchAccounts(searchInput);
                      setSearchInput('');
                      setShowAutocomplete(false);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--color-border)';
                  setTimeout(() => setShowAutocomplete(false), 200);
                }}
              />
              
              {showAutocomplete && autocompleteItems.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  marginTop: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}>
                  {autocompleteItems.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => handleAutocompleteSelect(item)}
                      style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderBottom: idx < autocompleteItems.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: item.description ? '2px' : '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{item.title}</span>
                        {item.badge && (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: 'var(--color-primary)',
                            color: 'white',
                            fontWeight: 500,
                          }}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
            )}

            {/* Active Filters */}
            {mode === 'search' && activeFilters.length > 0 && (
              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {activeFilters.map((filter, idx) => {
                  const getFilterColor = () => {
                    if (filter.type === 'error') return '#dc3545';
                    if (filter.type === 'owner') return '#0d6efd';
                    if (filter.type === 'territory') return '#198754';
                    return 'var(--color-primary)';
                  };
                  
                  return (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        background: getFilterColor(),
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 500
                      }}
                    >
                      {filter.label}
                      <button
                        onClick={() => {
                          const newFilters = activeFilters.filter((_, i) => i !== idx);
                          setActiveFilters(newFilters);
                          
                          if (filter.type !== 'error' && newFilters.filter(f => f.type !== 'error').length === 0) {
                            setAccounts([]);
                          } else if (filter.type !== 'error') {
                            const allAccounts = [];
                            for (const f of newFilters.filter(f => f.type !== 'error')) {
                              let cached = null;
                              if (f.type === 'owner' && f.value) {
                                cached = sessionStorage.getItem(getCacheKey('accounts', f.value));
                              } else if (f.type === 'territory' && f.id) {
                                cached = sessionStorage.getItem(getCacheKey('territory-accounts', f.id));
                              }
                              if (cached) {
                                allAccounts.push(...JSON.parse(cached));
                              }
                            }
                            const uniqueAccounts = allAccounts.filter((account, index, self) => 
                              index === self.findIndex(a => a.id === account.id)
                            );
                            setAccounts(uniqueAccounts);
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'white',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '0.9rem',
                          lineHeight: 1
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            
            {/* Filter Bar */}
            {accounts.length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                <div 
                  onClick={() => setFilterExpanded(!filterExpanded)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: '0.75rem 0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>Filter</span>
                    {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGeos(new Set());
                          setSelectedSizes(new Set());
                          setNameFilter('');
                        }}
                        style={{
                          padding: 0,
                          fontSize: '0.75rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-primary)',
                          fontWeight: 500,
                          marginLeft: '0.25rem'
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <span>{filterExpanded ? '▼' : '▶'}</span>
                </div>
                
                {!filterExpanded && (selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                    {nameFilter && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: 'var(--color-primary)',
                        color: '#fff'
                      }}>
                        Name: "{nameFilter}"
                        <button
                          onClick={() => setNameFilter('')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            padding: 0,
                            marginLeft: '0.25rem',
                            fontSize: '0.9rem',
                            lineHeight: 1
                          }}
                          title="Clear filter"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {Array.from(selectedGeos).map(geo => (
                      <span key={geo} style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: 'var(--color-primary)',
                        color: '#fff'
                      }}>
                        {geo}
                      </span>
                    ))}
                    {Array.from(selectedSizes).map(size => (
                      <span key={size} style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: 'var(--color-success)',
                        color: '#fff'
                      }}>
                        {size}
                      </span>
                    ))}
                  </div>
                )}
                
                {filterExpanded && (
                  <>
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Account Name</div>
                      <input
                        type="text"
                        placeholder="Filter by name..."
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px',
                          background: 'var(--color-bg)',
                          color: 'var(--color-text-primary)'
                        }}
                      />
                    </div>
                    
                    {allGeos.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Geo</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {allGeos.map(geo => (
                            <button 
                              key={geo}
                              onClick={() => {
                                const newSet = new Set(selectedGeos);
                                if (selectedGeos.has(geo)) {
                                  newSet.delete(geo);
                                } else {
                                  newSet.add(geo);
                                }
                                setSelectedGeos(newSet);
                              }}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                background: selectedGeos.has(geo) ? 'var(--color-primary)' : 'var(--color-bg)',
                                color: selectedGeos.has(geo) ? '#fff' : 'var(--color-text)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                border: '1px solid',
                                borderColor: selectedGeos.has(geo) ? 'var(--color-primary)' : 'var(--color-border)',
                                transition: 'all 0.15s'
                              }}
                            >
                              {geo}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {allSizes.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Size</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {allSizes.map(size => (
                            <button 
                              key={size}
                              onClick={() => {
                                const newSet = new Set(selectedSizes);
                                if (selectedSizes.has(size)) {
                                  newSet.delete(size);
                                } else {
                                  newSet.add(size);
                                }
                                setSelectedSizes(newSet);
                              }}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                background: selectedSizes.has(size) ? 'var(--color-success)' : 'var(--color-bg)',
                                color: selectedSizes.has(size) ? '#fff' : 'var(--color-text)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                border: '1px solid',
                                borderColor: selectedSizes.has(size) ? 'var(--color-success)' : 'var(--color-border)',
                                transition: 'all 0.15s'
                              }}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                        Showing {Math.min(filteredAccounts.length, displayLimit)} of {filteredAccounts.length} accounts
                        {filteredAccounts.length > accounts.length && ` (${accounts.length} total)`}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          
          <div className="workspace-dashboard__list">
            {loading && accounts.length === 0 && (
              <div className="workspace-dashboard__loading">Loading...</div>
            )}
            {searchError && (
              <div className="workspace-dashboard__loading" style={{ color: 'var(--color-error, #ef4444)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                {searchError}
              </div>
            )}
            {filteredAccounts.length > 0 ? (
              filteredAccounts.slice(0, displayLimit).map((account) => (
                <div
                  key={account.id}
                  data-account-id={account.id}
                  onClick={(e) => {
                    // Don't load details if clicking on a link
                    if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).closest('a')) {
                      return;
                    }
                    loadAccountDetails(account);
                  }}
                  className={`workspace-dashboard__list-item ${
                    selectedAccount?.id === account.id ? 'is-active' : ''
                  }`}
                >
                  <div className="workspace-dashboard__list-item-title">
                    {account.name}
                  </div>
                  
                  {/* Owner and Territory Pills */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {account._sources?.map((source, idx) => {
                      const getSourceColor = () => {
                        if (source.type === 'owner') return '#0d6efd';
                        if (source.type === 'territory') return '#198754';
                        return 'var(--color-primary)';
                      };
                      
                      return (
                        <span key={idx} style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          borderRadius: '12px',
                          background: getSourceColor(),
                          color: 'white',
                          fontWeight: 500
                        }}>
                          {source.label}
                        </span>
                      );
                    })}
                  </div>
                  
                  <div className="workspace-dashboard__list-item-meta">
                    {account.website && (
                      <a
                        href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-primary)',
                          textDecoration: 'none'
                        }}
                      >
                        {account.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  {/* Metadata Pills */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {account.geo_Text__c && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        background: 'transparent',
                        color: '#6c757d',
                        border: '1px solid #6c757d',
                        fontWeight: 500
                      }}>
                        {account.geo_Text__c}
                      </span>
                    )}
                    {account.awsci_customer?.customerRevenue?.tShirtSize && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        background: 'transparent',
                        color: '#6c757d',
                        border: '1px solid #6c757d',
                        fontWeight: 500
                      }}>
                        {account.awsci_customer.customerRevenue.tShirtSize}
                      </span>
                    )}
                  </div>
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem'
                  }}>
                    <a
                      href={`${SALESFORCE_BASE_URL}/lightning/r/Account/${account.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--color-primary)',
                        fontSize: '1rem',
                        textDecoration: 'none'
                      }}
                      title="Open in Salesforce"
                    >
                      ↗
                    </a>
                  </div>
                </div>
              ))
            ) : !loading && accounts.length === 0 && !searchError ? (
              <div className="workspace-dashboard__empty">
                <div>
                  <div className="workspace-dashboard__empty-title">No Accounts</div>
                  <div className="workspace-dashboard__empty-subtitle">
                    Search for accounts by {searchType === 'owner' ? 'owner name' : 'territory'}
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* Show More/Less Button */}
            {filteredAccounts.length > displayLimit && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setDisplayLimit(prev => prev + 50)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--color-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Show More ({filteredAccounts.length - displayLimit} remaining)
                </button>
              </div>
            )}
            {displayLimit > 50 && filteredAccounts.length <= displayLimit && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setDisplayLimit(50)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--color-secondary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Show Less
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="workspace-dashboard__details">
          {selectedAccount ? (
            <>
              <div className="workspace-dashboard__details-header" style={{ position: 'relative' }}>
                <h1 className="workspace-dashboard__details-title">{selectedAccount.name}</h1>
                <a
                  href={`${SALESFORCE_BASE_URL}/lightning/r/Account/${selectedAccount.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    color: 'var(--color-primary)',
                    fontSize: '1.25rem',
                    textDecoration: 'none'
                  }}
                  title="Open in Salesforce"
                >
                  ↗
                </a>
                <div className="workspace-dashboard__details-meta">
                  {selectedAccount.owner?.name && <span>Owner: {selectedAccount.owner.name}</span>}
                  {selectedAccount.website && (
                    <span>
                      {' • Website: '}
                      <a 
                        href={selectedAccount.website.startsWith('http') ? selectedAccount.website : `https://${selectedAccount.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                      >
                        {selectedAccount.website}
                      </a>
                    </span>
                  )}
                  {selectedAccount.geo_Text__c && <span> • Geo: {selectedAccount.geo_Text__c}</span>}
                  {selectedAccount.awsci_customer?.customerRevenue?.tShirtSize && (
                    <span> • Size: {selectedAccount.awsci_customer.customerRevenue.tShirtSize}</span>
                  )}
                </div>
              </div>
              
              <div className="workspace-dashboard__details-content">
                <div className="workspace-dashboard__card">
                  <div style={{ display: 'flex', gap: '2rem' }}>
                    {/* Opportunities Section */}
                    <div style={{ flex: 1 }}>
                      <div className="workspace-dashboard__card-header">
                        <h3 className="workspace-dashboard__card-title">Opportunities</h3>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => sendToChat(`Help me create a new opportunity for account ${selectedAccount?.name}`)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-secondary)',
                              opacity: 0.6,
                              cursor: 'pointer',
                              padding: '0.25rem'
                            }}
                            title="Send to chat"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={createOpportunity}
                            className="workspace-dashboard__card-action"
                          >
                            Create Opportunity
                          </button>
                        </div>
                      </div>
                      {loadingOpportunities ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                          Loading opportunities...
                        </div>
                      ) : opportunities.length > 0 ? (
                        <div>
                          {(showAllOpportunities ? opportunities : opportunities.slice(0, 5)).map((opp) => (
                            <div key={opp.id} className="workspace-dashboard__card-content">
                              <div className="workspace-dashboard__card-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div className="workspace-dashboard__card-item-title">{opp.name}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button
                                      onClick={() => {
                                        setSelectedOpportunity(opp);
                                        setActivityFormData({
                                          subject: '',
                                          activityDate: new Date().toISOString().split('T')[0],
                                          description: '',
                                          saActivity: ''
                                        });
                                        setShowLogActivityModal(true);
                                      }}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.75rem',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '4px',
                                        background: 'var(--color-bg)',
                                        color: 'var(--color-text-primary)',
                                        cursor: 'pointer'
                                      }}
                                      title="Log SA Activity"
                                    >
                                      Log Activity
                                    </button>
                                    <button
                                      onClick={() => sendToChat(`Help me log an SA activity for opportunity "${opp.name}" (Opportunity ID: ${opp.id}, Account ID: ${selectedAccount?.id})`)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-text-secondary)',
                                        opacity: 0.6,
                                        cursor: 'pointer',
                                        padding: '0.25rem'
                                      }}
                                      title="Send to chat"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                      </svg>
                                    </button>
                                    <a
                                      href={`${SALESFORCE_BASE_URL}/lightning/r/Opportunity/${opp.id}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: 'var(--color-primary)',
                                        fontSize: '1rem',
                                        textDecoration: 'none'
                                      }}
                                      title="Open in Salesforce"
                                    >
                                      ↗
                                    </a>
                                  </div>
                                </div>
                                <div className="workspace-dashboard__card-item-meta">
                                  <span>Stage: {opp.stageName}</span>
                                  {opp.amount && <span> • Amount: ${opp.amount.toLocaleString()}</span>}
                                  <span> • Close: {new Date(opp.closeDate).toLocaleDateString()}</span>
                                  <span> • Probability: {opp.probability}%</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {opportunities.length > 5 && (
                            <div className="workspace-dashboard__card-content">
                              <button
                                onClick={() => setShowAllOpportunities(!showAllOpportunities)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  padding: '0.5rem',
                                  fontSize: '0.875rem'
                                }}
                              >
                                {showAllOpportunities ? 'Show less' : `Show ${opportunities.length - 5} more`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="workspace-dashboard__card-content">
                          <div className="workspace-dashboard__card-item">
                            <div className="workspace-dashboard__list-item-meta">No opportunities found</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tasks Section */}
                    <div style={{ flex: 1 }}>
                      <div className="workspace-dashboard__card-header">
                        <h3 className="workspace-dashboard__card-title">Tasks ({tasks.length})</h3>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => sendToChat(`Help me create a new task for account ${selectedAccount?.name}`)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-secondary)',
                              opacity: 0.6,
                              cursor: 'pointer',
                              padding: '0.25rem'
                            }}
                            title="Send to chat"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={createTask}
                            className="workspace-dashboard__card-action"
                          >
                            Create Task
                          </button>
                        </div>
                      </div>
                      {loadingTasks ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                          Loading tasks...
                        </div>
                      ) : tasks.length > 0 ? (
                        <div>
                          {(showAllTasks ? tasks : tasks.slice(0, 5)).map((task) => (
                            <div key={task.id} className="workspace-dashboard__card-content">
                              <div className="workspace-dashboard__card-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div className="workspace-dashboard__card-item-title">{task.subject}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button
                                      onClick={() => sendToChat(`Help me with task "${task.subject}" (Task ID: ${task.id}, Account ID: ${selectedAccount?.id})`)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-text-secondary)',
                                        opacity: 0.6,
                                        cursor: 'pointer',
                                        padding: '0.25rem'
                                      }}
                                      title="Send to chat"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                      </svg>
                                    </button>
                                    <a
                                      href={`${SALESFORCE_BASE_URL}/lightning/r/Task/${task.id}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: 'var(--color-primary)',
                                        fontSize: '1rem',
                                        textDecoration: 'none'
                                      }}
                                      title="Open in Salesforce"
                                    >
                                      ↗
                                    </a>
                                  </div>
                                </div>
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '0.5rem', 
                                  marginTop: '0.5rem',
                                  flexWrap: 'wrap'
                                }}>
                                  <span style={{
                                    padding: '0.125rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    background: task.isClosed ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                                    color: task.isClosed ? 'var(--color-success)' : 'var(--color-warning)'
                                  }}>
                                    {task.status}
                                  </span>
                                  {task.type && (
                                    <span style={{
                                      padding: '0.125rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      background: 'var(--bg-tertiary)',
                                      color: 'var(--text-secondary)'
                                    }}>
                                      {task.type}
                                    </span>
                                  )}
                                </div>
                                {task.sa_Activity__c && (
                                  <div style={{ 
                                    fontSize: '0.8125rem', 
                                    color: 'var(--color-primary)', 
                                    marginTop: '0.375rem',
                                    fontWeight: '500'
                                  }}>
                                    {task.sa_Activity__c}
                                  </div>
                                )}
                                {task.what && (
                                  <div style={{ 
                                    fontSize: '0.8125rem', 
                                    color: 'var(--text-secondary)', 
                                    marginTop: '0.25rem'
                                  }}>
                                    Related: {task.what.name}
                                  </div>
                                )}
                                <div className="workspace-dashboard__card-item-meta" style={{ marginTop: '0.375rem' }}>
                                  {task.activityDate && (
                                    <span>Due: {new Date(task.activityDate).toLocaleDateString()}</span>
                                  )}
                                  {task.createdDate && (
                                    <span>{task.activityDate ? ' • ' : ''}Created: {new Date(task.createdDate).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {tasks.length > 5 && (
                            <div className="workspace-dashboard__card-content">
                              <button
                                onClick={() => setShowAllTasks(!showAllTasks)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  padding: '0.5rem',
                                  fontSize: '0.875rem'
                                }}
                              >
                                {showAllTasks ? 'Show less' : `Show ${tasks.length - 5} more`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="workspace-dashboard__card-content">
                          <div className="workspace-dashboard__card-item">
                            <div className="workspace-dashboard__list-item-meta">No tasks found</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="workspace-dashboard__empty">
              <div>
                <div className="workspace-dashboard__empty-title">Select an Account</div>
                <div className="workspace-dashboard__empty-subtitle">
                  Search for accounts by {searchType === 'owner' ? 'owner name' : 'territory'}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
    
    <LeadershipInsightModal
      isOpen={showLeadershipModal}
      onClose={() => setShowLeadershipModal(false)}
      agentSlug={agentSlug}
    />
    </>
  );
}
