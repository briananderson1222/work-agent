import { useState, useEffect } from 'react';
import { useSDK, useAgents, useWorkspace, type WorkspaceProps } from '@stallion-ai/sdk';
import '../shared/workspace.css';

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

interface SFDCAccountManagerProps extends WorkspaceProps {
  agent?: any;
  onSendToChat?: (text: string, agent?: string) => void;
}

export default function SFDCAccountManager(props: SFDCAccountManagerProps) {
  const sdk = useSDK();
  const agents = useAgents();
  const agentSlug = 'sa-agent';
  const { onSendToChat } = props;
  
  const [ownerSearch, setOwnerSearch] = useState(() => 
    localStorage.getItem('sfdc-owner-search') || ''
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [selectedGeos, setSelectedGeos] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');

  // Auto-search on mount if owner search is populated
  useEffect(() => {
    if (ownerSearch.trim()) {
      searchAccounts();
    }
  }, []); // Empty dependency array - only run on mount

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
    
    const cacheKey = getCacheKey('accounts', ownerSearch);
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setAccounts(JSON.parse(cached));
        return;
      }
    }
    
    setLoading(true);
    setSearchError(null);
    try {
      // Split by comma and trim whitespace
      const owners = ownerSearch.split(',').map(owner => owner.trim()).filter(owner => owner);
      
      // Search for each owner in parallel
      const searchPromises = owners.map(owner =>
        agents.transform(agentSlug, 'sat-sfdc_search_accounts',
          { owner, ownerFilterType: 'CONTAINS_WORD' },
          `(data) => data || []`
        )
      );
      
      const results = await Promise.all(searchPromises);
      
      // Combine all results and remove duplicates by id
      const allAccounts = results.flat();
      const uniqueAccounts = allAccounts.filter((account, index, self) => 
        index === self.findIndex(a => a.id === account.id)
      );
      
      setAccounts(uniqueAccounts);
      
      // Check if any owner returned no results
      if (uniqueAccounts.length === 0) {
        const emptyOwners = owners.filter((owner, index) => !results[index] || results[index].length === 0);
        setSearchError(`No accounts found for: ${emptyOwners.join(', ')}`);
      } else {
        // Only cache and save to localStorage if ALL owners returned results
        const allHaveResults = results.every(result => result && result.length > 0);
        if (allHaveResults) {
          sessionStorage.setItem(cacheKey, JSON.stringify(uniqueAccounts));
          localStorage.setItem('sfdc-owner-search', ownerSearch);
        }
      }
    } catch (error) {
      console.error('Failed to search accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAccountDetails = async (account: Account, forceRefresh = false) => {
    setSelectedAccount(account);
    
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
        agents.transform(agentSlug, 'sat-sfdc_get_opportunities_for_account',
          { accountId: account.id, limit: 10 },
          `(data) => data.response || []`
        ),
        agents.transform(agentSlug, 'sat-sfdc_list_user_tasks',
          { accountId: account.id, limit: 10 },
          `(data) => data.tasks || []`
        )
      ]);

      setOpportunities(oppsResult || []);
      setTasks(tasksResult || []);
      
      // Cache results
      sessionStorage.setItem(oppsCacheKey, JSON.stringify(oppsResult || []));
      sessionStorage.setItem(tasksCacheKey, JSON.stringify(tasksResult || []));
    } catch (error) {
      console.error('Failed to load account details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedAccount) {
      loadAccountDetails(selectedAccount, true);
    }
    if (ownerSearch) {
      searchAccounts(true);
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
      <header className="workspace-dashboard__header">
        <div>
          <h2>Salesforce Accounts</h2>
          <p>Account management with opportunities and tasks</p>
        </div>
        <div className="workspace-dashboard__actions">
          <button 
            className="workspace-dashboard__action" 
            onClick={handleRefresh}
            disabled={loading}
            type="button"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__sidebar">
          <div className="workspace-dashboard__sidebar-header">
            <h3>Accounts</h3>
            <div className="workspace-dashboard__search">
              <input
                type="text"
                placeholder="Enter full name(s) (First Last, First Last)..."
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchAccounts()}
              />
              <button
                onClick={searchAccounts}
                disabled={loading || !ownerSearch.trim()}
              >
                Search
              </button>
            </div>
            
            {/* Filter Bar */}
            {accounts.length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                <div 
                  onClick={() => setFilterExpanded(!filterExpanded)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer'
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
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: 'var(--color-text-secondary)',
                        color: '#fff'
                      }}>
                        "{nameFilter}"
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
            {loading && accounts.length === 0 ? (
              <div className="workspace-dashboard__loading">Loading...</div>
            ) : searchError ? (
              <div className="workspace-dashboard__loading" style={{ color: 'var(--color-error, #ef4444)' }}>
                {searchError}
              </div>
            ) : (
              filteredAccounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => loadAccountDetails(account)}
                  className={`workspace-dashboard__list-item ${
                    selectedAccount?.id === account.id ? 'is-active' : ''
                  }`}
                  style={{ position: 'relative' }}
                >
                  <div className="workspace-dashboard__list-item-title">{account.name}</div>
                  <div className="workspace-dashboard__list-item-meta">
                    {account.website && (
                      <a
                        href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          marginTop: '0.25rem',
                          display: 'block'
                        }}
                      >
                        {account.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  {account.owner?.name && (
                    <span style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
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
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="workspace-dashboard__details">
          {selectedAccount ? (
            <>
              <div className="workspace-dashboard__details-header">
                <h1 className="workspace-dashboard__details-title">{selectedAccount.name}</h1>
                <div className="workspace-dashboard__details-meta">
                  {selectedAccount.owner?.name && <span>Owner: {selectedAccount.owner.name}</span>}
                  {selectedAccount.website && <span> • Website: {selectedAccount.website}</span>}
                  {selectedAccount.geo_Text__c && <span> • Geo: {selectedAccount.geo_Text__c}</span>}
                  {selectedAccount.awsci_customer?.customerRevenue?.tShirtSize && (
                    <span> • Size: {selectedAccount.awsci_customer.customerRevenue.tShirtSize}</span>
                  )}
                </div>
              </div>
              
              <div className="workspace-dashboard__details-content">
                {/* Opportunities Section */}
                <div className="workspace-dashboard__card">
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
                    opportunities.map((opp) => (
                      <div key={opp.id} className="workspace-dashboard__card-content">
                        <div className="workspace-dashboard__card-item">
                          <div className="workspace-dashboard__card-item-title">{opp.name}</div>
                          <div className="workspace-dashboard__card-item-meta">
                            <span>Stage: {opp.stageName}</span>
                            {opp.amount && <span> • Amount: ${opp.amount.toLocaleString()}</span>}
                            <span> • Close: {new Date(opp.closeDate).toLocaleDateString()}</span>
                            <span> • Probability: {opp.probability}%</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="workspace-dashboard__card-content">
                      <div className="workspace-dashboard__card-item">
                        <div className="workspace-dashboard__list-item-meta">No opportunities found</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tasks Section */}
                <div className="workspace-dashboard__card">
                  <div className="workspace-dashboard__card-header">
                    <h3 className="workspace-dashboard__card-title">Tasks</h3>
                    <button
                      onClick={createTask}
                      className="workspace-dashboard__card-action"
                    >
                      Create Task
                    </button>
                  </div>
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <div key={task.Id} className="workspace-dashboard__card-content">
                        <div className="workspace-dashboard__card-item">
                          <div className="workspace-dashboard__card-item-title">{task.Subject}</div>
                          <div className="workspace-dashboard__card-item-meta">
                            <span>Status: {task.Status}</span>
                            {task.Priority && <span> • Priority: {task.Priority}</span>}
                            {task.ActivityDate && (
                              <span> • Due: {new Date(task.ActivityDate).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="workspace-dashboard__card-content">
                      <div className="workspace-dashboard__card-item">
                        <div className="workspace-dashboard__list-item-meta">No tasks found</div>
                      </div>
                    </div>
                  )}
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
