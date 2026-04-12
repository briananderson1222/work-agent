import { AgentIcon } from '../AgentIcon';
import { StatCard } from './StatCard';
import {
  getAgentModelBreakdown,
  getTotalUsageConversations,
  getUsageModelDisplayName,
} from './utils';

type DrillDownType = 'model' | 'agent' | null;

export function UsageDrillDownModal({
  agents,
  id,
  models,
  onClose,
  type,
  usageStats,
}: {
  agents: any[];
  id: string;
  models: any[];
  onClose: () => void;
  type: DrillDownType;
  usageStats: any;
}) {
  if (type === 'model') {
    const modelStats = usageStats.byModel[id];
    const modelInfo = models.find(
      (model) => model.id === id || model.originalId === id,
    );
    const displayName = getUsageModelDisplayName(models, id);
    const agentsUsingModel = Object.entries(usageStats.byAgent)
      .filter(([, stats]: [string, any]) => stats.models?.[id])
      .map(([agentId, stats]: [string, any]) => ({
        agentId,
        agentName: agentId.split(':').pop() || agentId,
        messages: stats.models[id].messages,
        cost: stats.models[id].cost,
      }))
      .sort((a, b) => b.messages - a.messages);

    return (
      <div className="drill-down-overlay" onClick={onClose}>
        <div
          className="drill-down-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="drill-down-header">
            <h3>🤖 {displayName}</h3>
            <button onClick={onClose} className="drill-down-close">
              ✕
            </button>
          </div>
          <div className="drill-down-content">
            <div className="drill-down-stats-grid">
              <StatCard
                icon="💬"
                label="Messages"
                value={modelStats.messages.toLocaleString()}
                color="var(--accent-primary)"
              />
              <StatCard
                icon="📥"
                label="Input Tokens"
                value={modelStats.inputTokens.toLocaleString()}
                color="var(--accent-secondary)"
              />
              <StatCard
                icon="📤"
                label="Output Tokens"
                value={modelStats.outputTokens.toLocaleString()}
                color="var(--accent-secondary)"
              />
              <StatCard
                icon="💰"
                label="Total Cost"
                value={`$${modelStats.cost.toFixed(2)}`}
                color="var(--accent-warning)"
              />
              <StatCard
                icon="📈"
                label="Avg Cost/Turn"
                value={`$${(modelStats.cost / modelStats.messages).toFixed(4)}`}
                color="var(--accent-success)"
              />
              <StatCard
                icon="📥"
                label="Input Tokens/Turn"
                value={Math.round(
                  modelStats.inputTokens / modelStats.messages,
                ).toLocaleString()}
                color="var(--accent-info)"
              />
              <StatCard
                icon="📤"
                label="Output Tokens/Turn"
                value={Math.round(
                  modelStats.outputTokens / modelStats.messages,
                ).toLocaleString()}
                color="var(--accent-info)"
              />
            </div>

            {agentsUsingModel.length > 0 && (
              <div className="drill-down-section">
                <h4>Agents Using This Model</h4>
                <div className="drill-down-list">
                  {agentsUsingModel.map(
                    ({ agentId, agentName, messages, cost }) => (
                      <div key={agentId} className="drill-down-list-item">
                        <span className="drill-down-list-name">
                          {agentName}
                        </span>
                        <span className="drill-down-list-stats">
                          {messages} msgs · ${cost.toFixed(2)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="drill-down-section">
              <h4>Model Details</h4>
              <div className="drill-down-details">
                <div>
                  <strong>Model ID:</strong> {id}
                </div>
                {modelInfo?.originalId && (
                  <div>
                    <strong>Original ID:</strong> {modelInfo.originalId}
                  </div>
                )}
                <div>
                  <strong>Display Name:</strong> {displayName}
                </div>
                {modelInfo?.inputCostPer1kTokens && (
                  <div>
                    <strong>Input Cost:</strong> $
                    {(modelInfo.inputCostPer1kTokens ?? 0).toFixed(4)}/1K tokens
                  </div>
                )}
                {modelInfo?.outputCostPer1kTokens && (
                  <div>
                    <strong>Output Cost:</strong> $
                    {(modelInfo.outputCostPer1kTokens ?? 0).toFixed(4)}/1K
                    tokens
                  </div>
                )}
                {modelInfo?.supportsStreaming !== undefined && (
                  <div>
                    <strong>Streaming:</strong>{' '}
                    {modelInfo.supportsStreaming
                      ? '✓ Supported'
                      : '✗ Not supported'}
                  </div>
                )}
                {modelInfo?.supportsVision !== undefined && (
                  <div>
                    <strong>Vision:</strong>{' '}
                    {modelInfo.supportsVision
                      ? '✓ Supported'
                      : '✗ Not supported'}
                  </div>
                )}
                {modelInfo?.maxTokens && (
                  <div>
                    <strong>Max Tokens:</strong>{' '}
                    {modelInfo.maxTokens.toLocaleString()}
                  </div>
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
    const agent = agents.find((entry) => entry.slug === id || entry.id === id);
    const conversationCount = getTotalUsageConversations({
      totalConversations: agentStats.conversations,
      totalSessions: agentStats.sessions,
    });
    const modelBreakdown = getAgentModelBreakdown({ agentStats, models });

    return (
      <div className="drill-down-overlay" onClick={onClose}>
        <div
          className="drill-down-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="drill-down-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {agent ? <AgentIcon agent={agent} size="medium" /> : '🎯'}{' '}
              {agent?.name || agentName}
            </h3>
            <button onClick={onClose} className="drill-down-close">
              ✕
            </button>
          </div>
          <div className="drill-down-content">
            <div className="drill-down-stats-grid">
              <StatCard
                icon="💬"
                label="Messages"
                value={agentStats.messages.toLocaleString()}
                color="var(--accent-primary)"
              />
              <StatCard
                icon="📁"
                label="Conversations"
                value={conversationCount.toLocaleString()}
                color="var(--accent-secondary)"
              />
              <StatCard
                icon="💰"
                label="Total Cost"
                value={`$${agentStats.cost.toFixed(2)}`}
                color="var(--accent-warning)"
              />
              <StatCard
                icon="📈"
                label="Avg Cost/Turn"
                value={`$${(agentStats.cost / agentStats.messages).toFixed(4)}`}
                color="var(--accent-success)"
              />
            </div>

            {modelBreakdown.length > 0 && (
              <div className="drill-down-section">
                <h4>Models Used</h4>
                <div className="drill-down-list">
                  {modelBreakdown.map(
                    ({ modelId, displayName, messages, cost }) => (
                      <div key={modelId} className="drill-down-list-item">
                        <span className="drill-down-list-name">
                          {displayName}
                        </span>
                        <span className="drill-down-list-stats">
                          {messages} msgs · ${cost.toFixed(2)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="drill-down-section">
              <h4>Agent Details</h4>
              <div className="drill-down-details">
                <div>
                  <strong>Agent ID:</strong> {id}
                </div>
                <div>
                  <strong>Display Name:</strong> {agentName}
                </div>
                {agent?.model && (
                  <div>
                    <strong>Default Model:</strong> {agent.model}
                  </div>
                )}
                {agent?.description && (
                  <div>
                    <strong>Description:</strong> {agent.description}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
