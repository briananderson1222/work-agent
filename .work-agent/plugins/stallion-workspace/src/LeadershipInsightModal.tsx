import { useState, useEffect } from 'react';
import { transformTool } from '@stallion-ai/sdk';
import { useSalesContext } from './useSalesContext';
import { useSales } from './StallionContext';
import { SearchModal } from './components/SearchModal';

interface LeadershipInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentSlug: string;
}

export function LeadershipInsightModal({ isOpen, onClose, agentSlug }: LeadershipInsightModalProps) {
  const salesContext = useSalesContext();
  const userDetails = salesContext.myDetails ? {
    alias: salesContext.myDetails.name,
    sfdcId: salesContext.myDetails.userId
  } : null;
  const { state, setState } = useSales();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  
  // Enrichment state
  const [enrichmentId, setEnrichmentId] = useState<string>('');
  const [enrichmentResult, setEnrichmentResult] = useState<any>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<'idle' | 'creating' | 'polling' | 'ready'>('idle');
  
  // Form state (shown after enrichment)
  const [category, setCategory] = useState<'Highlight' | 'Lowlight' | 'Risk' | 'Observation' | 'Blocker' | 'Challenge'>('Highlight');
  const [title, setTitle] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<any[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<any[]>([]);
  const [selectedOpportunities, setSelectedOpportunities] = useState<any[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchType, setSearchType] = useState<'account' | 'campaign' | 'opportunity'>('account');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);

  useEffect(() => {
    if (isOpen && state.myTasks.length === 0) {
      setLoadingInitial(true);
      loadTasks().finally(() => setLoadingInitial(false));
    }
    if (isOpen && userDetails && state.myInsights.length === 0) {
      setLoadingInitial(true);
      loadInsights().finally(() => setLoadingInitial(false));
    }
  }, [isOpen, userDetails]);

  // Poll for enrichment result
  useEffect(() => {
    if (enrichmentStatus === 'polling' && enrichmentId) {
      const interval = setInterval(async () => {
        try {
          const result = await transformTool(agentSlug, 'sat-sfdc_fetch_insight_enrichment', {
            enrichmentId
          }, '(data) => data || {}');
          
          if (result.insightFeedback) {
            setEnrichmentResult(result);
            setTitle(result.title || '');
            setCategory(result.category || 'Observation');
            setEnrichmentStatus('ready');
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Failed to fetch enrichment:', err);
        }
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [enrichmentStatus, enrichmentId, agentSlug]);

  const loadTasks = async () => {
    try {
      const tasks = await transformTool(agentSlug, 'sat-sfdc_list_user_tasks', {}, '(data) => data.tasks || []');
      setState({ myTasks: tasks });
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  const loadInsights = async () => {
    if (!userDetails) return;
    try {
      const insights = await transformTool(agentSlug, 'sat-sfdc_list_my_insights', { 
        pageSize: 50, 
        userAlias: userDetails.alias 
      }, '(data) => data.insights || []');
      setState({ myInsights: insights });
    } catch (err) {
      console.error('Failed to load insights:', err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([loadTasks(), loadInsights()]);
    setLoading(false);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Highlight': '#10b981',
      'Lowlight': '#f59e0b',
      'Risk': '#ef4444',
      'Observation': '#3b82f6',
      'Blocker': '#dc2626',
      'Challenge': '#f97316',
    };
    return colors[category] || '#6b7280';
  };

  const handleTaskClick = (task: any) => {
    setSelectedTask(task);
    setSelectedInsight(null);
  };

  const handleInsightClick = (insight: any) => {
    setSelectedInsight(insight);
    setSelectedTask(null);
  };

  const handleSelectSearchResult = (item: any) => {
    if (searchType === 'account') {
      if (!selectedAccounts.find(a => a.id === item.id)) {
        setSelectedAccounts([...selectedAccounts, item]);
      }
    } else if (searchType === 'campaign') {
      if (!selectedCampaigns.find(c => c.id === item.id)) {
        setSelectedCampaigns([...selectedCampaigns, item]);
      }
    } else if (searchType === 'opportunity') {
      if (!selectedOpportunities.find(o => o.id === item.id)) {
        setSelectedOpportunities([...selectedOpportunities, item]);
      }
    }
    setShowSearchModal(false);
  };

  const handleCreateEnrichment = async () => {
    if (!description.trim() || !userDetails) return;
    
    setEnrichmentStatus('creating');
    try {
      const result = await transformTool(agentSlug, 'sat-sfdc_create_insight_enrichment', {
        userAlias: userDetails.alias,
        text: description,
        accountIds: selectedAccounts.map(a => a.id),
      }, '(data) => data || {}');
      setEnrichmentId(result.id || '');
      setEnrichmentStatus('polling');
    } catch (err) {
      console.error('Failed to create enrichment:', err);
      setEnrichmentStatus('idle');
    }
  };

  const handleCreateInsight = async () => {
    if (!enrichmentResult || !title.trim()) return;
    
    setLoading(true);
    try {
      await transformTool(agentSlug, 'sat-sfdc_create_leadership_insight', {
        title,
        description,
        category,
        accountIds: selectedAccounts.map(a => a.id),
        campaignIds: selectedCampaigns.map(c => c.id),
        opportunityIds: selectedOpportunities.map(o => o.id),
        originalDescription: enrichmentResult.originalDescription,
        insightRating: enrichmentResult.insightRating,
        insightFeedback: enrichmentResult.insightFeedback
      }, '(data) => data || {}');

      // Reset and close
      setCategory('Highlight');
      setTitle('');
      setDescription('');
      setSelectedAccounts([]);
      setSelectedCampaigns([]);
      setSelectedOpportunities([]);
      setEnrichmentId('');
      setEnrichmentResult(null);
      setEnrichmentStatus('idle');
      onClose();
    } catch (err) {
      console.error('Failed to create insight:', err);
      alert('Failed to create insight');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '0.5rem',
          width: '90vw',
          maxWidth: '1200px',
          height: '80vh',
          zIndex: 9999,
          display: 'flex',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside style={{
          width: '300px',
          borderRight: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          overflow: 'auto',
          padding: '1rem',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Context</h3>
          
          {/* Enrichment Result */}
          {enrichmentResult && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '0.25rem', border: '1px solid var(--border-primary)' }}>
              <h4 style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                AI Enrichment
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {enrichmentResult.insightFeedback}
              </p>
            </div>
          )}

          {/* Recent Tasks */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div 
              onClick={() => setTasksCollapsed(!tasksCollapsed)}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '0.5rem',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              <h4 style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-secondary)' }}>
                {tasksCollapsed ? '▶' : '▼'} Recent Tasks ({state.myTasks.length})
              </h4>
              <button
                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                disabled={loading}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                {loading ? '...' : '↻'}
              </button>
            </div>
            {!tasksCollapsed && (
              state.myTasks.length === 0 && !loadingInitial ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>No tasks</p>
              ) : loadingInitial && state.myTasks.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>Loading...</p>
              ) : (
                <>
                  {state.myTasks.slice(0, showAllTasks ? 50 : 5).map(task => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      style={{
                        padding: '0.5rem',
                        marginBottom: '0.5rem',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        position: 'relative',
                      }}
                    >
                      <a
                        href={`https://aws-crm.lightning.force.com/lightning/r/Task/${task.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          color: 'var(--color-primary)',
                          fontSize: '1rem',
                          textDecoration: 'none',
                        }}
                      >
                        ↗
                      </a>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', paddingRight: '1.5rem' }}>{task.subject}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {task.activityDate} • {task.status} • {task.type}
                      </div>
                      {task.what?.name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {task.what.name}
                        </div>
                      )}
                      {task.sa_Activity__c && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                          {task.sa_Activity__c}
                        </div>
                      )}
                    </div>
                  ))}
                  {state.myTasks.length > 5 && (
                    <button
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {showAllTasks ? 'Show Less' : `Show More (${state.myTasks.length - 5} more)`}
                    </button>
                  )}
                </>
              )
            )}
          </div>

          {/* Recent Insights */}
          <div>
            <div 
              onClick={() => setInsightsCollapsed(!insightsCollapsed)}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '0.5rem',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              <h4 style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-secondary)' }}>
                {insightsCollapsed ? '▶' : '▼'} Recent Insights ({state.myInsights.length})
              </h4>
            </div>
            {!insightsCollapsed && (
              state.myInsights.length === 0 && !loadingInitial ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>No insights</p>
              ) : loadingInitial && state.myInsights.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>Loading...</p>
              ) : (
                <>
                  {state.myInsights.slice(0, showAllInsights ? 50 : 5).map(insight => (
                    <div
                      key={insight.id}
                      onClick={() => handleInsightClick(insight)}
                      style={{
                        padding: '0.5rem',
                        marginBottom: '0.5rem',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <a
                        href={insight.salesforceUrl || `https://aws-crm.lightning.force.com/lightning/n/Sales_Insights_Field_Trends?c__insightId=${insight.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          color: 'var(--color-primary)',
                          fontSize: '1rem',
                          textDecoration: 'none',
                        }}
                      >
                        ↗
                      </a>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', paddingRight: '1.5rem' }}>{insight.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          fontSize: '0.75rem',
                          borderRadius: '0.25rem',
                          background: getCategoryColor(insight.category),
                          color: 'white',
                          fontWeight: 500,
                        }}>
                          {insight.category}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Score: {insight.finalScore}
                        </span>
                      </div>
                      {insight.opportunities?.[0]?.name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {insight.opportunities[0].name}
                        </div>
                      )}
                      {insight.domains && insight.domains.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                          {insight.domains.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {state.myInsights.length > 5 && (
                    <button
                      onClick={() => setShowAllInsights(!showAllInsights)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {showAllInsights ? 'Show Less' : `Show More (${state.myInsights.length - 5} more)`}
                    </button>
                  )}
                </>
              )
            )}
          </div>
        </aside>

        {/* Main Form */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Create Leadership Insight</h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '1.5rem',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: '1.5rem', overflow: 'auto', flex: 1 }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the insight..."
                disabled={enrichmentStatus !== 'idle'}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                Related To
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button
                  onClick={() => { setSearchType('account'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  + Account
                </button>
                <button
                  onClick={() => { setSearchType('campaign'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  + Campaign
                </button>
                <button
                  onClick={() => { setSearchType('opportunity'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  + Opportunity
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedAccounts.map(account => (
                  <div key={account.id} style={{
                    padding: '0.5rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                  }}>
                    <span>Account: {account.name}</span>
                    <button
                      onClick={() => setSelectedAccounts(selectedAccounts.filter(a => a.id !== account.id))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedCampaigns.map(campaign => (
                  <div key={campaign.id} style={{
                    padding: '0.5rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                  }}>
                    <span>Campaign: {campaign.name}</span>
                    <button
                      onClick={() => setSelectedCampaigns(selectedCampaigns.filter(c => c.id !== campaign.id))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedOpportunities.map(opp => (
                  <div key={opp.id} style={{
                    padding: '0.5rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                  }}>
                    <span>Opportunity: {opp.name}</span>
                    <button
                      onClick={() => setSelectedOpportunities(selectedOpportunities.filter(o => o.id !== opp.id))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {enrichmentStatus === 'ready' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: getCategoryColor(category),
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0.25rem',
                      color: 'white',
                      fontWeight: 500,
                    }}
                  >
                    <option value="Highlight">Highlight</option>
                    <option value="Lowlight">Lowlight</option>
                    <option value="Risk">Risk</option>
                    <option value="Observation">Observation</option>
                    <option value="Blocker">Blocker</option>
                    <option value="Challenge">Challenge</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0.25rem',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </>
            )}

            {(enrichmentStatus === 'creating' || enrichmentStatus === 'polling') && (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
              }}>
                <p style={{ margin: 0, color: 'var(--text-primary)' }}>
                  {enrichmentStatus === 'creating' && '⏳ Creating enrichment...'}
                  {enrichmentStatus === 'polling' && '⏳ Processing enrichment...'}
                </p>
              </div>
            )}
          </div>

          <footer style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-primary)',
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
          }}>
            {enrichmentStatus === 'idle' && (
              <button
                onClick={handleCreateEnrichment}
                disabled={!description.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  cursor: description.trim() ? 'pointer' : 'not-allowed',
                  opacity: description.trim() ? 1 : 0.5,
                }}
              >
                Generate Enrichment
              </button>
            )}
            {enrichmentStatus === 'ready' && (
              <button
                onClick={handleCreateInsight}
                disabled={!title.trim() || loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  cursor: (title.trim() && !loading) ? 'pointer' : 'not-allowed',
                  opacity: (title.trim() && !loading) ? 1 : 0.5,
                }}
              >
                {loading ? 'Creating...' : 'Create Insight'}
              </button>
            )}
          </footer>
        </main>
      </div>

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelect={handleSelectSearchResult}
        type={searchType}
        agentSlug={agentSlug}
      />

      {/* Details Modal */}
      {(selectedTask || selectedInsight) && (
        <>
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
            }}
            onClick={() => { setSelectedTask(null); setSelectedInsight(null); }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.5rem',
              width: '90vw',
              maxWidth: '800px',
              maxHeight: '80vh',
              zIndex: 10001,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                {selectedTask ? 'Task Details' : 'Insight Details'}
              </h3>
              <button
                onClick={() => { setSelectedTask(null); setSelectedInsight(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '1.5rem', overflow: 'auto', flex: 1 }}>
              {selectedTask ? (
                <div style={{ color: 'var(--text-primary)' }}>
                  <h4 style={{ marginTop: 0 }}>{selectedTask.subject}</h4>
                  <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.875rem' }}>
                    <div><strong>Status:</strong> {selectedTask.status}</div>
                    <div><strong>Type:</strong> {selectedTask.type}</div>
                    <div><strong>Activity Date:</strong> {selectedTask.activityDate}</div>
                    {selectedTask.what?.name && <div><strong>Related To:</strong> {selectedTask.what.name}</div>}
                    {selectedTask.sa_Activity__c && <div><strong>Activity:</strong> {selectedTask.sa_Activity__c}</div>}
                    {selectedTask.sa_Type__c && <div><strong>SA Type:</strong> {selectedTask.sa_Type__c}</div>}
                    {selectedTask.description && <div><strong>Description:</strong> <p style={{ marginTop: '0.25rem' }}>{selectedTask.description}</p></div>}
                    <div><strong>Created:</strong> {new Date(selectedTask.createdDate).toLocaleString()}</div>
                    <div><strong>Last Modified:</strong> {new Date(selectedTask.lastModifiedDate).toLocaleString()}</div>
                  </div>
                </div>
              ) : selectedInsight ? (
                <div style={{ color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>{selectedInsight.title}</h4>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '0.25rem',
                      background: getCategoryColor(selectedInsight.category),
                      color: 'white',
                      fontWeight: 500,
                    }}>
                      {selectedInsight.category}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.875rem' }}>
                    <div><strong>Score:</strong> {selectedInsight.finalScore}</div>
                    {selectedInsight.description && (
                      <div>
                        <strong>Description:</strong>
                        <p style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{selectedInsight.description}</p>
                      </div>
                    )}
                    {selectedInsight.insightFeedback && (
                      <div style={{ 
                        padding: '0.75rem', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: '0.25rem',
                        border: '1px solid var(--border-primary)',
                      }}>
                        <strong>AI Enrichment:</strong>
                        <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{selectedInsight.insightFeedback}</p>
                      </div>
                    )}
                    {selectedInsight.opportunities && selectedInsight.opportunities.length > 0 && (
                      <div>
                        <strong>Opportunities:</strong>
                        <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
                          {selectedInsight.opportunities.map((opp: any) => (
                            <li key={opp.id}>{opp.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedInsight.domains && selectedInsight.domains.length > 0 && (
                      <div><strong>Domains:</strong> {selectedInsight.domains.join(', ')}</div>
                    )}
                    {selectedInsight.services && selectedInsight.services.length > 0 && (
                      <div><strong>Services:</strong> {selectedInsight.services.join(', ')}</div>
                    )}
                    <div><strong>Created:</strong> {new Date(selectedInsight.createdAt).toLocaleString()}</div>
                    <div><strong>Updated:</strong> {new Date(selectedInsight.updatedAt).toLocaleString()}</div>
                    <div><strong>Created By:</strong> {selectedInsight.createdBy}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}
