import type { ConnectionConfig } from '@stallion-ai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { NavigationView } from '../types';
import { connectionTypeLabel } from '../utils/execution';

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

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* LLM Status */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              color: 'var(--text-muted)',
            }}
          >
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
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
              }}
            >
              LLM
            </span>
          </div>
          {llmProviders.length > 0 ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {llmProviders.map((p) => (
                <button
                  key={p.id}
                  className="provider-overview__card-item"
                  onClick={() => handleSelect(p.id)}
                >
                  <span className="provider-overview__dot provider-overview__dot--active" />
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                    }}
                  >
                    {connectionTypeLabel(p.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                margin: 0,
              }}
            >
              No language model connection configured
            </p>
          )}
        </div>

        {/* Embedding Status */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              color: 'var(--text-muted)',
            }}
          >
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
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
              }}
            >
              Embedding
            </span>
          </div>
          {embeddingProviders.length > 0 ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {embeddingProviders.map((p) => (
                <button
                  key={p.id}
                  className="provider-overview__card-item"
                  onClick={() => handleSelect(p.id)}
                >
                  <span className="provider-overview__dot provider-overview__dot--active" />
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                    }}
                  >
                    {connectionTypeLabel(p.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                margin: 0,
              }}
            >
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
              'connections / model connections': () =>
                onNavigate({ type: 'connections-providers' }),
            }
          : undefined
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
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
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
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                {form.capabilities
                  .filter((c) => c !== 'vectordb')
                  .map((cap) => (
                    <span
                      key={cap}
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {cap}
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
