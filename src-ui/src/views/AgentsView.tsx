import { AgentIcon } from '../components/AgentIcon';
import { ACPConnectionsSection } from '../components/ACPConnectionsSection';
import type { AgentSummary, NavigationView } from '../types';
import './page-layout.css';
import './editor-layout.css';

interface AgentsViewProps {
  agents: AgentSummary[];
  apiBase: string;
  availableModels: Array<{ id: string; name: string }>;
  defaultModel?: string;
  bedrockReady: boolean;
  onNavigate: (view: NavigationView) => void;
}

export function AgentsView({
  agents,
  apiBase,
  availableModels,
  defaultModel,
  bedrockReady,
  onNavigate,
}: AgentsViewProps) {
  const standaloneAgents = agents.filter(
    (a) => !a.slug.includes(':') && a.source !== 'acp',
  );
  const workspaceAgents = agents.filter((a) => a.slug.includes(':'));
  const acpAgents = agents.filter((a) => a.source === 'acp');

  const renderModelTag = (agent: AgentSummary) => {
    const modelId = agent.model || defaultModel;
    if (!modelId) return null;
    const isInherited = !agent.model;
    const modelInfo = availableModels.find((m) => m.id === modelId);
    let displayName = 'model';
    if (modelInfo) displayName = modelInfo.name;
    else if (typeof modelId === 'string') {
      const parts = modelId.split('.');
      if (parts.length > 1)
        displayName = parts[1]
          .split('-')[0]
          .replace(/^./, (c) => c.toUpperCase());
    }
    return (
      <span className="page__tag">
        {displayName}
        {isInherited && <span style={{ opacity: 0.7 }}> (default)</span>}
      </span>
    );
  };

  const AgentCard = ({
    agent,
    badge,
  }: {
    agent: AgentSummary;
    badge?: string;
  }) => (
    <div
      className="page__card-loose"
      onClick={() => onNavigate({ type: 'agent-edit', slug: agent.slug })}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '8px',
        }}
      >
        <AgentIcon agent={agent} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600 }}>
              {agent.name}
            </span>
            {agent.plugin && (
              <span className="page__card-plugin-badge">{agent.plugin}</span>
            )}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
            }}
          >
            {agent.slug}
          </div>
        </div>
      </div>
      {agent.description && (
        <p
          style={{
            margin: '0 0 8px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {agent.description.length > 100
            ? `${agent.description.substring(0, 100)}...`
            : agent.description}
        </p>
      )}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {renderModelTag(agent)}
        {badge && (
          <span
            className="page__tag page__tag--accent"
            style={{ marginLeft: 'auto' }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">manage / agents</div>
          <h1 className="page__title">Agents</h1>
          <p className="page__subtitle">
            AI agents with custom prompts, models, and tools
          </p>
        </div>
        <div className="page__actions">
          <button
            className="page__btn-primary"
            onClick={() => onNavigate({ type: 'agent-new' })}
            disabled={!bedrockReady}
            title={
              !bedrockReady ? 'AWS Bedrock credentials required' : undefined
            }
          >
            + New Agent
          </button>
        </div>
      </div>

      {!bedrockReady && (
        <div
          style={{
            padding: '1.25rem',
            marginBottom: '1.5rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🧠</span>
          <div>
            <div
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}
            >
              Bedrock Setup Required
            </div>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Configure AWS credentials to create and manage agents.
            </p>
            <button
              className="button button--secondary"
              onClick={() => onNavigate({ type: 'settings' })}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Open Settings →
            </button>
          </div>
        </div>
      )}

      <div className="page__section-label">Agents</div>
      {standaloneAgents.length > 0 ? (
        <div className="page__card-grid" style={{ marginBottom: '2rem' }}>
          {standaloneAgents.map((a) => (
            <AgentCard key={a.slug} agent={a} />
          ))}
        </div>
      ) : (
        <div className="page__empty" style={{ marginBottom: '2rem' }}>
          <div className="page__empty-icon">⬡</div>
          <p className="page__empty-title">No standalone agents yet</p>
          <p className="page__empty-desc">
            Create an agent to get started with custom AI assistants
          </p>
          <button
            className="page__btn-primary"
            onClick={() => onNavigate({ type: 'agent-new' })}
          >
            + Create Agent
          </button>
        </div>
      )}

      {workspaceAgents.length > 0 && (
        <>
          <div className="page__section-label">Workspace Agents</div>
          <div className="page__card-grid" style={{ marginBottom: '2rem' }}>
            {workspaceAgents.map((a) => (
              <AgentCard key={a.slug} agent={a} badge={a.slug.split(':')[0]} />
            ))}
          </div>
        </>
      )}

      <ACPConnectionsSection
        acpAgents={acpAgents as unknown as AgentSummary[]}
        apiBase={apiBase}
      />
    </div>
  );
}
