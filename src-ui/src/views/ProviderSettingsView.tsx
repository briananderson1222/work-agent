import type { ConnectionConfig } from '@stallion-ai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { NavigationView } from '../types';
import { connectionTypeLabel } from '../utils/execution';
import './PluginManagementView.css';
import './page-layout.css';
import './editor-layout.css';

type ProviderConnection = ConnectionConfig & { kind: 'model' };

const PROVIDER_TYPES: {
  type: string;
  name: string;
  desc: string;
  icon: ReactNode;
}[] = [
  {
    type: 'bedrock',
    name: 'Amazon Bedrock',
    desc: 'AWS credentials · Claude, Llama, Mistral',
    icon: (
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
    ),
  },
  {
    type: 'ollama',
    name: 'Ollama',
    desc: 'Local models · free, private',
    icon: (
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
    ),
  },
  {
    type: 'openai-compat',
    name: 'OpenAI-Compatible',
    desc: 'OpenAI, Groq, OpenRouter, LMStudio',
    icon: (
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
    ),
  },
];

function capabilitiesForType(
  type: string,
): ('llm' | 'embedding' | 'vectordb')[] {
  if (type === 'bedrock') return ['llm', 'embedding'];
  if (type === 'ollama') return ['llm', 'embedding'];
  if (type === 'openai-compat') return ['llm', 'embedding'];
  return ['llm'];
}

function defaultConfig(type: string): Record<string, unknown> {
  if (type === 'ollama') return { baseUrl: 'http://localhost:11434' };
  if (type === 'openai-compat') return { baseUrl: '', apiKey: '' };
  if (type === 'bedrock') return { region: '' };
  return {};
}

interface Props {
  selectedProviderId?: string;
  onNavigate: (view: NavigationView) => void;
}

