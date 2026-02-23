import { useState, useEffect } from 'react';
import { log } from '@/utils/logger';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useModels } from '../contexts/ModelsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { ConfirmModal } from './ConfirmModal';
import { useAgents } from '../contexts/AgentsContext';
import { AgentIcon } from './AgentIcon';
import './UsageStatsPanel.css';

type DrillDownType = 'model' | 'agent' | null;

export function UsageStatsPanel() {
  const { usageStats, loading, error, refresh, rescan } = useAnalytics();
  const { apiBase } = useApiBase();
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const models = useModels(apiBase);
  const agents = useAgents();
  const [drillDown, setDrillDown] = useState<{ type: DrillDownType; id: string } | null>(null);
  const [hasAutoRescanned, setHasAutoRescanned] = useState(false);

  // Auto-rescan if we have messages but no conversations
  useEffect(() => {
    if (!hasAutoRescanned && usageStats && usageStats.lifetime.totalMessages > 0) {
      const hasConversations = Object.values(usageStats.byAgent).some(
        (stats: any) => (stats.conversations || 0) > 0
      );
      
      if (!hasConversations) {
        log.debug('Auto-rescanning to populate conversation counts...');
        rescan().then(() => setHasAutoRescanned(true));
      }
    }
  }, [usageStats, hasAutoRescanned, rescan]);

  if (loading && !usageStats) {
    return (
      <div className="usage-stats-loading">
        <div className="usage-stats-loading-icon">📊</div>
        <div>Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-stats-error">
        <div className="usage-stats-error-icon">⚠️</div>
        <div className="usage-stats-error-message">Error: {error}</div>
        <button onClick={refresh} className="usage-stats-error-button">Retry</button>
      </div>
    );
  }

  if (!usageStats) return null;

  const { lifetime, byModel, byAgent } = usageStats;
  const avgCostPerMessage = lifetime.totalMessages > 0 ? lifetime.totalCost / lifetime.totalMessages : 0;
  
  // Backward compatibility: old stats use totalSessions, new use totalConversations
  const totalConversations = (lifetime as typeof lifetime & { totalConversations?: number; totalSessions?: number }).totalConversations ?? (lifetime as typeof lifetime & { totalConversations?: number; totalSessions?: number }).totalSessions ?? 0;

  return (
    <div className="usage-stats-panel">
      <div className="usage-stats-header">
        <h3 className="usage-stats-title">
          <span>📊</span>
          <span>Usage Statistics</span>
        </h3>
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
          style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid var(--border-primary)', borderRadius: '4px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >{resetting ? 'Resetting...' : 'Reset'}</button>
      </div>

      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Usage Statistics"
        message="This will permanently clear all usage data including message counts, costs, and agent statistics. This cannot be undone."
        confirmLabel="Reset All"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          setShowResetConfirm(false);
          setResetting(true);
          try {
            await fetch(`${apiBase}/api/analytics/usage`, { method: 'DELETE' });
            refresh();
          } catch { /* ignore */ }
          finally { setResetting(false); }
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <div className="usage-stats-cards">
        <StatCard icon="💬" label="Messages" value={lifetime.totalMessages.toLocaleString()} color="var(--accent-primary)" />
        <StatCard icon="📁" label="Conversations" value={totalConversations.toLocaleString()} color="var(--accent-secondary)" />
        <StatCard icon="💰" label="Total Cost" value={`$${lifetime.totalCost.toFixed(2)}`} color="var(--accent-warning)" />
        <StatCard icon="📈" label="Avg/Message" value={`$${avgCostPerMessage.toFixed(4)}`} color="var(--accent-success)" />
      </div>

      <div className="usage-stats-breakdown">
        <div className="usage-breakdown-section">
          <h4>
            <span>🤖</span>
            <span>Top Models</span>
          </h4>
          <div className="usage-breakdown-list">
            {Object.entries(byModel)
              .sort(([, a], [, b]) => b.messages - a.messages)
              .slice(0, 5)
              .map(([model, stats]) => (
                <ModelRow 
                  key={model} 
                  model={model} 
                  stats={stats} 
                  total={lifetime.totalMessages} 
                  models={models}
                  agents={agents}
                  onClick={() => setDrillDown({ type: 'model', id: model })}
                />
              ))}
            {Object.keys(byModel).length === 0 && (
              <div className="usage-breakdown-empty">No model data yet</div>
            )}
          </div>
        </div>

        <div className="usage-breakdown-section">
          <h4>
            <span>🎯</span>
            <span>Top Agents</span>
          </h4>
          <div className="usage-breakdown-list">
            {Object.entries(byAgent)
              .sort(([, a], [, b]) => b.messages - a.messages)
              .slice(0, 5)
              .map(([agent, stats]) => (
                <AgentRow 
                  key={agent} 
                  agent={agent} 
                  stats={stats} 
                  total={lifetime.totalMessages}
                  agents={agents}
                  onClick={() => setDrillDown({ type: 'agent', id: agent })}
                />
              ))}
            {Object.keys(byAgent).length === 0 && (
              <div className="usage-breakdown-empty">No agent data yet</div>
            )}
          </div>
        </div>
      </div>

      {drillDown && (
        <DrillDownModal
          type={drillDown.type}
          id={drillDown.id}
          usageStats={usageStats}
          models={models}
          agents={agents}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="usage-stat-card">
      <div className="usage-stat-icon">{icon}</div>
      <div className="usage-stat-label">{label}</div>
      <div className="usage-stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function ModelRow({ model, stats, total, models, onClick, agents }: { model: string; stats: any; total: number; models: any[]; onClick: () => void; agents: any[] }) {
  const percentage = (stats.messages / total) * 100;
  
  const modelInfo = models.find(m => m.id === model || m.originalId === model);
  const displayName = modelInfo?.name || model;
  
  // Find agents using this model
  const usingAgents = agents.filter((a: any) => a.model === model || a.model === modelInfo?.originalId);
  const isAcpOnly = usingAgents.length > 0 && usingAgents.every((a: any) => a.source === 'acp');
  
  const tooltipLines = [
    `Model: ${displayName}`,
    `ID: ${model}`,
    `Messages: ${stats.messages}`,
    `Cost: $${stats.cost.toFixed(4)}`,
    usingAgents.length > 0 ? `Agents: ${usingAgents.map((a: any) => a.name || a.slug).join(', ')}` : null,
  ].filter(Boolean).join('\n');
  
  return (
    <div className="usage-breakdown-item" title={tooltipLines} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="usage-breakdown-header">
        <span className="usage-breakdown-name">{displayName}</span>
        <span className="usage-breakdown-stats">
          {stats.messages} msgs · {isAcpOnly
            ? <a href={usingAgents[0]?.planUrl || '#'} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} 
                style={{ color: 'var(--accent-acp)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                {usingAgents[0]?.planLabel || usingAgents[0]?.connectionName || 'ACP'} plan ↗
              </a>
            : `$${stats.cost.toFixed(2)}`}
        </span>
      </div>
      {usingAgents.length > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {usingAgents.slice(0, 3).map((a: any) => a.name || a.slug.split(':').pop() || a.slug).join(', ')}
          {usingAgents.length > 3 && ` +${usingAgents.length - 3} more`}
        </div>
      )}
      <div className="usage-breakdown-bar">
        <div 
          className="usage-breakdown-bar-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: isAcpOnly ? 'var(--accent-acp)' : 'var(--accent-primary)'
          }}
        />
      </div>
    </div>
  );
}

function AgentRow({ agent, stats, total, onClick, agents }: { agent: string; stats: any; total: number; onClick: () => void; agents: any[] }) {
  const percentage = (stats.messages / total) * 100;
  const agentConfig = agents.find((a: any) => a.slug === agent);
  const isAcp = agentConfig?.source === 'acp';
  const displayName = agentConfig?.name || agent.split(':').pop() || agent;
  
  return (
    <div className="usage-breakdown-item" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="usage-breakdown-header">
        <span className="usage-breakdown-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {agentConfig ? <AgentIcon agent={agentConfig} size="small" /> : <span>🤖</span>}
          {displayName}
        </span>
        <span className="usage-breakdown-stats">
          {stats.messages} msgs · {isAcp && agentConfig?.planUrl
            ? <a href={agentConfig.planUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} 
                style={{ color: 'var(--accent-acp)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                {agentConfig.planLabel || agentConfig.connectionName || 'ACP'} plan ↗
              </a>
            : `$${stats.cost.toFixed(2)}`}
        </span>
      </div>
      <div className="usage-breakdown-bar">
        <div 
          className="usage-breakdown-bar-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: isAcp ? 'var(--accent-acp)' : 'var(--accent-yellow)'
          }}
        />
      </div>
    </div>
  );
}

function DrillDownModal({ type, id, usageStats, models, agents, onClose }: {
  type: DrillDownType;
  id: string;
  usageStats: any;
  models: any[];
  agents: any[];
  onClose: () => void;
}) {
  if (type === 'model') {
    const modelStats = usageStats.byModel[id];
    const modelInfo = models.find(m => m.id === id || m.originalId === id);
    const displayName = modelInfo?.name || id;
    
    // Find agents using this model
    const agentsUsingModel = Object.entries(usageStats.byAgent)
      .filter(([, stats]: [string, any]) => stats.models && stats.models[id])
      .map(([agentId, stats]: [string, any]) => ({
        agentId,
        agentName: agentId.split(':').pop() || agentId,
        messages: stats.models[id].messages,
        cost: stats.models[id].cost,
      }))
      .sort((a, b) => b.messages - a.messages);
    
    return (
      <div className="drill-down-overlay" onClick={onClose}>
        <div className="drill-down-modal" onClick={(e) => e.stopPropagation()}>
          <div className="drill-down-header">
            <h3>🤖 {displayName}</h3>
            <button onClick={onClose} className="drill-down-close">✕</button>
          </div>
          <div className="drill-down-content">
            <div className="drill-down-stats-grid">
              <StatCard icon="💬" label="Messages" value={modelStats.messages.toLocaleString()} color="var(--accent-primary)" />
              <StatCard icon="📥" label="Input Tokens" value={modelStats.inputTokens.toLocaleString()} color="var(--accent-secondary)" />
              <StatCard icon="📤" label="Output Tokens" value={modelStats.outputTokens.toLocaleString()} color="var(--accent-secondary)" />
              <StatCard icon="💰" label="Total Cost" value={`$${modelStats.cost.toFixed(2)}`} color="var(--accent-warning)" />
              <StatCard icon="📈" label="Avg Cost/Turn" value={`$${(modelStats.cost / modelStats.messages).toFixed(4)}`} color="var(--accent-success)" />
              <StatCard icon="📥" label="Input Tokens/Turn" value={Math.round(modelStats.inputTokens / modelStats.messages).toLocaleString()} color="var(--accent-info)" />
              <StatCard icon="📤" label="Output Tokens/Turn" value={Math.round(modelStats.outputTokens / modelStats.messages).toLocaleString()} color="var(--accent-info)" />
            </div>
            
            {agentsUsingModel.length > 0 && (
              <div className="drill-down-section">
                <h4>Agents Using This Model</h4>
                <div className="drill-down-list">
                  {agentsUsingModel.map(({ agentId, agentName, messages, cost }) => (
                    <div key={agentId} className="drill-down-list-item">
                      <span className="drill-down-list-name">{agentName}</span>
                      <span className="drill-down-list-stats">{messages} msgs · ${cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="drill-down-section">
              <h4>Model Details</h4>
              <div className="drill-down-details">
                <div><strong>Model ID:</strong> {id}</div>
                {modelInfo?.originalId && <div><strong>Original ID:</strong> {modelInfo.originalId}</div>}
                <div><strong>Display Name:</strong> {displayName}</div>
                {modelInfo?.inputCostPer1kTokens && (
                  <div><strong>Input Cost:</strong> ${modelInfo.inputCostPer1kTokens.toFixed(4)}/1K tokens</div>
                )}
                {modelInfo?.outputCostPer1kTokens && (
                  <div><strong>Output Cost:</strong> ${modelInfo.outputCostPer1kTokens.toFixed(4)}/1K tokens</div>
                )}
                {modelInfo?.supportsStreaming !== undefined && (
                  <div><strong>Streaming:</strong> {modelInfo.supportsStreaming ? '✓ Supported' : '✗ Not supported'}</div>
                )}
                {modelInfo?.supportsVision !== undefined && (
                  <div><strong>Vision:</strong> {modelInfo.supportsVision ? '✓ Supported' : '✗ Not supported'}</div>
                )}
                {modelInfo?.maxTokens && (
                  <div><strong>Max Tokens:</strong> {modelInfo.maxTokens.toLocaleString()}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (type === 'agent') {
    const agentStats = usageStats.byAgent[id];
    const agentName = id.split(':').pop() || id;
    const agent = agents.find(a => a.slug === id || a.id === id);
    
    // Backward compatibility: check both conversations and sessions
    const conversationCount = agentStats.conversations ?? agentStats.sessions ?? 0;
    
    // Get model breakdown for this agent
    const modelBreakdown = agentStats.models 
      ? Object.entries(agentStats.models)
          .map(([modelId, stats]: [string, any]) => {
            const modelInfo = models.find(m => m.id === modelId || m.originalId === modelId);
            return {
              modelId,
              displayName: modelInfo?.name || modelId,
              messages: stats.messages,
              cost: stats.cost,
            };
          })
          .sort((a, b) => b.messages - a.messages)
      : [];
    
    return (
      <div className="drill-down-overlay" onClick={onClose}>
        <div className="drill-down-modal" onClick={(e) => e.stopPropagation()}>
          <div className="drill-down-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {agent ? <AgentIcon agent={agent} size="medium" /> : '🎯'} {agent?.name || agentName}
            </h3>
            <button onClick={onClose} className="drill-down-close">✕</button>
          </div>
          <div className="drill-down-content">
            <div className="drill-down-stats-grid">
              <StatCard icon="💬" label="Messages" value={agentStats.messages.toLocaleString()} color="var(--accent-primary)" />
              <StatCard icon="📁" label="Conversations" value={conversationCount.toLocaleString()} color="var(--accent-secondary)" />
              <StatCard icon="💰" label="Total Cost" value={`$${agentStats.cost.toFixed(2)}`} color="var(--accent-warning)" />
              <StatCard icon="📈" label="Avg Cost/Turn" value={`$${(agentStats.cost / agentStats.messages).toFixed(4)}`} color="var(--accent-success)" />
            </div>
            
            {modelBreakdown.length > 0 && (
              <div className="drill-down-section">
                <h4>Models Used</h4>
                <div className="drill-down-list">
                  {modelBreakdown.map(({ modelId, displayName, messages, cost }) => (
                    <div key={modelId} className="drill-down-list-item">
                      <span className="drill-down-list-name">{displayName}</span>
                      <span className="drill-down-list-stats">{messages} msgs · ${cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="drill-down-section">
              <h4>Agent Details</h4>
              <div className="drill-down-details">
                <div><strong>Agent ID:</strong> {id}</div>
                <div><strong>Display Name:</strong> {agentName}</div>
                {agent?.model && <div><strong>Default Model:</strong> {agent.model}</div>}
                {agent?.description && <div><strong>Description:</strong> {agent.description}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}
