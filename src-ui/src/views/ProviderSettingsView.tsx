import {
  useDeleteConnectionMutation,
  useModelConnectionsQuery,
  useSaveConnectionMutation,
  useSystemStatusQuery,
  useTestConnectionMutation,
} from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import type { NavigationView } from '../types';
import { ProviderConnectionForm } from './provider-settings/ProviderConnectionForm';
import { ProviderStackOverview } from './provider-settings/ProviderStackOverview';
import { ProviderTypePicker } from './provider-settings/ProviderTypePicker';
import type { ProviderConnection } from './provider-settings/types';
import {
  capabilitiesForType,
  defaultConfig,
  describeProvider,
  filterModelProviders,
} from './provider-settings/utils';

interface Props {
  selectedProviderId?: string;
  onNavigate: (view: NavigationView) => void;
}

export function ProviderSettingsView({
  selectedProviderId,
  onNavigate,
}: Props) {
  const [form, setForm] = useState<Omit<ProviderConnection, 'id'> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [testResult, setTestResult] = useState<{ healthy: boolean } | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: providers = [], isLoading } = useModelConnectionsQuery();
  const { data: systemStatus } = useSystemStatusQuery();
  const modelProviders = providers as ProviderConnection[];
  const hasOllamaProvider = modelProviders.some(
    (provider) => provider.type === 'ollama',
  );
  const hasBedrockProvider = modelProviders.some(
    (provider) => provider.type === 'bedrock',
  );

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
    const conn = modelProviders.find((p) => p.id === selectedProviderId);
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
  }, [modelProviders, selectedProviderId]);

  const saveMutation = useSaveConnectionMutation({
    onSuccess: (saved) => {
      setIsNew(false);
      setError(null);
      onNavigate({ type: 'connections-provider-edit', id: saved.id });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useDeleteConnectionMutation({
    onSuccess: () => {
      setForm(null);
      setIsNew(false);
      onNavigate({ type: 'connections-providers' });
    },
    onError: (err: Error) => setError(err.message),
  });

  const testMutation = useTestConnectionMutation({
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
    saveMutation.mutate({
      connection: { id: selectedProviderId, ...form },
      isNew,
    });
  }

  const llmEmbeddingProviders = filterModelProviders(modelProviders, '');
  const filtered = filterModelProviders(modelProviders, search);

  const items = filtered.map((p) => ({
    id: p.id,
    ...describeProvider(p),
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

  const detectedActions = [
    systemStatus?.providers?.detected.ollama && !hasOllamaProvider
      ? {
          type: 'ollama',
          name: 'Local Ollama',
          label: 'Add detected Ollama',
          detail: 'A local Ollama server is reachable right now.',
        }
      : null,
    systemStatus?.providers?.detected.bedrock && !hasBedrockProvider
      ? {
          type: 'bedrock',
          name: 'Amazon Bedrock',
          label: 'Add detected Bedrock',
          detail: 'AWS credentials are available for Bedrock.',
        }
      : null,
  ].filter(Boolean) as Array<{
    type: string;
    name: string;
    label: string;
    detail: string;
  }>;

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
      emptyContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {detectedActions.length > 0 && (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}
              >
                Detected Providers
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {detectedActions.map((action) => (
                  <button
                    key={action.type}
                    className="provider-overview__quickstart-btn"
                    onClick={() => handleAddWithType(action.type, action.name)}
                  >
                    <div>
                      <div className="provider-overview__quickstart-name">
                        {action.label}
                      </div>
                      <div className="provider-overview__quickstart-meta">
                        {action.detail}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showTypePicker ? (
            <ProviderTypePicker onAdd={handleAddWithType} />
          ) : (
            <ProviderStackOverview
              providers={llmEmbeddingProviders}
              onSelect={handleSelect}
              onAdd={handleAddWithType}
            />
          )}
        </div>
      }
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

          <ProviderConnectionForm
            form={form}
            isNew={isNew}
            selectedProviderId={selectedProviderId}
            testResult={testResult}
            testError={testError}
            isTesting={testMutation.isPending}
            onSetField={setField}
            onSetConfigField={setConfigField}
            onTypeChange={handleTypeChange}
            onTestConnection={(id) => testMutation.mutate(id)}
          />
        </div>
      )}
    </SplitPaneLayout>
  );
}
