import { useAnalytics } from '../contexts/AnalyticsContext';
import { useModels } from '../contexts/ModelsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import './UsageStatsPanel.css';

export function UsageStatsPanel() {
  const { usageStats, loading, error, refresh, rescan } = useAnalytics();
  const { apiBase } = useApiBase();
  const models = useModels(apiBase);

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
  const totalConversations = (lifetime as any).totalConversations ?? (lifetime as any).totalSessions ?? 0;

  return (
    <div className="usage-stats-panel">
      <div className="usage-stats-header">
        <h3 className="usage-stats-title">
          <span>📊</span>
          <span>Usage Statistics</span>
        </h3>
        <div className="usage-stats-actions">
          <button onClick={refresh} className="usage-stats-button usage-stats-button-refresh">
            🔄 Refresh
          </button>
          <button onClick={rescan} className="usage-stats-button usage-stats-button-rescan">
            🔍 Rescan
          </button>
        </div>
      </div>

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
                <ModelRow key={model} model={model} stats={stats} total={lifetime.totalMessages} models={models} />
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
                <AgentRow key={agent} agent={agent} stats={stats} total={lifetime.totalMessages} />
              ))}
            {Object.keys(byAgent).length === 0 && (
              <div className="usage-breakdown-empty">No agent data yet</div>
            )}
          </div>
        </div>
      </div>

      {lifetime.firstMessageDate && (
        <div className="usage-stats-footer">
          📅 Active since {new Date(lifetime.firstMessageDate).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="usage-stat-card">
      <div className="usage-stat-icon">{icon}</div>
      <div className="usage-stat-label">{label}</div>
      <div className="usage-stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function ModelRow({ model, stats, total, models }: { model: string; stats: any; total: number; models: any[] }) {
  const percentage = (stats.messages / total) * 100;
  
  // Find model info from context
  const modelInfo = models.find(m => m.id === model || m.originalId === model);
  const displayName = modelInfo?.name || model;
  
  // Build tooltip with all known information
  const tooltipLines = [
    `Display Name: ${displayName}`,
    `Model ID: ${model}`,
    modelInfo?.originalId && modelInfo.originalId !== model ? `Original ID: ${modelInfo.originalId}` : null,
    `Messages: ${stats.messages}`,
    `Input Tokens: ${stats.inputTokens.toLocaleString()}`,
    `Output Tokens: ${stats.outputTokens.toLocaleString()}`,
    `Total Cost: $${stats.cost.toFixed(4)}`,
    `Avg Cost/Message: $${(stats.cost / stats.messages).toFixed(4)}`,
  ].filter(Boolean).join('\n');
  
  return (
    <div className="usage-breakdown-item" title={tooltipLines}>
      <div className="usage-breakdown-header">
        <span className="usage-breakdown-name">{displayName}</span>
        <span className="usage-breakdown-stats">
          {stats.messages} msgs · ${stats.cost.toFixed(2)}
        </span>
      </div>
      <div className="usage-breakdown-bar">
        <div 
          className="usage-breakdown-bar-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: 'var(--accent-primary)'
          }}
        />
      </div>
    </div>
  );
}

function AgentRow({ agent, stats, total }: { agent: string; stats: any; total: number }) {
  const percentage = (stats.messages / total) * 100;
  const agentName = agent.split(':').pop() || agent;
  
  return (
    <div className="usage-breakdown-item">
      <div className="usage-breakdown-header">
        <span className="usage-breakdown-name">{agentName}</span>
        <span className="usage-breakdown-stats">
          {stats.messages} msgs · ${stats.cost.toFixed(2)}
        </span>
      </div>
      <div className="usage-breakdown-bar">
        <div 
          className="usage-breakdown-bar-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: 'var(--accent-secondary)'
          }}
        />
      </div>
    </div>
  );
}
