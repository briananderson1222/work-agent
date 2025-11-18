import { useState, useEffect } from 'react';
import { useAgent, useSendMessage, useNavigation, useToast } from '@stallion-ai/sdk';

const SALESFORCE_BASE_URL = 'https://aws-crm.lightning.force.com';
const API_BASE = 'http://localhost:3141';

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
}

export function CRM() {
  const agent = useAgent('stallion-workspace:work-agent');
  const sendMessage = useSendMessage();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

  const [ownerSearch, setOwnerSearch] = useState('');
  const [activeOwnerSearches, setActiveOwnerSearches] = useState<string[]>(() => {
    const stored = localStorage.getItem('stallion-crm-active-owner-searches');
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

  const getCacheKey = (type: string, key: string) => `stallion-crm-${type}-${key}`;

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

  const transformAccounts = async (owner: string): Promise<Account[]> => {
    const response = await fetch(
      `${API_BASE}/agents/stallion-workspace:work-agent/invoke/transform`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'sat-sfdc_search_accounts',
          toolArgs: { owner, ownerFilterType: 'CONTAINS_WORD' },
          transform: `(data) => data || []`
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.response || [];
  };

  const transformOpportunities = async (accountId: string): Promise<Opportunity[]> => {
    const response = await fetch(
      `${API_BASE}/agents/stallion-workspace:work-agent/invoke/transform`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'sat-sfdc_get_opportunities_for_account',
          toolArgs: { accountId },
          transform: `(data) => data.opportunities || data.response || data || []`
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.response || [];
  };

  const transformTasks = async (accountId: string): Promise<Task[]> => {
    const response = await fetch(
      `${API_BASE}/agents/stallion-workspace:work-agent/invoke/transform`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'sat-sfdc_list_user_tasks',
          toolArgs: { accountId },
          transform: `(data) => data.tasks || data.records || data || []`
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.response || [];
  };

  const searchAccounts = async (forceRefresh = false) => {
    if (!ownerSearch.trim()) return;
    
    const searchValue = ownerSearch;
    const cacheKey = getCacheKey('accounts', searchValue);
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const cachedAccounts = JSON.parse(cached);
        setAccounts(prev => {
          const combined = [...prev, ...cachedAccounts];
          return combined.filter((account, index, self) => 
            index === self.findIndex(a => a.id === account.id)
          );
        });
        setOwnerSearch('');
        
        // Add to active searches
        const newActiveSearches = [...new Set([...activeOwnerSearches, searchValue])];
        setActiveOwnerSearches(newActiveSearches);
        localStorage.setItem('stallion-crm-active-owner-searches', JSON.stringify(newActiveSearches));
        return;
      }
    }
    
    setLoading(true);
    setSearchError(null);
    try {
      // Split by comma and trim whitespace
      const owners = searchValue.split(',').map(owner => owner.trim()).filter(owner => owner);
      
      // Search for each owner in parallel
      const searchPromises = owners.map(owner => transformAccounts(owner));
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
        setSearchError(null);
      }
      
      // Cache and save to localStorage if we got any results
      if (newAccounts.length > 0) {
        sessionStorage.setItem(cacheKey, JSON.stringify(newAccounts));
        
        // Add to active searches
        const newActiveSearches = [...new Set([...activeOwnerSearches, searchValue])];
        setActiveOwnerSearches(newActiveSearches);
        localStorage.setItem('stallion-crm-active-owner-searches', JSON.stringify(newActiveSearches));
      }
      
      setOwnerSearch('');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      showToast('Failed to search accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountDetails = async (account: Account) => {
    setSelectedAccount(account);
    setLoading(true);
    
    try {
      // Load opportunities and tasks in parallel
      const [oppsResult, tasksResult] = await Promise.all([
        transformOpportunities(account.id),
        transformTasks(account.id)
      ]);
      
      setOpportunities(oppsResult);
      setTasks(tasksResult);
    } catch (err) {
      showToast('Failed to load account details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearActiveSearch = (searchTerm: string) => {
    const newActiveSearches = activeOwnerSearches.filter(s => s !== searchTerm);
    setActiveOwnerSearches(newActiveSearches);
    localStorage.setItem('stallion-crm-active-owner-searches', JSON.stringify(newActiveSearches));
    
    // Remove accounts from this search
    const cacheKey = getCacheKey('accounts', searchTerm);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const cachedAccounts = JSON.parse(cached);
      const cachedIds = new Set(cachedAccounts.map((acc: Account) => acc.id));
      setAccounts(prev => prev.filter(acc => !cachedIds.has(acc.id)));
      sessionStorage.removeItem(cacheKey);
    }
  };

  const clearAllSearches = () => {
    setActiveOwnerSearches([]);
    setAccounts([]);
    setSelectedAccount(null);
    setOpportunities([]);
    setTasks([]);
    localStorage.removeItem('stallion-crm-active-owner-searches');
    
    // Clear all cached searches
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('stallion-crm-accounts-')) {
        sessionStorage.removeItem(key);
      }
    }
  };

  const refreshAllSearches = async () => {
    if (activeOwnerSearches.length === 0) return;
    
    setLoading(true);
    try {
      const allAccounts = [];
      for (const search of activeOwnerSearches) {
        const owners = search.split(',').map(owner => owner.trim()).filter(owner => owner);
        const searchPromises = owners.map(owner => transformAccounts(owner));
        const results = await Promise.all(searchPromises);
        allAccounts.push(...results.flat());
      }
      
      // Remove duplicates by id
      const uniqueAccounts = allAccounts.filter((account, index, self) => 
        index === self.findIndex(a => a.id === account.id)
      );
      
      setAccounts(uniqueAccounts);
      
      // Update cache for each search
      for (const search of activeOwnerSearches) {
        const owners = search.split(',').map(owner => owner.trim()).filter(owner => owner);
        const searchPromises = owners.map(owner => transformAccounts(owner));
        const results = await Promise.all(searchPromises);
        const searchAccounts = results.flat();
        
        const cacheKey = getCacheKey('accounts', search);
        sessionStorage.setItem(cacheKey, JSON.stringify(searchAccounts));
      }
      
      showToast('All searches refreshed successfully', 'success');
    } catch (err) {
      showToast('Failed to refresh searches', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const openInSalesforce = (id: string, type: 'account' | 'opportunity' | 'task') => {
    const baseUrl = SALESFORCE_BASE_URL;
    let path = '';
    
    switch (type) {
      case 'account':
        path = `/lightning/r/Account/${id}/view`;
        break;
      case 'opportunity':
        path = `/lightning/r/Opportunity/${id}/view`;
        break;
      case 'task':
        path = `/lightning/r/Task/${id}/view`;
        break;
    }
    
    window.open(`${baseUrl}${path}`, '_blank');
  };

  return (
    <div className="crm-workspace">
      <div className="crm-header">
        <h2>CRM</h2>
        <div className="search-section">
          <div className="owner-search">
            <input
              type="text"
              placeholder="Search by owner name (comma-separated for multiple)"
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchAccounts()}
            />
            <button onClick={() => searchAccounts()} disabled={loading || !ownerSearch.trim()}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          
          {activeOwnerSearches.length > 0 && (
            <div className="active-searches">
              <span>Active searches:</span>
              {activeOwnerSearches.map(search => (
                <span key={search} className="search-tag">
                  {search}
                  <button onClick={() => clearActiveSearch(search)}>×</button>
                </span>
              ))}
              <button onClick={clearAllSearches} className="clear-all">Clear All</button>
              <button onClick={refreshAllSearches} className="refresh-all" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh All'}
              </button>
            </div>
          )}
          
          {searchError && (
            <div className="search-error">{searchError}</div>
          )}
        </div>
      </div>

      <div className="crm-content">
        <div className="accounts-section">
          <div className="accounts-header">
            <h3>Accounts ({filteredAccounts.length})</h3>
            <button onClick={() => setFilterExpanded(!filterExpanded)}>
              Filters {filterExpanded ? '▼' : '▶'}
            </button>
          </div>
          
          {filterExpanded && (
            <div className="account-filters">
              <input
                type="text"
                placeholder="Filter by name..."
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
              
              {allGeos.length > 0 && (
                <div className="filter-group">
                  <h4>Geography:</h4>
                  {allGeos.map(geo => (
                    <label key={geo}>
                      <input
                        type="checkbox"
                        checked={selectedGeos.has(geo)}
                        onChange={(e) => {
                          const newGeos = new Set(selectedGeos);
                          if (e.target.checked) {
                            newGeos.add(geo);
                          } else {
                            newGeos.delete(geo);
                          }
                          setSelectedGeos(newGeos);
                        }}
                      />
                      {geo}
                    </label>
                  ))}
                </div>
              )}
              
              {allSizes.length > 0 && (
                <div className="filter-group">
                  <h4>Size:</h4>
                  {allSizes.map(size => (
                    <label key={size}>
                      <input
                        type="checkbox"
                        checked={selectedSizes.has(size)}
                        onChange={(e) => {
                          const newSizes = new Set(selectedSizes);
                          if (e.target.checked) {
                            newSizes.add(size);
                          } else {
                            newSizes.delete(size);
                          }
                          setSelectedSizes(newSizes);
                        }}
                      />
                      {size}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="accounts-list">
            {filteredAccounts.length === 0 ? (
              <div className="empty-state">
                <p>No accounts found. Search by owner name to get started.</p>
                <button onClick={() => setDockState(true)}>
                  Ask Work Agent
                </button>
              </div>
            ) : (
              filteredAccounts.map((account) => (
                <div
                  key={account.id}
                  className={`account-card ${selectedAccount?.id === account.id ? 'selected' : ''}`}
                  onClick={() => loadAccountDetails(account)}
                >
                  <div className="account-name">{account.name}</div>
                  {account.owner && (
                    <div className="account-owner">Owner: {account.owner.name}</div>
                  )}
                  {account.website && (
                    <div className="account-website">{account.website}</div>
                  )}
                  {account.geo_Text__c && (
                    <div className="account-geo">Geo: {account.geo_Text__c}</div>
                  )}
                  {account.awsci_customer?.customerRevenue?.tShirtSize && (
                    <div className="account-size">Size: {account.awsci_customer.customerRevenue.tShirtSize}</div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openInSalesforce(account.id, 'account');
                    }}
                    className="sf-link"
                  >
                    Open in Salesforce
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedAccount && (
          <div className="account-details">
            <h3>{selectedAccount.name} - Details</h3>
            
            <div className="opportunities-section">
              <h4>Opportunities ({opportunities.length})</h4>
              {opportunities.length === 0 ? (
                <p>No opportunities found</p>
              ) : (
                <div className="opportunities-list">
                  {(showAllOpportunities ? opportunities : opportunities.slice(0, 5)).map((opp) => (
                    <div key={opp.id} className="opportunity-card">
                      <div className="opportunity-name">{opp.name}</div>
                      <div className="opportunity-details">
                        <span className="amount">{formatCurrency(opp.amount)}</span>
                        <span className="stage">{opp.stageName}</span>
                        <span className="probability">{opp.probability}%</span>
                        <span className="close-date">Close: {formatDate(opp.closeDate)}</span>
                      </div>
                      <div className="opportunity-owner">Owner: {opp.owner.name}</div>
                      <button
                        onClick={() => openInSalesforce(opp.id, 'opportunity')}
                        className="sf-link"
                      >
                        Open in Salesforce
                      </button>
                    </div>
                  ))}
                  {opportunities.length > 5 && (
                    <button onClick={() => setShowAllOpportunities(!showAllOpportunities)}>
                      {showAllOpportunities ? 'Show Less' : `Show ${opportunities.length - 5} More`}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="tasks-section">
              <h4>Tasks ({tasks.length})</h4>
              {tasks.length === 0 ? (
                <p>No tasks found</p>
              ) : (
                <div className="tasks-list">
                  {(showAllTasks ? tasks : tasks.slice(0, 5)).map((task) => (
                    <div key={task.Id} className="task-card">
                      <div className="task-subject">{task.Subject}</div>
                      <div className="task-details">
                        <span className="status">Status: {task.Status}</span>
                        {task.Priority && <span className="priority">Priority: {task.Priority}</span>}
                        {task.ActivityDate && <span className="due-date">Due: {formatDate(task.ActivityDate)}</span>}
                      </div>
                      {task.Description && (
                        <div className="task-description">{task.Description}</div>
                      )}
                      <button
                        onClick={() => openInSalesforce(task.Id, 'task')}
                        className="sf-link"
                      >
                        Open in Salesforce
                      </button>
                    </div>
                  ))}
                  {tasks.length > 5 && (
                    <button onClick={() => setShowAllTasks(!showAllTasks)}>
                      {showAllTasks ? 'Show Less' : `Show ${tasks.length - 5} More`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="quick-actions">
        <button onClick={() => {
          setDockState(true);
          sendMessage('Show me my pipeline summary', 'stallion-workspace:work-agent');
        }}>
          Pipeline Summary
        </button>
        <button onClick={() => {
          setDockState(true);
          sendMessage('What accounts need attention?', 'stallion-workspace:work-agent');
        }}>
          Accounts Needing Attention
        </button>
        <button onClick={() => {
          setDockState(true);
          sendMessage('Show me my top opportunities by value', 'stallion-workspace:work-agent');
        }}>
          Top Opportunities
        </button>
      </div>
    </div>
  );
}
