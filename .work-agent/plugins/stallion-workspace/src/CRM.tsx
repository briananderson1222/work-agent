import { useState, useEffect, useCallback } from 'react';
import { useToast, useSDK, transformTool, useAgents, useSendMessage, useNavigation, useWorkspaceNavigation } from '@stallion-ai/sdk';
import '../../plugins/shared/workspace.css';

const SALESFORCE_BASE_URL = 'https://aws-crm.lightning.force.com';

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
  Id: string;
  Subject: string;
  Status: string;
  ActivityDate?: string;
  Description?: string;
  Priority?: string;
  sa_Activity__c?: string;
  Type?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CRMProps {
  onSendToChat?: (text: string, agent?: string) => void;
  activeTab?: any; // Will be defined when this tab is active
}

export function CRM({ onSendToChat, activeTab }: CRMProps) {
  console.log('[CRM] Component render start, activeTab:', !!activeTab);
  
  const { showToast } = useToast();
  const { apiBase } = useSDK();
  const { getTabState, setTabState } = useWorkspaceNavigation();
  const agentSlug = 'stallion-workspace:work-agent';
  const isActive = !!activeTab;
  
  console.log('[CRM] After hooks, hash:', window.location.hash);
  
  const [ownerSearch, setOwnerSearch] = useState('');
  const [activeOwnerSearches, setActiveOwnerSearches] = useState<string[]>(() => {
    const stored = localStorage.getItem('sfdc-active-owner-searches');
    return stored ? JSON.parse(stored) : [];
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [selectedGeos, setSelectedGeos] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');

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

  const searchAccounts = async (forceRefresh = false) => {
    if (!ownerSearch.trim()) return;
    
    const searchValue = ownerSearch; // Store before clearing
    const cacheKey = getCacheKey('accounts', searchValue);
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setAccounts(JSON.parse(cached));
        setOwnerSearch(''); // Clear search box
        
        // Add to active searches
        const newActiveSearches = [...new Set([...activeOwnerSearches, searchValue])];
        setActiveOwnerSearches(newActiveSearches);
        localStorage.setItem('sfdc-active-owner-searches', JSON.stringify(newActiveSearches));
        return;
      }
    }
    
    setLoading(true);
    setSearchError(null);
    try {
      // Split by comma and trim whitespace
      const owners = searchValue.split(',').map(owner => owner.trim()).filter(owner => owner);
      
      // Search for each owner in parallel
      const searchPromises = owners.map(owner =>
        transformTool(apiBase, agentSlug, 'sat-sfdc_search_accounts',
          { owner, ownerFilterType: 'CONTAINS_WORD' },
          `(data) => data || []`
        )
      );
      
      const results = await Promise.all(searchPromises);
      
      // Combine new results with existing accounts
      const newAccounts = results.flat();
      const combinedAccounts = [...accounts, ...newAccounts];
      
      // Remove duplicates by id
      const uniqueAccounts = combinedAccounts.filter((account, index, self) => 
        index === self.findIndex(a => a.id === account.id)
      );
      
      setAccounts(uniqueAccounts);
      
      // Check if any owner returned no results
      const emptyOwners = owners.filter((owner, index) => !results[index] || results[index].length === 0);
      if (emptyOwners.length > 0) {
        setSearchError(`No accounts found for: ${emptyOwners.join(', ')}`);
      } else {
        setSearchError(null); // Clear any previous error
      }
      
      // Cache and save to localStorage if we got any results
      if (newAccounts.length > 0) {
        sessionStorage.setItem(cacheKey, JSON.stringify(newAccounts));
        
        // Add new searches to active list (avoid duplicates)
        const newActiveSearches = [...new Set([...activeOwnerSearches, searchValue])];
        setActiveOwnerSearches(newActiveSearches);
        localStorage.setItem('sfdc-active-owner-searches', JSON.stringify(newActiveSearches));
        
        setOwnerSearch(''); // Clear search box after successful search
      }
    } catch (error) {
      console.error('Failed to search accounts:', error);
      setSearchError('Failed to search accounts');
      showToast('Failed to search accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountDetails = async (account: Account, forceRefresh = false) => {
    console.log('[CRM] loadAccountDetails called for:', account.id);
    setSelectedAccount(account);
    
    // Save account state to provider - no hash manipulation
    const accountHash = `account/${account.id}`;
    console.log('[CRM] Saving account state to provider:', accountHash);
    setTabState('crm', accountHash);
    
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
    
    setLoading(true);
    
    try {
      // Load opportunities and tasks in parallel
      const [oppsResult, tasksResult] = await Promise.all([
        transformTool(apiBase, agentSlug, 'sat-sfdc_get_opportunities_for_account',
          { accountId: account.id },
          `(data) => data.opportunities || data.response || data || []`
        ),
        transformTool(apiBase, agentSlug, 'sat-sfdc_list_user_tasks',
          { accountId: account.id },
          `(data) => data.tasks || data.records || data || []`
        )
      ]);

      setOpportunities(oppsResult || []);
      setTasks(tasksResult || []);
      
      // Cache results
      sessionStorage.setItem(oppsCacheKey, JSON.stringify(oppsResult || []));
      sessionStorage.setItem(tasksCacheKey, JSON.stringify(tasksResult || []));
    } catch (error) {
      console.error('Failed to load account details:', error);
      showToast('Failed to load account details', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-search on mount if active searches exist
  useEffect(() => {
    console.log('[CRM] Mount useEffect triggered');
    if (activeOwnerSearches.length > 0) {
      console.log('[CRM] Loading cached accounts for searches:', activeOwnerSearches);
      // Load all cached results
      const allAccounts = [];
      for (const search of activeOwnerSearches) {
        const cached = sessionStorage.getItem(getCacheKey('accounts', search));
        if (cached) {
          allAccounts.push(...JSON.parse(cached));
        }
      }
      // Remove duplicates
      const uniqueAccounts = allAccounts.filter((account, index, self) => 
        index === self.findIndex(a => a.id === account.id)
      );
      setAccounts(uniqueAccounts);
      console.log('[CRM] Set accounts');
      
      // Restore selected account from sessionStorage
      const storedState = getTabState('crm');
      console.log('[CRM] Checking stored state for account restoration:', storedState);
      if (storedState && storedState.startsWith('account/')) {
        const accountId = storedState.replace('account/', '');
        const account = uniqueAccounts.find(a => a.id === accountId);
        console.log('[CRM] Found account for restoration:', !!account, accountId);
        if (account) {
          setSelectedAccount(account);
          // Scroll to the account in the list
          setTimeout(() => {
            const accountElement = document.querySelector(`[data-account-id="${accountId}"]`);
            if (accountElement) {
              accountElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 100);
        }
      }
    }
    console.log('[CRM] Mount useEffect complete');
  }, []); // Empty dependency array - only run on mount

  // Restore selected account from tab navigation state when accounts are loaded
  useEffect(() => {
    console.log('[CRM] Account restoration useEffect triggered');
    console.log('[CRM] Account restoration check:', { accountsLength: accounts.length, selectedAccount: selectedAccount?.id });
    if (accounts.length > 0 && !selectedAccount) {
      const state = getTabState('crm');
      console.log('[CRM] Got tab state:', state);
      if (state.startsWith('account/')) {
        const accountId = state.replace('account/', '');
        const account = accounts.find(a => a.id === accountId);
        console.log('[CRM] Looking for account:', accountId, 'found:', !!account);
        if (account) {
          console.log('[CRM] Restoring selected account:', account.id);
          setSelectedAccount(account);
        }
      }
    }
    console.log('[CRM] Account restoration useEffect complete');
  }, [accounts, selectedAccount, getTabState]);

  const handleRefresh = async () => {
    // Clear all account-related cache
    activeOwnerSearches.forEach(search => {
      sessionStorage.removeItem(getCacheKey('accounts', search));
    });
    
    // Clear account details cache
    accounts.forEach(account => {
      sessionStorage.removeItem(getCacheKey('account-details', account.id));
      sessionStorage.removeItem(getCacheKey('opportunities', account.id));
      sessionStorage.removeItem(getCacheKey('tasks', account.id));
    });
    
    // Clear current state
    setAccounts([]);
    setOpportunities([]);
    setTasks([]);
    setSearchError(null);
    
    // Refetch all active owner searches
    if (activeOwnerSearches.length > 0) {
      setLoading(true);
      try {
        const allAccounts = [];
        for (const search of activeOwnerSearches) {
          const owners = search.split(',').map(owner => owner.trim()).filter(owner => owner);
          const searchPromises = owners.map(owner =>
            transformTool(apiBase, agentSlug, 'sat-sfdc_search_accounts',
              { owner, ownerFilterType: 'CONTAINS_WORD' },
              `(data) => data || []`
            )
          );
          const results = await Promise.all(searchPromises);
          const searchAccounts = results.flat();
          allAccounts.push(...searchAccounts);
          
          // Cache the results
          sessionStorage.setItem(getCacheKey('accounts', search), JSON.stringify(searchAccounts));
        }
        
        // Remove duplicates and set accounts
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
    }
  };

  const createOpportunity = () => {
    if (!selectedAccount) return;
    onSendToChat?.(`Create a new opportunity for account ${selectedAccount.name}`, agentSlug);
  };

  const createTask = () => {
    if (!selectedAccount) return;
    onSendToChat?.(`Create a new task for account ${selectedAccount.name}`, agentSlug);
  };

  return (
    <div className="workspace-container">
      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__sidebar">
          <div className="workspace-dashboard__sidebar-header">
            <h3>Accounts</h3>
            <div className="workspace-dashboard__search" style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Owner name (First Last)..."
                value={ownerSearch}
                onChange={(e) => {
                  setOwnerSearch(e.target.value);
                  if (searchError) setSearchError(null); // Clear error when typing
                }}
                onKeyPress={(e) => e.key === 'Enter' && searchAccounts()}
                style={{
                  width: '100%',
                  padding: '0.5rem 4rem 0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
              {ownerSearch && (
                <button
                  onClick={() => {
                    setOwnerSearch('');
                    if (searchError) setSearchError(null);
                  }}
                  style={{
                    position: 'absolute',
                    right: '2.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    fontSize: '1rem',
                    lineHeight: 1,
                    opacity: 0.6
                  }}
                  title="Clear"
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  ×
                </button>
              )}
              <button
                onClick={searchAccounts}
                disabled={loading || !ownerSearch.trim()}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--color-primary)',
                  border: 'none',
                  color: 'white',
                  cursor: ownerSearch.trim() ? 'pointer' : 'not-allowed',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.875rem',
                  borderRadius: '4px',
                  opacity: ownerSearch.trim() ? 1 : 0.5
                }}
                title="Search"
              >
                →
              </button>
            </div>
            {accounts.length > 0 && activeOwnerSearches.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {activeOwnerSearches.map((search, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      background: 'var(--color-primary)',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: 500
                    }}
                  >
                    Owner: "{search}"
                    <button
                      onClick={async () => {
                        // Remove this search from active list
                        const newActiveSearches = activeOwnerSearches.filter(s => s !== search);
                        setActiveOwnerSearches(newActiveSearches);
                        localStorage.setItem('sfdc-active-owner-searches', JSON.stringify(newActiveSearches));
                        
                        // If no more active searches, clear everything
                        if (newActiveSearches.length === 0) {
                          setAccounts([]);
                          // Don't clear selectedAccount - let it persist via hash
                        } else {
                          // Reload accounts from remaining searches
                          const allAccounts = [];
                          for (const s of newActiveSearches) {
                            const cached = sessionStorage.getItem(getCacheKey('accounts', s));
                            if (cached) {
                              allAccounts.push(...JSON.parse(cached));
                            }
                          }
                          // Remove duplicates
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
                        marginLeft: '0.25rem',
                        fontSize: '0.9rem',
                        lineHeight: 1
                      }}
                      title="Remove this owner filter"
                    >
                      ×
                    </button>
                  </span>
                ))}
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
                        Showing {filteredAccounts.length} of {accounts.length} accounts
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
              filteredAccounts.map((account) => (
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
                  style={{ position: 'relative' }}
                >
                  <div className="workspace-dashboard__list-item-title">
                    {account.name}
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
                  <div style={{
                    position: 'absolute',
                    top: '0.25rem',
                    right: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {account.owner?.name && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        background: 'var(--color-bg)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)'
                      }}>
                        {account.owner.name}
                      </span>
                    )}
                    <a
                      href={`${SALESFORCE_BASE_URL}/lightning/r/Account/${account.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--color-text-secondary)',
                        opacity: 0.6,
                        cursor: 'pointer',
                        textDecoration: 'none'
                      }}
                      title="Open in Salesforce"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>
                </div>
              ))
            ) : !loading && accounts.length === 0 && !searchError ? (
              <div className="workspace-dashboard__empty">
                <div>
                  <div className="workspace-dashboard__empty-title">No Accounts</div>
                  <div className="workspace-dashboard__empty-subtitle">Search for accounts by owner name to get started</div>
                </div>
              </div>
            ) : null}
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-primary)',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                  title="Open in Salesforce"
                >
                  Open in Salesforce →
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
                        <button
                          onClick={createOpportunity}
                          className="workspace-dashboard__card-action"
                        >
                          Create Opportunity
                        </button>
                      </div>
                      {opportunities.length > 0 ? (
                        <div>
                          {(showAllOpportunities ? opportunities : opportunities.slice(0, 5)).map((opp) => (
                            <div key={opp.id} className="workspace-dashboard__card-content">
                              <div className="workspace-dashboard__card-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div className="workspace-dashboard__card-item-title">{opp.name}</div>
                                  <a
                                    href={`${SALESFORCE_BASE_URL}/lightning/r/Opportunity/${opp.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: 'var(--color-text-secondary)',
                                      opacity: 0.6,
                                      cursor: 'pointer',
                                      textDecoration: 'none',
                                      marginLeft: '0.5rem'
                                    }}
                                    title="Open in Salesforce"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                      <polyline points="15 3 21 3 21 9"></polyline>
                                      <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                  </a>
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
                        <button
                          onClick={createTask}
                          className="workspace-dashboard__card-action"
                        >
                          Create Task
                        </button>
                      </div>
                      {tasks.length > 0 ? (
                        <div>
                          {(showAllTasks ? tasks : tasks.slice(0, 5)).map((task) => (
                            <div key={task.Id} className="workspace-dashboard__card-content">
                              <div className="workspace-dashboard__card-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div className="workspace-dashboard__card-item-title">{task.Subject}</div>
                                  <a
                                    href={`${SALESFORCE_BASE_URL}/lightning/r/Task/${task.Id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: 'var(--color-text-secondary)',
                                      opacity: 0.6,
                                      cursor: 'pointer',
                                      textDecoration: 'none',
                                      marginLeft: '0.5rem'
                                    }}
                                    title="Open in Salesforce"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                      <polyline points="15 3 21 3 21 9"></polyline>
                                      <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                  </a>
                                </div>
                                {task.sa_Activity__c && (
                                  <div style={{ 
                                    fontSize: '0.875rem', 
                                    color: 'var(--color-text-secondary)', 
                                    marginTop: '0.25rem',
                                    fontWeight: '500'
                                  }}>
                                    SA Activity: {task.sa_Activity__c}
                                  </div>
                                )}
                                <div className="workspace-dashboard__card-item-meta">
                                  <span>Status: {task.Status}</span>
                                  {task.Type && <span> • Type: {task.Type}</span>}
                                  {task.ActivityDate && (
                                    <span> • Due: {new Date(task.ActivityDate).toLocaleDateString()}</span>
                                  )}
                                  {task.CreatedDate && (
                                    <span> • Created: {new Date(task.CreatedDate).toLocaleDateString()}</span>
                                  )}
                                  {task.LastModifiedDate && (
                                    <span> • Modified: {new Date(task.LastModifiedDate).toLocaleDateString()}</span>
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
                <div className="workspace-dashboard__empty-subtitle">Search for accounts by owner name and click to view details</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
