import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { NavigationView } from '../types';
import './ConnectionsHub.css';

interface ProviderConnection {
  id: string;
  type: 'ollama' | 'openai-compat' | 'bedrock';
  name: string;
  enabled: boolean;
  capabilities: ('llm' | 'embedding' | 'vectordb')[];
}

interface ToolServer {
  id: string;
  displayName?: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  kind?: string;
}

interface KnowledgeStatus {
  vectorDb: { id: string; name: string; type: string; enabled: boolean } | null;
  embedding: { id: string; name: string; type: string; enabled: boolean } | null;
  stats: { totalDocuments: number; totalChunks: number; projectCount: number };
}

const PROVIDER_ICONS: Record<string, string> = {
  bedrock: '☁️',
  ollama: '🏠',
  'openai-compat': '🔗',
};

export interface ConnectionsHubProps {
  onNavigate: (view: NavigationView) => void;
}

export function ConnectionsHub({ onNavigate: _onNavigate }: ConnectionsHubProps) {
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
              + Add
            </button>
          </div>
          <div className="connections-hub__cards">
            {providers.length > 0 ? (
              providers.map((p) => (
                <button
                  key={p.id}
                  className="connections-hub__card"
                  onClick={() => navigate(`/connections/providers/${p.id}`)}
                >
                  <div className="connections-hub__card-header">
                    <span className="connections-hub__card-icon">{PROVIDER_ICONS[p.type] ?? '🔌'}</span>
                    <span className="connections-hub__card-name">{p.name}</span>
                    <span className={`connections-hub__card-status connections-hub__card-status--${p.enabled ? 'enabled' : 'disabled'}`} />
                  </div>
                  <span className="connections-hub__card-type">{p.type}</span>
                </button>
              ))
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
              + Add
            </button>
          </div>
          <div className="connections-hub__cards">
            {knowledge?.vectorDb ? (
              <button className="connections-hub__card" onClick={() => navigate('/connections/knowledge')}>
                <div className="connections-hub__card-header">
                  <span className="connections-hub__card-icon">🗄️</span>
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
              {knowledge.embedding ? `Embedding: via ${knowledge.embedding.name} · ` : ''}
              {knowledge.stats.totalDocuments} docs · {knowledge.stats.totalChunks} chunks
            </p>
          ) : (
            <p className="connections-hub__knowledge-summary">Knowledge base not configured</p>
          )}
        </div>

        {/* Tool Servers */}
        <div className="connections-hub__section">
          <div className="connections-hub__section-header">
            <span className="connections-hub__section-label">Tool Servers</span>
            <button className="connections-hub__add-btn" onClick={() => navigate('/connections/tools')}>
              + Add
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
                    <span className="connections-hub__card-icon">⚙</span>
                    <span className="connections-hub__card-name">{t.displayName ?? t.id}</span>
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
