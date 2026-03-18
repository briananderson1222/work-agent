import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import './KnowledgeConnectionView.css';

interface ProviderConnection {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  capabilities: ('llm' | 'embedding' | 'vectordb')[];
}

interface KnowledgeStatus {
  vectorDb: { id: string; name: string; type: string; enabled: boolean } | null;
  embedding: {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
  } | null;
  stats: { totalDocuments: number; totalChunks: number; projectCount: number };
}

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function KnowledgeConnectionView() {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const qc = useQueryClient();

  const { data: providers = [] } = useQuery<ProviderConnection[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/providers`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const { data: status } = useQuery<KnowledgeStatus | null>({
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

  const vectorDb = providers.find((p) =>
    p.capabilities.includes('vectordb'),
  );
  const embeddingProvider = providers.find(
    (p) => p.enabled && p.capabilities.includes('embedding'),
  );

  const [dataDir, setDataDir] = useState<string | null>(null);
  const editingDataDir =
    dataDir ?? ((vectorDb?.config.dataDir as string) || '');

  const [testResult, setTestResult] = useState<{
    healthy: boolean;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!vectorDb) return;
      const res = await fetch(`${apiBase}/api/providers/${vectorDb.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...vectorDb,
          config: { ...vectorDb.config, dataDir: editingDataDir },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      setDataDir(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!vectorDb) return;
      const res = await fetch(
        `${apiBase}/api/providers/${vectorDb.id}/test-vectordb`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Test failed');
      return json.data as { healthy: boolean };
    },
    onSuccess: (data) => {
      setTestResult(data ?? null);
      setTestError(null);
    },
    onError: (err: Error) => {
      setTestResult(null);
      setTestError(err.message);
    },
  });

  const stats = status?.stats;
  const dirty = dataDir !== null && dataDir !== (vectorDb?.config.dataDir as string);

  return (
    <div className="knowledge-view">
      <div className="knowledge-view__inner">
        <div className="knowledge-view__header">
          <h2 className="knowledge-view__title">Knowledge</h2>
          <p className="knowledge-view__desc">
            Vector database and embedding configuration
          </p>
        </div>

        {/* Vector Database */}
        <div className="knowledge-view__section">
          <div className="knowledge-view__section-label">Vector Database</div>
          {vectorDb ? (
            <div className="knowledge-view__card">
              <div className="knowledge-view__card-header">
                <span className="knowledge-view__card-icon">
                  <IconDatabase />
                </span>
                <span className="knowledge-view__card-name">
                  {vectorDb.name}
                </span>
                <span className="knowledge-view__card-type">
                  {vectorDb.type}
                </span>
                <span className="knowledge-view__card-spacer" />
                <span
                  className={`knowledge-view__status knowledge-view__status--${vectorDb.enabled ? 'enabled' : 'disabled'}`}
                >
                  {vectorDb.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="knowledge-view__field">
                <label className="knowledge-view__field-label">
                  Data Directory
                </label>
                <input
                  className="knowledge-view__field-input"
                  type="text"
                  value={editingDataDir}
                  onChange={(e) => setDataDir(e.target.value)}
                />
              </div>

              <div className="knowledge-view__actions">
                <button
                  className="editor-btn editor-btn--primary"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !dirty}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="editor-btn"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending
                    ? 'Testing...'
                    : 'Test Connection'}
                </button>
                {testResult && (
                  <span
                    className={`knowledge-view__test-result knowledge-view__test-result--${testResult.healthy ? 'ok' : 'fail'}`}
                  >
                    {testResult.healthy
                      ? '\u2713 Healthy'
                      : '\u2717 Connection failed'}
                  </span>
                )}
                {testError && (
                  <span className="knowledge-view__test-result knowledge-view__test-result--fail">
                    \u2717 {testError}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="knowledge-view__empty">
              No vector database configured
            </p>
          )}
        </div>

        {/* Embedding Provider */}
        <div className="knowledge-view__section">
          <div className="knowledge-view__section-label">
            Embedding Provider
          </div>
          {embeddingProvider ? (
            <div className="knowledge-view__card">
              <div className="knowledge-view__card-header">
                <span className="knowledge-view__card-icon">
                  <IconGlobe />
                </span>
                <span className="knowledge-view__card-name">
                  {embeddingProvider.name}
                </span>
                <span className="knowledge-view__card-type">
                  {embeddingProvider.type}
                </span>
                <span className="knowledge-view__card-spacer" />
                <button
                  className="knowledge-view__link"
                  onClick={() =>
                    navigate(
                      `/connections/providers/${embeddingProvider.id}`,
                    )
                  }
                >
                  Edit →
                </button>
              </div>
              <p className="knowledge-view__card-desc">
                Provides embedding vectors for knowledge indexing and
                semantic search
              </p>
            </div>
          ) : (
            <p className="knowledge-view__empty">
              No embedding provider configured.{' '}
              <button
                className="knowledge-view__link"
                onClick={() => navigate('/connections/providers')}
              >
                Add one in Model Providers →
              </button>
            </p>
          )}
        </div>

        {/* Stats */}
        {stats && (stats.totalDocuments > 0 || stats.projectCount > 0) && (
          <div className="knowledge-view__section">
            <div className="knowledge-view__section-label">Usage</div>
            <div className="knowledge-view__stats">
              <div className="knowledge-view__stat">
                <span className="knowledge-view__stat-value">
                  {stats.totalDocuments}
                </span>
                <span className="knowledge-view__stat-label">documents</span>
              </div>
              <div className="knowledge-view__stat">
                <span className="knowledge-view__stat-value">
                  {stats.totalChunks.toLocaleString()}
                </span>
                <span className="knowledge-view__stat-label">chunks</span>
              </div>
              <div className="knowledge-view__stat">
                <span className="knowledge-view__stat-value">
                  {stats.projectCount}
                </span>
                <span className="knowledge-view__stat-label">projects</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
