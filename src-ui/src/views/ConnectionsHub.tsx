import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import './ConnectionsHub.css';

interface ProviderConnection {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  capabilities: ('llm' | 'embedding' | 'vectordb')[];
}

interface ToolServer {
  id: string;
  displayName?: string;
  description?: string;
  transport: string;
  kind?: string;
  connected?: boolean;
}

interface KnowledgeStatus {
  vectorDb: { id: string; name: string; type: string; enabled: boolean } | null;
  embedding: { id: string; name: string; type: string; enabled: boolean } | null;
  stats: { totalDocuments: number; totalChunks: number; projectCount: number };
}

/* ── SVG Icons ── */

function IconCloud() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconServer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconTool() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();

  const { data: providers = [] } = useQuery<ProviderConnection[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/providers`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const { data: tools = [] } = useQuery<ToolServer[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/integrations`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const { data: knowledge } = useQuery<KnowledgeStatus | null>({
    queryKey: ['knowledge-status-global'],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiBase}/api/knowledge/status`);
        const json = await res.json();
        return json.success ? json.data : null;
      } catch {
        return null;
      }
    },
  });

  const modelProviders = providers.filter(
    (p) => p.capabilities.includes('llm') || p.capabilities.includes('embedding'),
  );

  return (
    <div className="connections-hub">
      <div className="connections-hub__inner">
        <div className="connections-hub__header">
          <h2 className="connections-hub__title">Connections</h2>
          <p className="connections-hub__desc">External services powering your agents</p>
        </div>

        {/* Model Providers */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Model Providers</span>
            <button className="connections-hub__add-btn" onClick={() => navigate('/connections/providers')}>
              Manage
            </button>
          </div>
          <div className="connections-hub__cards">
            {modelProviders.length > 0 ? (
              modelProviders.map((p) => {
                const Icon = PROVIDER_ICONS[p.type] ?? IconLink;
                return (
                  <button
                    key={p.id}
                    className="connections-hub__card"
                    onClick={() => navigate(`/connections/providers/${p.id}`)}
                  >
                    <div className="connections-hub__card-header">
                      <span className="connections-hub__card-icon"><Icon /></span>
                      <span className="connections-hub__card-name">{p.name}</span>
                      <span className={`connections-hub__card-status connections-hub__card-status--${p.enabled ? 'enabled' : 'disabled'}`} />
                    </div>
                    <span className="connections-hub__card-type">{p.type}</span>
                  </button>
                );
              })
            ) : (
              <button className="connections-hub__empty-card" onClick={() => navigate('/connections/providers')}>
                + Add a model provider to get started
              </button>
            )}
          </div>
        </div>

        {/* Knowledge */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Knowledge</span>
            <button className="connections-hub__add-btn" onClick={() => navigate('/connections/knowledge')}>
              Manage
            </button>
          </div>
          <div className="connections-hub__cards">
            {knowledge?.vectorDb ? (
              <button className="connections-hub__card" onClick={() => navigate('/connections/knowledge')}>
                <div className="connections-hub__card-header">
                  <span className="connections-hub__card-icon"><IconDatabase /></span>
                  <span className="connections-hub__card-name">{knowledge.vectorDb.name}</span>
                  <span className={`connections-hub__card-status connections-hub__card-status--${knowledge.vectorDb.enabled ? 'enabled' : 'disabled'}`} />
                </div>
                <span className="connections-hub__card-type">{knowledge.vectorDb.type}</span>
              </button>
            ) : (
              <button className="connections-hub__empty-card" onClick={() => navigate('/connections/knowledge')}>
                + Configure knowledge base
              </button>
            )}
          </div>
          {knowledge ? (
            <p className="connections-hub__knowledge-summary">
              {knowledge.embedding ? `Embedding: via ${knowledge.embedding.name}` : ''}
              {knowledge.embedding && knowledge.stats.totalDocuments > 0 ? ' · ' : ''}
              {knowledge.stats.totalDocuments > 0 ? `${knowledge.stats.totalDocuments} docs · ${knowledge.stats.totalChunks} chunks` : ''}
            </p>
          ) : null}
        </div>

        {/* Tool Servers */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Tool Servers</span>
            <button className="connections-hub__add-btn" onClick={() => navigate('/connections/tools')}>
              Manage
            </button>
          </div>
          <div className="connections-hub__cards">
            {tools.length > 0 ? (
              tools.map((t) => (
                <button
                  key={t.id}
                  className="connections-hub__card"
                  onClick={() => navigate(`/connections/tools/${t.id}`)}
                >
                  <div className="connections-hub__card-header">
                    <span className="connections-hub__card-icon"><IconTool /></span>
                    <span className="connections-hub__card-name">{t.displayName ?? t.id}</span>
                    <span className={`connections-hub__card-status connections-hub__card-status--${t.connected ? 'enabled' : 'disabled'}`} />
                  </div>
                  <span className="connections-hub__card-type">{t.transport}</span>
                </button>
              ))
            ) : (
              <button className="connections-hub__empty-card" onClick={() => navigate('/connections/tools')}>
                + Add a tool server
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
