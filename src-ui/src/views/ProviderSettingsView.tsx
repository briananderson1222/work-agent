import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { NavigationView } from '../types';

interface ProviderConnection {
  id: string;
  type: 'ollama' | 'openai-compat' | 'bedrock';
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  capabilities: ('llm' | 'embedding')[];
}

const PROVIDER_TYPES = [
  {
    type: 'bedrock' as const,
    name: 'Amazon Bedrock',
    desc: 'AWS credentials · Claude, Llama, Mistral',
    icon: '☁️',
  },
  {
    type: 'ollama' as const,
    name: 'Ollama',
    desc: 'Local models · free, private',
    icon: '🏠',
  },
  {
    type: 'openai-compat' as const,
    name: 'OpenAI-Compatible',
    desc: 'OpenAI, Groq, OpenRouter, LMStudio',
    icon: '🔗',
  },
] as const;

function defaultConfig(
  type: ProviderConnection['type'],
): Record<string, unknown> {
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
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/providers`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
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
        type: conn.type,
        name: conn.name,
        config: { ...conn.config },
        enabled: conn.enabled,
        capabilities: [...conn.capabilities],
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
        ? `${apiBase}/api/providers`
        : `${apiBase}/api/providers/${data.id}`;
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
      qc.invalidateQueries({ queryKey: ['providers'] });
      setIsNew(false);
      setError(null);
      onNavigate({ type: 'provider-edit', id: saved.id });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/providers/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      setForm(null);
      setIsNew(false);
      onNavigate({ type: 'providers' });
    },
    onError: (err: Error) => setError(err.message),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/providers/${id}/test`, {
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
    onNavigate({ type: 'provider-edit', id });
  }

  function handleAddWithType(type: ProviderConnection['type'], name: string) {
    const id = crypto.randomUUID();
    setIsNew(true);
    setForm({
      type,
      name,
      config: defaultConfig(type),
      enabled: true,
      capabilities: ['llm'],
    });
    setShowTypePicker(false);
    setError(null);
    onNavigate({ type: 'provider-edit', id });
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

  function toggleCapability(cap: 'llm' | 'embedding') {
    setForm((f) => {
      if (!f) return f;
      const caps = f.capabilities.includes(cap)
        ? f.capabilities.filter((c) => c !== cap)
        : [...f.capabilities, cap];
      return { ...f, capabilities: caps };
    });
  }

  function handleTypeChange(type: ProviderConnection['type']) {
    setForm((f) => (f ? { ...f, type, config: defaultConfig(type) } : f));
  }

  function handleSave() {
    if (!form || !selectedProviderId) return;
    saveMutation.mutate({ id: selectedProviderId, ...form });
  }

  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase()),
  );

  const items = filtered.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    subtitle: p.type,
    icon: (
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: p.enabled
            ? 'var(--success-text, #22c55e)'
            : 'var(--text-muted)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    ),
  }));

  const llmProviders = useMemo(
    () => providers.filter((p) => p.enabled && p.capabilities.includes('llm')),
    [providers],
  );
  const embeddingProviders = useMemo(
    () =>
      providers.filter(
        (p) => p.enabled && p.capabilities.includes('embedding'),
      ),
    [providers],
  );

  // Type picker shown when "+ Add Provider" is clicked
  const typePicker = (
    <div className="provider-overview">
      <div className="provider-overview__header">
        <h3 className="provider-overview__title">Add Provider</h3>
        <p className="provider-overview__desc">
          Choose a provider type to configure
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
        <h3 className="provider-overview__title">Provider Stack</h3>
        <p className="provider-overview__desc">
          Your active AI infrastructure at a glance
        </p>
      </div>

      <div className="provider-overview__grid">
        <div className="provider-overview__card">
          <div className="provider-overview__card-header">
            <span className="provider-overview__card-icon">💬</span>
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
                </button>
              ))}
            </div>
          ) : (
            <p className="provider-overview__card-empty">
              No LLM provider configured
            </p>
          )}
        </div>

        <div className="provider-overview__card">
          <div className="provider-overview__card-header">
            <span className="provider-overview__card-icon">🧬</span>
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
                </button>
              ))}
            </div>
          ) : (
            <p className="provider-overview__card-empty">
              No embedding provider configured
            </p>
          )}
        </div>

        <div className="provider-overview__card">
          <div className="provider-overview__card-header">
            <span className="provider-overview__card-icon">🗄️</span>
            <span className="provider-overview__card-label">Vector Store</span>
          </div>
          <div className="provider-overview__card-items">
            <div className="provider-overview__card-item provider-overview__card-item--static">
              <span className="provider-overview__dot provider-overview__dot--active" />
              <div>
                <span>LanceDB</span>
                <span className="provider-overview__card-meta">
                  file-based · cosine similarity
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {providers.length === 0 && (
        <div className="provider-overview__quickstart">
          <h4 className="provider-overview__quickstart-title">Quick Setup</h4>
          <p className="provider-overview__quickstart-desc">
            Add a provider to get started
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
      label={selectedProviderId ? 'Providers / Edit' : 'Providers'}
      breadcrumbLinks={
        selectedProviderId
          ? { providers: () => onNavigate({ type: 'providers' }) }
          : undefined
      }
      title="Provider Connections"
      subtitle="Manage LLM, embedding, and vector store providers"
      items={items}
      loading={isLoading}
      selectedId={selectedProviderId ?? null}
      onSelect={handleSelect}
      onDeselect={() => onNavigate({ type: 'providers' })}
      onSearch={setSearch}
      searchPlaceholder="Search providers…"
      onAdd={() => setShowTypePicker(true)}
      addLabel="+ Add Provider"
      emptyContent={showTypePicker ? typePicker : stackOverview}
    >
      {form && (
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {isNew ? 'New Provider' : form.name || form.type}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                margin: '12px 24px',
                padding: '10px 14px',
                background: 'var(--error-bg)',
                border: '1px solid var(--error-border)',
                borderRadius: '6px',
                color: 'var(--error-text)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {/* Form body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div className="editor-field">
              <label className="editor-label">Type</label>
              <select
                className="editor-select"
                value={form.type}
                onChange={(e) =>
                  handleTypeChange(e.target.value as ProviderConnection['type'])
                }
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
                placeholder="My Provider"
                onChange={(e) => setField('name', e.target.value)}
              />
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
              <label className="editor-label">Capabilities</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                {(['llm', 'embedding'] as const).map((cap) => (
                  <label
                    key={cap}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.capabilities.includes(cap)}
                      onChange={() => toggleCapability(cap)}
                    />
                    {cap === 'llm' ? 'LLM' : 'Embedding'}
                  </label>
                ))}
              </div>
            </div>

            <div className="editor-field">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setField('enabled', e.target.checked)}
                />
                Enabled
              </label>
            </div>

            {!isNew && selectedProviderId && (
              <div
                style={{
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-primary)',
                }}
              >
                <button
                  className="editor-btn"
                  onClick={() => testMutation.mutate(selectedProviderId)}
                  disabled={testMutation.isPending}
                  style={{ marginBottom: '8px' }}
                >
                  {testMutation.isPending ? 'Testing…' : 'Test Connection'}
                </button>
                {testResult && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: testResult.healthy
                        ? 'var(--success-text, #22c55e)'
                        : 'var(--error-text)',
                      marginTop: '6px',
                    }}
                  >
                    {testResult.healthy
                      ? '✓ Connection healthy'
                      : '✗ Connection failed'}
                  </div>
                )}
                {testError && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--error-text)',
                      marginTop: '6px',
                    }}
                  >
                    ✗ {testError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SplitPaneLayout>
  );
}
