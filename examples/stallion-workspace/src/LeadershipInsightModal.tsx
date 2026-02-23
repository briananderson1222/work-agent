import { useState, useEffect } from 'react';
import { useSalesContext } from './useSalesContext';
import { useSales } from './StallionContext';
import { SearchModal } from './components/SearchModal';
import { salesforceProvider, siftProvider } from './data';
import { CRM_BASE_URL } from './constants';
import { log } from './log';

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
  const [tasksCursor, setTasksCursor] = useState<string | undefined>();
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
          const result = await siftProvider.getEnrichment(enrichmentId);
          
          if (result.insightFeedback) {
            setEnrichmentResult(result);
            setTitle(result.title || '');
            setCategory(result.category || 'Observation');
            setEnrichmentStatus('ready');
            clearInterval(interval);
          }
        } catch (err) {
          log('Failed to fetch enrichment:', err);
        }
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [enrichmentStatus, enrichmentId, agentSlug]);

  const loadTasks = async () => {
    if (!userDetails) return;
    try {
      const result = await salesforceProvider.getUserTasks(userDetails.sfdcId, { limit: 25 });
      // Map to expected format
      const mappedTasks = result.tasks.map(t => ({
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
      setState({ myTasks: mappedTasks });
      setTasksCursor(result.hasNextPage ? result.cursor : undefined);
    } catch (err) {
      log('Failed to load tasks:', err);
    }
  };

  const loadInsights = async () => {
    if (!userDetails) return;
    try {
      const insights = await siftProvider.listMyInsights({ 
        pageSize: 50, 
        userAlias: userDetails.alias 
      });
      setState({ myInsights: insights });
    } catch (err) {
      log('Failed to load insights:', err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([loadTasks(), loadInsights()]);
    setLoading(false);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Highlight': 'var(--health-success)',
      'Lowlight': 'var(--warning-text)',
      'Risk': 'var(--health-error)',
      'Observation': 'var(--accent-primary)',
      'Blocker': 'var(--health-error)',
      'Challenge': 'var(--warning-text)',
    };
    return colors[category] || 'var(--text-tertiary)';
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
      const result = await siftProvider.enrichInsight({
        userAlias: userDetails.alias,
        text: description,
        accountIds: selectedAccounts.map(a => a.id),
      });
      setEnrichmentId(result.id || '');
      setEnrichmentStatus('polling');
    } catch (err) {
      log('Failed to create enrichment:', err);
      setEnrichmentStatus('idle');
    }
  };

  const handleCreateInsight = async () => {
    if (!enrichmentResult || !title.trim()) return;
    
    setLoading(true);
    try {
      await siftProvider.createInsight({
        title,
        description,
        category,
        accountIds: selectedAccounts.map(a => a.id),
        campaignIds: selectedCampaigns.map(c => c.id),
        opportunityIds: selectedOpportunities.map(o => o.id),
        originalDescription: enrichmentResult.originalDescription,
        insightRating: enrichmentResult.insightRating,
        insightFeedback: enrichmentResult.insightFeedback
      });

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
      log('Failed to create insight:', err);
      alert('Failed to create insight');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="insight-modal-overlay"
        onClick={onClose}
      />
      <div
        className="insight-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="insight-modal-sidebar">
          <h3 className="insight-modal-sidebar-title">Context</h3>
          
          {/* Enrichment Result */}
          {enrichmentResult && (
            <div className="insight-enrichment-result">
              <h4 className="insight-enrichment-title">
                AI Enrichment
              </h4>
              <p className="insight-enrichment-text">
                {enrichmentResult.insightFeedback}
              </p>
            </div>
          )}

          {/* Recent Tasks */}
          <div className="insight-section">
            <div 
              onClick={() => setTasksCollapsed(!tasksCollapsed)}
              className="insight-section-header"
            >
              <h4 className="insight-section-title">
                {tasksCollapsed ? '▶' : '▼'} Recent Tasks ({state.myTasks.length})
              </h4>
              <button
                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                disabled={loading}
                className="insight-refresh-btn"
              >
                {loading ? '...' : '↻'}
              </button>
            </div>
            {!tasksCollapsed && (
              state.myTasks.length === 0 && !loadingInitial ? (
                <p className="insight-empty-state">No tasks</p>
              ) : loadingInitial && state.myTasks.length === 0 ? (
                <p className="insight-empty-state">Loading...</p>
              ) : (
                <>
                  {state.myTasks.slice(0, showAllTasks ? 50 : 5).map(task => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="insight-card"
                    >
                      <a
                        href={`${CRM_BASE_URL}/lightning/r/Task/${task.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="insight-card-link"
                      >
                        ↗
                      </a>
                      <div className="insight-card-title">{task.subject}</div>
                      <div className="insight-card-meta">
                        {task.activityDate} • {task.status} • {task.type}
                      </div>
                      {task.what?.name && (
                        <div className="insight-card-related">
                          {task.what.name}
                        </div>
                      )}
                      {task.sa_Activity__c && (
                        <div className="insight-card-activity">
                          {task.sa_Activity__c}
                        </div>
                      )}
                    </div>
                  ))}
                  {state.myTasks.length > 5 && (
                    <button
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className="insight-show-more-btn"
                    >
                      {showAllTasks ? 'Show Less' : `Show More (${state.myTasks.length - 5} more)`}
                    </button>
                  )}
                  {showAllTasks && tasksCursor && (
                    <button
                      onClick={async () => {
                        if (!userDetails) return;
                        const result = await salesforceProvider.getUserTasks(userDetails.sfdcId, { limit: 25, after: tasksCursor });
                        const mapped = result.tasks.map(t => ({
                          id: t.id, subject: t.subject, status: t.status,
                          activityDate: t.dueDate?.toISOString().split('T')[0],
                          description: t.description, priority: t.priority,
                          sa_Activity__c: t.activityType,
                          what: t.relatedTo ? { __typename: t.relatedTo.type, name: t.relatedTo.name } : undefined,
                          whatId: t.relatedTo?.id
                        }));
                        setState({ myTasks: [...state.myTasks, ...mapped] });
                        setTasksCursor(result.hasNextPage ? result.cursor : undefined);
                      }}
                      className="insight-load-more-btn"
                    >
                      Load More…
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
              className="insight-section-header"
            >
              <h4 className="insight-section-title">
                {insightsCollapsed ? '▶' : '▼'} Recent Insights ({state.myInsights.length})
              </h4>
            </div>
            {!insightsCollapsed && (
              state.myInsights.length === 0 && !loadingInitial ? (
                <p className="insight-empty-state">No insights</p>
              ) : loadingInitial && state.myInsights.length === 0 ? (
                <p className="insight-empty-state">Loading...</p>
              ) : (
                <>
                  {state.myInsights.slice(0, showAllInsights ? 50 : 5).map(insight => (
                    <div
                      key={insight.id}
                      onClick={() => handleInsightClick(insight)}
                      className="insight-card"
                    >
                      <a
                        href={insight.salesforceUrl || `${CRM_BASE_URL}/lightning/n/Sales_Insights_Field_Trends?c__insightId=${insight.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="insight-card-link"
                      >
                        ↗
                      </a>
                      <div className="insight-card-title">{insight.title}</div>
                      <div className="insight-badge-container">
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
                        <span className="insight-score">
                          Score: {insight.finalScore}
                        </span>
                      </div>
                      {insight.opportunities?.[0]?.name && (
                        <div className="insight-card-related">
                          {insight.opportunities[0].name}
                        </div>
                      )}
                      {insight.domains && insight.domains.length > 0 && (
                        <div className="insight-domains">
                          {insight.domains.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {state.myInsights.length > 5 && (
                    <button
                      onClick={() => setShowAllInsights(!showAllInsights)}
                      className="insight-show-more-btn"
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
        <main className="insight-modal-main">
          <div className="insight-modal-header">
            <h3 className="insight-modal-title">Create Leadership Insight</h3>
            <button
              onClick={onClose}
              className="insight-modal-close"
            >
              ✕
            </button>
          </div>

          <div className="insight-modal-form">
            <div className="insight-form-group">
              <label className="insight-form-label">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the insight..."
                disabled={enrichmentStatus !== 'idle'}
                className="insight-form-textarea"
              />
            </div>

            <div className="insight-form-group">
              <label className="insight-form-label">
                Related To
              </label>
              <div className="insight-form-buttons">
                <button
                  onClick={() => { setSearchType('account'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  className="insight-form-btn"
                >
                  + Account
                </button>
                <button
                  onClick={() => { setSearchType('campaign'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  className="insight-form-btn"
                >
                  + Campaign
                </button>
                <button
                  onClick={() => { setSearchType('opportunity'); setShowSearchModal(true); }}
                  disabled={enrichmentStatus !== 'idle' && enrichmentStatus !== 'ready'}
                  className="insight-form-btn"
                >
                  + Opportunity
                </button>
              </div>

              <div className="insight-selected-items">
                {selectedAccounts.map(account => (
                  <div key={account.id} className="insight-selected-item">
                    <span>Account: {account.name}</span>
                    <button
                      onClick={() => setSelectedAccounts(selectedAccounts.filter(a => a.id !== account.id))}
                      className="insight-remove-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedCampaigns.map(campaign => (
                  <div key={campaign.id} className="insight-selected-item">
                    <span>Campaign: {campaign.name}</span>
                    <button
                      onClick={() => setSelectedCampaigns(selectedCampaigns.filter(c => c.id !== campaign.id))}
                      className="insight-remove-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedOpportunities.map(opp => (
                  <div key={opp.id} className="insight-selected-item">
                    <span>Opportunity: {opp.name}</span>
                    <button
                      onClick={() => setSelectedOpportunities(selectedOpportunities.filter(o => o.id !== opp.id))}
                      className="insight-remove-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {enrichmentStatus === 'ready' && (
              <>
                <div className="insight-form-group">
                  <label className="insight-form-label">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as 'Highlight' | 'Lowlight' | 'Risk' | 'Observation' | 'Blocker' | 'Challenge')}
                    className="insight-form-select"
                    style={{
                      background: getCategoryColor(category),
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

                <div className="insight-form-group">
                  <label className="insight-form-label">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="insight-form-input"
                  />
                </div>
              </>
            )}

            {(enrichmentStatus === 'creating' || enrichmentStatus === 'polling') && (
              <div className="insight-loading-container">
                <p className="insight-loading-text">
                  {enrichmentStatus === 'creating' && '⏳ Creating enrichment...'}
                  {enrichmentStatus === 'polling' && '⏳ Processing enrichment...'}
                </p>
              </div>
            )}
          </div>

          <footer className="insight-modal-footer">
            {enrichmentStatus === 'idle' && (
              <button
                onClick={handleCreateEnrichment}
                disabled={!description.trim()}
                className="insight-primary-btn"
              >
                Generate Enrichment
              </button>
            )}
            {enrichmentStatus === 'ready' && (
              <button
                onClick={handleCreateInsight}
                disabled={!title.trim() || loading}
                className="insight-primary-btn"
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
            className="insight-details-overlay"
            onClick={() => { setSelectedTask(null); setSelectedInsight(null); }}
          />
          <div
            className="insight-details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="insight-details-header">
              <h3 className="insight-details-title">
                {selectedTask ? 'Task Details' : 'Insight Details'}
              </h3>
              <button
                onClick={() => { setSelectedTask(null); setSelectedInsight(null); }}
                className="insight-details-close"
              >
                ✕
              </button>
            </div>
            <div className="insight-details-content">
              {selectedTask ? (
                <div className="insight-details-text">
                  <h4 className="insight-details-subject">{selectedTask.subject}</h4>
                  <div className="insight-details-grid">
                    <div><strong>Status:</strong> {selectedTask.status}</div>
                    <div><strong>Type:</strong> {selectedTask.type}</div>
                    <div><strong>Activity Date:</strong> {selectedTask.activityDate}</div>
                    {selectedTask.what?.name && <div><strong>Related To:</strong> {selectedTask.what.name}</div>}
                    {selectedTask.sa_Activity__c && <div><strong>Activity:</strong> {selectedTask.sa_Activity__c}</div>}
                    {selectedTask.sa_Type__c && <div><strong>SA Type:</strong> {selectedTask.sa_Type__c}</div>}
                    {selectedTask.description && <div><strong>Description:</strong> <p className="insight-details-description">{selectedTask.description}</p></div>}
                    <div><strong>Created:</strong> {new Date(selectedTask.createdDate).toLocaleString()}</div>
                    <div><strong>Last Modified:</strong> {new Date(selectedTask.lastModifiedDate).toLocaleString()}</div>
                  </div>
                </div>
              ) : selectedInsight ? (
                <div className="insight-details-text">
                  <div className="insight-details-header-row">
                    <h4 className="insight-details-header-title">{selectedInsight.title}</h4>
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
                  <div className="insight-details-grid">
                    <div><strong>Score:</strong> {selectedInsight.finalScore}</div>
                    {selectedInsight.description && (
                      <div>
                        <strong>Description:</strong>
                        <p className="insight-details-description">{selectedInsight.description}</p>
                      </div>
                    )}
                    {selectedInsight.insightFeedback && (
                      <div className="insight-details-enrichment">
                        <strong>AI Enrichment:</strong>
                        <p className="insight-details-enrichment-text">{selectedInsight.insightFeedback}</p>
                      </div>
                    )}
                    {selectedInsight.opportunities && selectedInsight.opportunities.length > 0 && (
                      <div>
                        <strong>Opportunities:</strong>
                        <ul className="insight-details-list">
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
