import {
  useConnectionsQuery,
  useGlobalKnowledgeStatusQuery,
  useIntegrationsQuery,
  useSystemStatusQuery,
} from '@stallion-ai/sdk';
import { useNavigation } from '../contexts/NavigationContext';
import {
  useACPConnectionRegistry,
  useACPConnections,
} from '../hooks/useACPConnections';
import { connectionStatusLabel } from '../utils/execution';
import { ConnectionsHubSection } from './connections-hub/ConnectionsHubSection';
import {
  describeConnection,
  getConnectionStatusClass,
  getConnectionTypeText,
  getProviderIcon,
  IconDatabase,
  IconTool,
} from './connections-hub/utils';
import './ConnectionsHub.css';
import { ConnectionIcon } from '../components/acp-connections/ConnectionIcon';
import { getACPConnectionStatusView } from '../components/acp-connections/utils';
import {
  connectionTypeLabel,
  runtimeCatalogSourceLabel,
} from '../utils/execution';
import { isModelInventoryConnection } from './connectionInventory';

export type ConnectionsHubProps = Record<string, never>;

export function ConnectionsHub(_props: ConnectionsHubProps) {
  const { navigate } = useNavigation();

  const { data: connections = [] } = useConnectionsQuery();
  const { data: systemStatus } = useSystemStatusQuery();

  const { data: tools = [] } = useIntegrationsQuery();
  const { data: acpConnections = [] } = useACPConnections();
  const { data: acpRegistryEntries = [] } = useACPConnectionRegistry();

  const { data: knowledge } = useGlobalKnowledgeStatusQuery();

  const modelConnections = connections.filter(isModelInventoryConnection);
  const runtimeConnections = connections.filter(
    (connection) => connection.kind === 'runtime',
  );
  const availableACPRegistryEntries = acpRegistryEntries.filter(
    (entry) => !entry.installed,
  );

  return (
    <div className="connections-hub">
      <div className="connections-hub__inner">
        <div className="connections-hub__header">
          <h2 className="connections-hub__title">Connections</h2>
          <p className="connections-hub__desc">
            External services powering your agents
          </p>
        </div>

        {systemStatus?.recommendation && (
          <div className="connections-hub__summary">
            <div className="connections-hub__summary-copy">
              <div className="connections-hub__summary-title">
                {systemStatus.recommendation.title}
              </div>
              <div className="connections-hub__summary-detail">
                {systemStatus.recommendation.detail}
              </div>
              <div className="connections-hub__summary-badges">
                {Object.entries(systemStatus.capabilities ?? {}).map(
                  ([capability, state]) => (
                    <span
                      key={capability}
                      className={`connections-hub__summary-badge connections-hub__summary-badge--${state.ready ? 'ready' : 'pending'}`}
                    >
                      {capability}: {state.ready ? 'ready' : 'setup needed'}
                    </span>
                  ),
                )}
              </div>
            </div>
            <button
              className="connections-hub__summary-action"
              onClick={() =>
                navigate(
                  systemStatus.recommendation?.type === 'providers'
                    ? '/connections/providers'
                    : systemStatus.recommendation?.type === 'runtimes'
                      ? '/connections/runtimes'
                      : '/connections',
                )
              }
            >
              {systemStatus.recommendation.actionLabel}
            </button>
          </div>
        )}

        {/* Model Connections */}
        <ConnectionsHubSection
          title="Model Connections"
          description="Raw LLM and embedding backends"
          manageLabel="Manage"
          onManage={() => navigate('/connections/providers')}
        >
          {modelConnections.length > 0 ? (
            modelConnections.map((p) => {
              const Icon = getProviderIcon(p.type);
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
                    <span className="connections-hub__card-name">{p.name}</span>
                    <span
                      className={`connections-hub__status-badge connections-hub__status-badge--${getConnectionStatusClass(p.status)}`}
                    >
                      {connectionStatusLabel(p.status)}
                    </span>
                  </div>
                  <span className="connections-hub__card-type">
                    {getConnectionTypeText(p.type)}
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
        </ConnectionsHubSection>

        <ConnectionsHubSection
          title="Runtime Connections"
          description="AI engines that run your agents"
          manageLabel="Manage"
          onManage={() => navigate('/connections/runtimes')}
        >
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
                      className={`connections-hub__status-badge connections-hub__status-badge--${getConnectionStatusClass(connection.status)}`}
                    >
                      {connectionStatusLabel(connection.status)}
                    </span>
                  </div>
                  <span className="connections-hub__card-type">
                    {getConnectionTypeText(connection.type)}
                  </span>
                  <span className="connections-hub__card-type">
                    Catalog:{' '}
                    {runtimeCatalogSourceLabel(
                      connection.runtimeCatalog?.source ?? 'none',
                    )}
                  </span>
                  {connection.runtimeCatalog?.reason && (
                    <span className="connections-hub__card-type">
                      {connection.runtimeCatalog.reason}
                    </span>
                  )}
                  {desc && (
                    <span className="connections-hub__card-type">{desc}</span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="connections-hub__empty-card connections-hub__empty-card--static">
              <div>No runtime connections available.</div>
              <div className="connections-hub__empty-hint">
                Runtimes appear here automatically when supported AI engines are
                detected.
              </div>
            </div>
          )}
        </ConnectionsHubSection>

        <ConnectionsHubSection
          title="ACP Connections"
          description="Command-backed external agent runtimes, including Kiro CLI and plugin-provided ACP adapters"
          manageLabel="Manage"
          onManage={() => navigate('/connections/acp')}
        >
          {acpConnections.length > 0
            ? acpConnections.map((connection) => {
                const status = getACPConnectionStatusView(connection);
                return (
                  <button
                    key={connection.id}
                    className="connections-hub__card"
                    onClick={() => navigate('/connections/acp')}
                  >
                    <div className="connections-hub__card-header">
                      <span className="connections-hub__card-icon">
                        <ConnectionIcon icon={connection.icon} size={18} />
                      </span>
                      <span className="connections-hub__card-name">
                        {connection.name}
                      </span>
                      <span
                        className={`connections-hub__status-badge connections-hub__status-badge--${status.isConnected ? 'ready' : status.isError ? 'error' : connection.enabled ? 'warn' : 'disabled'}`}
                      >
                        {status.statusLabel}
                      </span>
                    </div>
                    <span className="connections-hub__card-type">
                      {connection.command} {(connection.args ?? []).join(' ')}
                    </span>
                    <span className="connections-hub__card-type">
                      {(connection.slashCommands?.length ?? 0) > 0
                        ? `${connection.slashCommands?.length} commands`
                        : connection.source === 'plugin'
                          ? 'Plugin provided'
                          : 'User configured'}
                    </span>
                  </button>
                );
              })
            : availableACPRegistryEntries.slice(0, 3).map((entry) => (
                <button
                  key={entry.id}
                  className="connections-hub__card"
                  onClick={() => navigate('/connections/acp')}
                >
                  <div className="connections-hub__card-header">
                    <span className="connections-hub__card-icon">
                      <ConnectionIcon icon={entry.icon} size={18} />
                    </span>
                    <span className="connections-hub__card-name">
                      {entry.name}
                    </span>
                    <span className="connections-hub__status-badge connections-hub__status-badge--disabled">
                      available
                    </span>
                  </div>
                  {entry.description && (
                    <span className="connections-hub__card-type">
                      {entry.description}
                    </span>
                  )}
                  <span className="connections-hub__card-type">
                    {entry.command} {(entry.args ?? []).join(' ')}
                  </span>
                </button>
              ))}
          {acpConnections.length === 0 &&
            availableACPRegistryEntries.length === 0 && (
              <button
                className="connections-hub__empty-card"
                onClick={() => navigate('/connections/acp')}
              >
                + Add an ACP command connection
              </button>
            )}
        </ConnectionsHubSection>

        <ConnectionsHubSection
          title="Tool Servers"
          description="MCP and external tool integrations"
          manageLabel="Manage"
          onManage={() => navigate('/connections/tools')}
        >
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
        </ConnectionsHubSection>

        <ConnectionsHubSection
          title="Knowledge"
          description="Vector database and embeddings for search"
          manageLabel="Manage"
          onManage={() => navigate('/connections/knowledge')}
          footer={
            knowledge ? (
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
            ) : null
          }
        >
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
                {knowledge.vectorDb.id === 'lancedb-builtin'
                  ? 'Built-in vector store'
                  : connectionTypeLabel(knowledge.vectorDb.type)}
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
        </ConnectionsHubSection>
      </div>
    </div>
  );
}
