import { useState } from 'react';
import { useSendToChat } from '@stallion-ai/sdk';
import { CRM_BASE_URL } from './constants';

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

interface AccountDetailProps {
  selectedAccount: Account | null;
  opportunities: Opportunity[];
  tasks: Task[];
  loadingOpportunities: boolean;
  loadingTasks: boolean;
  onCreateOpportunity: () => void;
  onCreateTask: () => void;
  onLogActivity: (opportunity: Opportunity) => void;
  agentSlug: string;
}

export function AccountDetail({
  selectedAccount,
  opportunities,
  tasks,
  loadingOpportunities,
  loadingTasks,
  onCreateOpportunity,
  onCreateTask,
  onLogActivity,
  agentSlug
}: AccountDetailProps) {
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const sendToChat = useSendToChat(agentSlug);

  if (!selectedAccount) {
    return (
      <div className="workspace-dashboard__empty">
        <div>
          <div className="workspace-dashboard__empty-title">Select an Account</div>
          <div className="workspace-dashboard__empty-subtitle">
            Search for accounts by owner name or territory
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-dashboard__details-header" style={{ position: 'relative' }}>
        <h1 className="workspace-dashboard__details-title">{selectedAccount.name}</h1>
        <a
          href={`${CRM_BASE_URL}/lightning/r/Account/${selectedAccount.id}/view`}
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
                    onClick={onCreateOpportunity}
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
                              onClick={() => onLogActivity(opp)}
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
                              href={`${CRM_BASE_URL}/lightning/r/Opportunity/${opp.id}/view`}
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
                    onClick={onCreateTask}
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
                              href={`${CRM_BASE_URL}/lightning/r/Task/${task.id}/view`}
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
  );
}