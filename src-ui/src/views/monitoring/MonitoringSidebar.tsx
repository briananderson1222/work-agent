import type {
  MonitoringEvent,
  MonitoringStats,
} from '../../contexts/MonitoringContext';
import { getAgentColor } from '../monitoring-utils';
import {
  getHistoricalAgentSlugs,
  getMonitoringAgentCountLabel,
  getRunningConversations,
} from './view-utils';

function formatAgentStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function MonitoringSidebar({
  stats,
  events,
  filteredEvents,
  selectedAgents,
  onAgentClick,
  onConversationClick,
  resolveModelName,
}: {
  stats: MonitoringStats | null;
  events: MonitoringEvent[];
  filteredEvents: MonitoringEvent[];
  selectedAgents: string[];
  onAgentClick: (agentSlug: string, event: React.MouseEvent) => void;
  onConversationClick: (conversationId: string, agentSlug: string) => void;
  resolveModelName: (modelId: string) => string;
}) {
  const activeAgents = stats?.agents || [];
  const historicalSlugs = getHistoricalAgentSlugs(filteredEvents, activeAgents);

  return (
    <div className="monitoring-sidebar">
      <div className="sidebar-header">
        <h3>Agents</h3>
        <span className="agent-count">
          {getMonitoringAgentCountLabel(stats, filteredEvents)}
        </span>
      </div>

      <div className="agent-list">
        {activeAgents.map((agent) => {
          const runningConversations = getRunningConversations(
            events,
            agent.slug,
          );
          const isSelected = selectedAgents.includes(agent.slug);
          const agentColor = getAgentColor(agent.slug);

          return (
            <div
              key={agent.slug}
              className={`agent-card status-${agent.status} ${isSelected ? 'selected' : ''}`}
              onClick={(event) => onAgentClick(agent.slug, event)}
              style={{
                borderLeftColor: agentColor,
                background: isSelected
                  ? `color-mix(in srgb, ${agentColor} 10%, var(--bg-secondary))`
                  : undefined,
              }}
            >
              <div className="agent-header">
                <span className="agent-name">
                  <span
                    className={`health-dot ${agent.healthy === false ? 'unhealthy' : agent.healthy === true ? 'healthy' : 'unknown'}`}
                    title={
                      agent.healthy === false
                        ? 'Unhealthy'
                        : agent.healthy === true
                          ? 'Healthy'
                          : 'Status unknown'
                    }
                  ></span>
                  {agent.name}
                </span>
                <span className={`agent-status ${agent.status}`}>
                  {formatAgentStatusLabel(agent.status)}
                </span>
              </div>

              {agent.status === 'running' &&
                runningConversations.length > 0 && (
                  <div className="running-conversations">
                    <div className="conversations-label">Active Chats</div>
                    {runningConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="conversation-item"
                        style={{ borderLeftColor: conversation.color }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onConversationClick(conversation.id, agent.slug);
                        }}
                      >
                        <span className="conversation-id">
                          {conversation.id.split(':').pop()?.substring(0, 8)}...
                        </span>
                      </div>
                    ))}
                  </div>
                )}

              <div className="agent-meta">
                <div className="meta-item">
                  <span className="meta-label">Model:</span>
                  <span className="meta-value">
                    {resolveModelName(agent.model)}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Messages:</span>
                  <span className="meta-value">{agent.messageCount}</span>
                </div>
              </div>
            </div>
          );
        })}

        {historicalSlugs.length > 0 && (
          <>
            <div className="agent-historical-header">Historical</div>
            {historicalSlugs.map((slug) => {
              const eventCount = filteredEvents.filter(
                (event) => event['stallion.agent.slug'] === slug,
              ).length;
              const isSelected = selectedAgents.includes(slug);
              const agentColor = getAgentColor(slug);

              return (
                <div
                  key={slug}
                  className={`agent-card historical ${isSelected ? 'selected' : ''}`}
                  onClick={(event) => onAgentClick(slug, event)}
                  style={{
                    borderLeftColor: agentColor,
                    background: isSelected
                      ? `color-mix(in srgb, ${agentColor} 10%, var(--bg-secondary))`
                      : undefined,
                  }}
                >
                  <div className="agent-header">
                    <span className="agent-name">{slug}</span>
                    <span className="agent-status historical-status">
                      Historical
                    </span>
                  </div>
                  <div className="agent-meta">
                    <div className="meta-item">
                      <span className="meta-label">Events:</span>
                      <span className="meta-value">{eventCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
