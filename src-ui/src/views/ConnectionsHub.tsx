import {
  useConnectionsQuery,
  useGlobalKnowledgeStatusQuery,
  useIntegrationsQuery,
} from '@stallion-ai/sdk';
import type { ReactNode } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import {
  connectionStatusLabel,
  connectionTypeLabel,
  prerequisiteStatusLabel,
} from '../utils/execution';
import './ConnectionsHub.css';

interface Connection {
  id: string;
  kind: 'model' | 'runtime';
  type: string;
  name: string;
  enabled: boolean;
  description?: string;
  capabilities: string[];
  status: string;
  prerequisites: Array<{ name: string; status: string }>;
  config: Record<string, unknown>;
}

/* ── SVG Icons ── */

function IconCloud() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconServer() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconTool() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

const PROVIDER_ICONS: Record<string, () => ReactNode> = {
  bedrock: IconCloud,
  ollama: IconServer,
  'openai-compat': IconLink,
};

export type ConnectionsHubProps = Record<string, never>;

export function ConnectionsHub(_props: ConnectionsHubProps) {
  const { navigate } = useNavigation();

  const { data: connections = [] } = useConnectionsQuery();

  const { data: tools = [] } = useIntegrationsQuery();

  const { data: knowledge } = useGlobalKnowledgeStatusQuery();

  const modelConnections = connections.filter(
    (connection) => connection.kind === 'model',
  );
  const runtimeConnections = connections.filter(
    (connection) => connection.kind === 'runtime',
  );

  function statusClass(status: string): string {
    if (status === 'ready') return 'ready';
    if (status === 'missing_prerequisites') return 'warn';
    if (status === 'error') return 'error';
    if (status === 'disabled') return 'disabled';
    return 'warn';
  }

  function describeConnection(connection: Connection): string {
    const missing = connection.prerequisites.filter(
      (item) => item.status !== 'installed',
    );
    if (missing.length > 0) {
      return missing
        .map((item) => `${item.name} — ${prerequisiteStatusLabel(item.status)}`)
        .join(' · ');
    }
    if (connection.type === 'acp') {
      const configured = Number(connection.config.configuredCount || 0);
      const connected = Number(connection.config.connectedCount || 0);
      return `${connected} of ${configured} active`;
    }
    return '';
  }

  return (
    <div className="connections-hub">
      <div className="connections-hub__inner">
        <div className="connections-hub__header">
          <h2 className="connections-hub__title">Connections</h2>
          <p className="connections-hub__desc">
            External services powering your agents
          </p>
        </div>

        {/* Model Connections */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">
              Model Connections
            </span>
            <button
              className="connections-hub__add-btn"
              onClick={() => navigate('/connections/providers')}
            >
              Manage
            </button>
          </div>
          <p className="connections-hub__section-desc">
            Raw LLM and embedding backends
          </p>
          <div className="connections-hub__cards">
            {modelConnections.length > 0 ? (
              modelConnections.map((p) => {
                const Icon = PROVIDER_ICONS[p.type] ?? IconLink;
                const desc = describeConnection(p);
                return (
                  <button
                    key={p.id}
                    className="connections-hub__card"
                    onClick={() => navigate(`/connections/providers/${p.id}`)}
                  >
                    <div className="connections-hub__card-header">
                      <span className="connections-hub__card-icon">
                        <Icon />
                      </span>
                      <span className="connections-hub__card-name">
                        {p.name}
                      </span>
                      <span
                        className={`connections-hub__status-badge connections-hub__status-badge--${statusClass(p.enabled ? 'ready' : 'disabled')}`}
                      >
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <span className="connections-hub__card-type">
                      {connectionTypeLabel(p.type)}
                    </span>
                    {desc && (
                      <span className="connections-hub__card-type">{desc}</span>
                    )}
                  </button>
                );
              })
            ) : (
              <button
                className="connections-hub__empty-card"
                onClick={() => navigate('/connections/providers')}
              >
                + Add a model connection
              </button>
            )}
          </div>
        </div>

        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">
              Runtime Connections
            </span>
          </div>
          <p className="connections-hub__section-desc">
            AI engines that run your agents
          </p>
          <div className="connections-hub__cards">
            {runtimeConnections.length > 0 ? (
              runtimeConnections.map((connection) => {
                const desc = describeConnection(connection);
                return (
                  <button
                    key={connection.id}
                    className="connections-hub__card"
                    onClick={() =>
                      navigate(`/connections/runtimes/${connection.id}`)
                    }
                  >
                    <div className="connections-hub__card-header">
                      <span className="connections-hub__card-icon">
                        <IconTool />
                      </span>
                      <span className="connections-hub__card-name">
                        {connection.name}
                      </span>
                      <span
                        className={`connections-hub__status-badge connections-hub__status-badge--${statusClass(connection.status)}`}
                      >
                        {connectionStatusLabel(connection.status)}
                      </span>
                    </div>
                    <span className="connections-hub__card-type">
                      {connectionTypeLabel(connection.type)}
                    </span>
                    {desc && (
                      <span className="connections-hub__card-type">{desc}</span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="connections-hub__empty-card connections-hub__empty-card--static">
                <div>No runtime connections available.</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                  Runtimes appear here automatically when supported AI engines
                  are detected.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Knowledge */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Knowledge</span>
            <button
              className="connections-hub__add-btn"
              onClick={() => navigate('/connections/knowledge')}
            >
              Manage
            </button>
          </div>
          <p className="connections-hub__section-desc">
            Vector database and embeddings for search
          </p>
          <div className="connections-hub__cards">
            {knowledge?.vectorDb ? (
              <button
                className="connections-hub__card"
                onClick={() => navigate('/connections/knowledge')}
              >
                <div className="connections-hub__card-header">
                  <span className="connections-hub__card-icon">
                    <IconDatabase />
                  </span>
                  <span className="connections-hub__card-name">
                    {knowledge.vectorDb.name}
                  </span>
                  <span
                    className={`connections-hub__card-status connections-hub__card-status--${knowledge.vectorDb.enabled ? 'enabled' : 'disabled'}`}
                  />
                </div>
                <span className="connections-hub__card-type">
                  {knowledge.vectorDb.type}
                </span>
              </button>
            ) : (
              <button
                className="connections-hub__empty-card"
                onClick={() => navigate('/connections/knowledge')}
              >
                + Configure knowledge base
              </button>
            )}
          </div>
          {knowledge ? (
            <p className="connections-hub__knowledge-summary">
              {knowledge.embedding
                ? `Embedding: via ${knowledge.embedding.name}`
                : ''}
              {knowledge.embedding && knowledge.stats.totalDocuments > 0
                ? ' · '
                : ''}
              {knowledge.stats.totalDocuments > 0
                ? `${knowledge.stats.totalDocuments} docs · ${knowledge.stats.totalChunks} chunks`
                : ''}
            </p>
          ) : null}
        </div>

        {/* Tool Servers */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Tool Servers</span>
            <button
              className="connections-hub__add-btn"
              onClick={() => navigate('/connections/tools')}
            >
              Manage
            </button>
          </div>
          <p className="connections-hub__section-desc">
            MCP and external tool integrations
          </p>
          <div className="connections-hub__cards">
            {tools.length > 0 ? (
              tools.map((t) => (
                <button
                  key={t.id}
                  className="connections-hub__card"
                  onClick={() => navigate(`/connections/tools/${t.id}`)}
                >
                  <div className="connections-hub__card-header">
                    <span className="connections-hub__card-icon">
                      <IconTool />
                    </span>
                    <span className="connections-hub__card-name">
                      {t.displayName ?? t.id}
                    </span>
                    <span
                      className={`connections-hub__card-status connections-hub__card-status--${t.connected ? 'enabled' : 'disabled'}`}
                    />
                  </div>
                  <span className="connections-hub__card-type">
                    {t.transport}
                  </span>
                </button>
              ))
            ) : (
              <button
                className="connections-hub__empty-card"
                onClick={() => navigate('/connections/tools')}
              >
                + Add a tool server
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