export function ProviderSettingsView({
  selectedProviderId,
  onNavigate,
}: Props) {
  const { apiBase } = useApiBase();
  const qc = useQueryClient();

  const [form, setForm] = useState<Omit<ProviderConnection, 'id'> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [testResult, setTestResult] = useState<{ healthy: boolean } | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: providers = [], isLoading } = useQuery<ProviderConnection[]>({
    queryKey: ['connections', 'models'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/connections/models`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
  });

  const { data: runtimeConnections = [] } = useQuery<any[]>({
    queryKey: ['connections', 'runtimes'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/connections/runtimes`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  // Sync form state when selectedProviderId changes to an existing provider
  useEffect(() => {
    if (!selectedProviderId) {
      setForm(null);
      setIsNew(false);
      setTestResult(null);
      setTestError(null);
      setError(null);
      return;
    }
    const conn = providers.find((p) => p.id === selectedProviderId);
    if (conn) {
      setForm({
        kind: 'model',
        type: conn.type,
        name: conn.name,
        config: { ...conn.config },
        enabled: conn.enabled,
        capabilities: [...conn.capabilities],
        status: conn.status,
        prerequisites: [...conn.prerequisites],
        lastCheckedAt: conn.lastCheckedAt ?? null,
      });
      setIsNew(false);
      setTestResult(null);
      setTestError(null);
      setError(null);
    }
    // If not found, form was already set by handleAddWithType — don't clear it
  }, [selectedProviderId, providers]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProviderConnection) => {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew
        ? `${apiBase}/api/connections`
        : `${apiBase}/api/connections/${data.id}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return json.data as ProviderConnection;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setIsNew(false);
      setError(null);
      onNavigate({ type: 'connections-provider-edit', id: saved.id });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/connections/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setForm(null);
      setIsNew(false);
      onNavigate({ type: 'connections-providers' });
    },
    onError: (err: Error) => setError(err.message),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/connections/${id}/test`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Test failed');
      return json.data as { healthy: boolean };
    },
    onSuccess: (data) => {
      setTestResult(data);
      setTestError(null);
    },
    onError: (err: Error) => {
      setTestResult(null);
      setTestError(err.message);
    },
  });

  function handleSelect(id: string) {
    setShowTypePicker(false);
    onNavigate({ type: 'connections-provider-edit', id });
  }

  function handleAddWithType(type: string, name: string) {
    const id = crypto.randomUUID();
    setIsNew(true);
    setForm({
      kind: 'model',
      type,
      name,
      config: defaultConfig(type),
      enabled: true,
      capabilities: capabilitiesForType(type),
      status: 'ready',
      prerequisites: [],
      lastCheckedAt: null,
    });
    setShowTypePicker(false);
    setError(null);
    onNavigate({ type: 'connections-provider-edit', id });
  }

  function setField<K extends keyof Omit<ProviderConnection, 'id'>>(
    key: K,
    value: Omit<ProviderConnection, 'id'>[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setConfigField(key: string, value: string) {
    setForm((f) => (f ? { ...f, config: { ...f.config, [key]: value } } : f));
  }

  function handleTypeChange(type: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            type,
            config: defaultConfig(type),
            capabilities: capabilitiesForType(type),
          }
        : f,
    );
  }

  function handleSave() {
    if (!form || !selectedProviderId) return;
    saveMutation.mutate({ id: selectedProviderId, ...form });
  }

  const llmEmbeddingProviders = providers.filter(
    (p) =>
      p.capabilities.includes('llm') || p.capabilities.includes('embedding'),
  );

  const filtered = llmEmbeddingProviders.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase()),
  );

  const items = filtered.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    subtitle:
      p.capabilities
        .filter((c) => c !== 'vectordb')
        .map((c) => c.toUpperCase())
        .join(' · ') + (p.type ? ` · ${connectionTypeLabel(p.type)}` : ''),
    icon: (
      <span
        className={`status-dot ${p.enabled ? 'status-dot--connected' : 'status-dot--disconnected'}`}
      />
    ),
  }));

  const llmProviders = useMemo(
    () =>
      llmEmbeddingProviders.filter(
        (p) => p.enabled && p.capabilities.includes('llm'),
      ),
    [llmEmbeddingProviders],
  );
  const embeddingProviders = useMemo(
    () =>
      llmEmbeddingProviders.filter(
        (p) => p.enabled && p.capabilities.includes('embedding'),
      ),
    [llmEmbeddingProviders],
  );

  // Type picker shown when "+ Add Provider" is clicked
  const typePicker = (
    <div className="provider-overview">
      <div className="provider-overview__header">
        <h3 className="provider-overview__title">Add Model Connection</h3>
        <p className="provider-overview__desc">
          Choose the type of backend to add
        </p>
      </div>
      <div className="provider-overview__quickstart-options">
        {PROVIDER_TYPES.map((opt) => (
          <button
            key={opt.type}
            className="provider-overview__quickstart-btn"
            onClick={() => handleAddWithType(opt.type, opt.name)}
          >
            <span className="provider-overview__quickstart-icon">
              {opt.icon}
            </span>
            <div>
              <div className="provider-overview__quickstart-name">
                {opt.name}
              </div>
              <div className="provider-overview__quickstart-meta">
                {opt.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const stackOverview = (
    <div className="provider-overview">
      <div className="provider-overview__header">
        <h3 className="provider-overview__title">Model Connection Status</h3>
        <p className="provider-overview__desc">
          Your active LLM and embedding connections
        </p>
      </div>

      <div className="provider-overview__grid">
        {/* LLM Status */}
        <div className="provider-overview__card">
          <div className="provider-overview__card-header">
            <span className="provider-overview__card-icon">
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="provider-overview__card-label">LLM</span>
          </div>
          {llmProviders.length > 0 ? (
            <div className="provider-overview__card-items">
              {llmProviders.map((p) => (
                <button
                  key={p.id}
                  className="provider-overview__card-item"
                  onClick={() => handleSelect(p.id)}
                >
                  <span className="provider-overview__dot provider-overview__dot--active" />
                  <span>{p.name}</span>
                  <span
                    className="provider-overview__card-meta"
                    style={{ marginLeft: 'auto' }}
                  >
                    {connectionTypeLabel(p.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="provider-overview__card-empty">
              No language model connection configured
            </p>
          )}
        </div>

        {/* Embedding Status */}
        <div className="provider-overview__card">
          <div className="provider-overview__card-header">
            <span className="provider-overview__card-icon">
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
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <span className="provider-overview__card-label">Embedding</span>
          </div>
          {embeddingProviders.length > 0 ? (
            <div className="provider-overview__card-items">
              {embeddingProviders.map((p) => (
                <button
                  key={p.id}
                  className="provider-overview__card-item"
                  onClick={() => handleSelect(p.id)}
                >
                  <span className="provider-overview__dot provider-overview__dot--active" />
                  <span>{p.name}</span>
                  <span
                    className="provider-overview__card-meta"
                    style={{ marginLeft: 'auto' }}
                  >
                    {connectionTypeLabel(p.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="provider-overview__card-empty">
              No embedding connection — required for knowledge search
            </p>
          )}
        </div>
      </div>

      {llmEmbeddingProviders.length === 0 && (
        <div className="provider-overview__quickstart">
          <h4 className="provider-overview__quickstart-title">Quick Setup</h4>
          <p className="provider-overview__quickstart-desc">
            Add a model connection to get started
          </p>
          <div className="provider-overview__quickstart-options">
            {PROVIDER_TYPES.map((opt) => (
              <button
                key={opt.type}
                className="provider-overview__quickstart-btn"
                onClick={() => handleAddWithType(opt.type, opt.name)}
              >
                <span className="provider-overview__quickstart-icon">
                  {opt.icon}
                </span>
                <div>
                  <div className="provider-overview__quickstart-name">
                    {opt.name}
                  </div>
                  <div className="provider-overview__quickstart-meta">
                    {opt.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SplitPaneLayout
      label={
        selectedProviderId
          ? 'Connections / Model Connections / Edit'
          : 'Connections / Model Connections'
      }
      breadcrumbLinks={
        selectedProviderId
          ? {
              connections: () => onNavigate({ type: 'connections' }),
              'model connections': () =>
                onNavigate({ type: 'connections-providers' }),
            }
          : { connections: () => onNavigate({ type: 'connections' }) }
      }
      title="Model Connections"
      subtitle="Configure the model backends your agents use"
      items={items}
      loading={isLoading}
      selectedId={selectedProviderId ?? null}
      onSelect={handleSelect}
      onDeselect={() => onNavigate({ type: 'connections-providers' })}
      onSearch={setSearch}
      searchPlaceholder="Search model connections…"
      onAdd={() => {
        setShowTypePicker(true);
        setForm(null);
        onNavigate({ type: 'connections-providers' });
      }}
      addLabel="+ Add Model Connection"
      emptyContent={showTypePicker ? typePicker : stackOverview}
    >
      {form && (
        <div className="editor-layout">
          <DetailHeader
            title={isNew ? 'New Model Connection' : form.name || form.type}
            badge={
              form.type
                ? { label: form.type, variant: 'info' as const }
                : undefined
            }
          >
            {!isNew && selectedProviderId && (
              <button
                className="editor-btn editor-btn--danger"
                onClick={() => deleteMutation.mutate(selectedProviderId)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </button>
            )}
            <button
              className="editor-btn editor-btn--primary"
              onClick={handleSave}
              disabled={saveMutation.isPending || !form.name}
            >
              {saveMutation.isPending ? 'Saving…' : isNew ? 'Create' : 'Save'}
            </button>
          </DetailHeader>

          {error && (
            <div className="plugins__message plugins__message--error">
              {error}
            </div>
          )}

          {/* Form body */}
          <div className="agent-editor__section">
            <div className="editor-field">
              <label className="editor-label">Type</label>
              <select
                className="editor-select"
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                <option value="ollama">Ollama</option>
                <option value="openai-compat">OpenAI-Compatible</option>
                <option value="bedrock">Bedrock</option>
              </select>
            </div>

            <div className="editor-field">
              <label className="editor-label">Name *</label>
              <input
                className="editor-input"
                type="text"
                value={form.name}
                placeholder="My Model Connection"
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>

            <div className="editor-field">
              <label className="editor-label">Capabilities</label>
              <div className="plugins__caps">
                {form.capabilities
                  .filter((c) => c !== 'vectordb')
                  .map((cap) => (
                    <span key={cap} className="plugins__cap">
                      {cap.toUpperCase()}
                    </span>
                  ))}
              </div>
            </div>

            {form.type === 'ollama' && (
              <div className="editor-field">
                <label className="editor-label">Base URL</label>
                <input
                  className="editor-input"
                  type="text"
                  value={(form.config.baseUrl as string) ?? ''}
                  placeholder="http://localhost:11434"
                  onChange={(e) => setConfigField('baseUrl', e.target.value)}
                />
              </div>
            )}

            {form.type === 'openai-compat' && (
              <>
                <div className="editor-field">
                  <label className="editor-label">Base URL</label>
                  <input
                    className="editor-input"
                    type="text"
                    value={(form.config.baseUrl as string) ?? ''}
                    placeholder="https://api.openai.com/v1"
                    onChange={(e) => setConfigField('baseUrl', e.target.value)}
                  />
                </div>
                <div className="editor-field">
                  <label className="editor-label">API Key</label>
                  <input
                    className="editor-input"
                    type="password"
                    value={(form.config.apiKey as string) ?? ''}
                    placeholder="sk-…"
                    onChange={(e) => setConfigField('apiKey', e.target.value)}
                  />
                </div>
              </>
            )}

            {form.type === 'bedrock' && (
              <div className="editor-field">
                <label className="editor-label">Region</label>
                <input
                  className="editor-input"
                  type="text"
                  value={(form.config.region as string) ?? ''}
                  placeholder="us-east-1"
                  onChange={(e) => setConfigField('region', e.target.value)}
                />
              </div>
            )}

            <div className="editor-field">
              <label className="editor-label">Enabled</label>
              <label className="editor-checkbox">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setField('enabled', e.target.checked)}
                />
                <span>Enabled</span>
              </label>
            </div>

            {!isNew && (
              <div className="editor__section">
                <label className="editor-label">Used By</label>
                <div
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  {runtimeConnections
                    .filter((r: any) => r.type === form.type)
                    .map((r: any) => (
                      <span key={r.id} className="page__tag">
                        {r.name}
                      </span>
                    ))}
                  {runtimeConnections.filter((r: any) => r.type === form.type)
                    .length === 0 && (
                    <span
                      style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
                    >
                      No runtimes using this provider
                    </span>
                  )}
                </div>
              </div>
            )}

            {!isNew && selectedProviderId && (
              <div className="editor-field">
                <label className="editor-label">Test</label>
                <div className="editor-row">
                  <button
                    className="editor-btn"
                    onClick={() => testMutation.mutate(selectedProviderId)}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? 'Testing…' : 'Test Connection'}
                  </button>
                </div>
                {testResult && (
                  <p className="editor-help">
                    {testResult.healthy
                      ? '✓ Connection healthy'
                      : '✗ Connection failed'}
                  </p>
                )}
                {testError && <p className="editor-error">✗ {testError}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </SplitPaneLayout>
  );
}
