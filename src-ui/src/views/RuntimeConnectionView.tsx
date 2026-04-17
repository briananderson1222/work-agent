import type { ConnectionConfig } from '@stallion-ai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { NavigationView } from '../types';
import {
  capabilityLabel,
  connectionStatusLabel,
  connectionTypeLabel,
  prerequisiteCategoryLabel,
  prerequisiteStatusLabel,
} from '../utils/execution';
import './PluginManagementView.css';
import './page-layout.css';
import './editor-layout.css';

interface RuntimeConnectionViewProps {
  selectedRuntimeId?: string;
  onNavigate: (view: NavigationView) => void;
}

export function RuntimeConnectionView({
  selectedRuntimeId,
  onNavigate,
}: RuntimeConnectionViewProps) {
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ConnectionConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: runtimes = [], isLoading } = useQuery<ConnectionConfig[]>({
    queryKey: ['connections', 'runtimes'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/connections/runtimes`);
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Failed to load runtimes');
      return json.data;
    },
  });

  const { data: runtime } = useQuery<ConnectionConfig | null>({
    queryKey: ['connections', selectedRuntimeId],
    queryFn: async () => {
      if (!selectedRuntimeId) return null;
      const res = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(selectedRuntimeId)}`,
      );
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Failed to load runtime');
      return json.data;
    },
    enabled: !!selectedRuntimeId,
  });

  useEffect(() => {
    if (!runtime) {
      setForm(null);
      setError(null);
      return;
    }
    setForm({
      ...runtime,
      capabilities: [...runtime.capabilities],
      config: { ...runtime.config },
      prerequisites: [...runtime.prerequisites],
    });
    setError(null);
  }, [runtime]);

  const saveMutation = useMutation({
    mutationFn: async (data: ConnectionConfig) => {
      const res = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(data.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to save runtime connection');
      }
      return json.data as ConnectionConfig;
    },
    onSuccess: async (saved) => {
      setForm(saved);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
      onNavigate({ type: 'connections-runtime-edit', id: saved.id });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to reset runtime connection');
      }
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `${apiBase}/api/connections/${encodeURIComponent(id)}/test`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Test failed');
      return json.data as {
        healthy: boolean;
        status: ConnectionConfig['status'];
      };
    },
  });

  const items = useMemo(
    () =>
      runtimes
        .filter((connection) => {
          if (!search) return true;
          const query = search.toLowerCase();
          return (
            connection.name.toLowerCase().includes(query) ||
            connection.type.toLowerCase().includes(query)
          );
        })
        .map((connection) => ({
          id: connection.id,
          name: connection.name,
          subtitle: `${connectionStatusLabel(connection.status)} · ${connectionTypeLabel(connection.type)}`,
          icon: (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background:
                  connection.status === 'ready'
                    ? 'var(--success-text, #22c55e)'
                    : 'var(--warning-text, #f59e0b)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          ),
        })),
    [runtimes, search],
  );

  function setField<K extends keyof ConnectionConfig>(
    key: K,
    value: ConnectionConfig[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setConfigField(key: string, value: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            config: {
              ...current.config,
              [key]: value,
            },
          }
        : current,
    );
  }

  return (
    <SplitPaneLayout
      label={
        selectedRuntimeId
          ? 'Connections / Runtime Connections / Detail'
          : 'Connections / Runtime Connections'
      }
      breadcrumbLinks={
        selectedRuntimeId
          ? {
              connections: () => onNavigate({ type: 'connections' }),
              'runtime connections': () =>
                onNavigate({ type: 'connections-runtimes' } as NavigationView),
            }
          : { connections: () => onNavigate({ type: 'connections' }) }
      }
      title="Runtime Connections"
      subtitle="Check readiness and test your AI runtimes"
      loading={isLoading}
      items={items}
      selectedId={selectedRuntimeId ?? null}
      onSelect={(id) => onNavigate({ type: 'connections-runtime-edit', id })}
      onDeselect={() =>
        onNavigate({ type: 'connections-runtimes' } as NavigationView)
      }
      onSearch={setSearch}
      emptyTitle="No runtime connections"
      emptyDescription="Registered runtimes will appear here."
      searchPlaceholder="Search runtime connections..."
    >
      {form ? (
        <div className="editor-layout">
          <DetailHeader
            title={form.name}
            badge={{ label: connectionTypeLabel(form.type), variant: 'info' }}
          />
          <div className="agent-editor__section">
            <div className="editor-field">
              <label className="editor-label">Name</label>
              <input
                className="editor-input"
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
              />
            </div>

            <div className="editor-field">
              <label className="editor-label">Type</label>
              <div className="editor-input editor-input--readonly">
                {connectionTypeLabel(form.type)}
              </div>
            </div>

            <div className="editor-field">
              <label className="editor-label">Status</label>
              <div className="editor-input editor-input--readonly">
                {connectionStatusLabel(form.status)}
              </div>
            </div>

            <div className="editor-field">
              <label className="editor-label">Model Backend</label>
              <div
                className="editor-input"
                style={{ background: 'var(--bg-tertiary)', cursor: 'default' }}
              >
                {form.type === 'bedrock'
                  ? 'Amazon Bedrock'
                  : form.type === 'claude'
                    ? 'Claude API (direct)'
                    : form.type === 'codex'
                      ? 'Codex API (direct)'
                      : form.type || 'Unknown'}
              </div>
            </div>

            <div className="editor-field">
              <label className="editor-label" htmlFor="runtime-enabled">
                Enabled
              </label>
              <label className="editor-checkbox">
                <input
                  id="runtime-enabled"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setField('enabled', event.target.checked)
                  }
                />
                <span>Expose this runtime in Connections and agent setup</span>
              </label>
            </div>

            <div className="editor-field">
              <label className="editor-label">Capabilities</label>
              <div className="plugins__caps">
                {form.capabilities.map((capability) => (
                  <span key={capability} className="plugins__cap">
                    {capabilityLabel(capability)}
                  </span>
                ))}
              </div>
            </div>

            <div className="editor-field">
              <label className="editor-label">Description</label>
              <p className="editor-help">
                {form.description || 'No description available.'}
              </p>
            </div>

            {'defaultModel' in form.config && (
              <div className="editor-field">
                <label className="editor-label">Default Model</label>
                <input
                  className="editor-input"
                  value={String(form.config.defaultModel || '')}
                  onChange={(event) =>
                    setConfigField('defaultModel', event.target.value)
                  }
                  placeholder="App default"
                />
                <p className="editor-help">
                  Optional runtime-scoped default model hint. Leave blank to
                  inherit the app default.
                </p>
              </div>
            )}

            <div className="editor-field">
              <label className="editor-label">Prerequisites</label>
              {form.prerequisites.length > 0 ? (
                <div className="plugins__registry-list">
                  {form.prerequisites.map((item) => (
                    <div key={item.id} className="plugins__registry-item">
                      <div className="plugins__registry-info">
                        <div className="plugins__registry-name">
                          {item.name}
                          <span className="plugins__cap plugins__cap--ref">
                            {prerequisiteCategoryLabel(item.category)}
                          </span>
                          <span
                            className={`plugins__cap plugins__cap--ref ${item.status === 'installed' ? 'plugins__cap--ok' : item.status === 'warning' ? 'plugins__cap--warn' : 'plugins__cap--error'}`}
                          >
                            {prerequisiteStatusLabel(item.status)}
                          </span>
                        </div>
                        {item.description && (
                          <div className="plugins__registry-desc">
                            {item.description}
                          </div>
                        )}
                        {item.installGuide && (
                          <div style={{ marginTop: 8 }}>
                            <ol
                              style={{
                                margin: '4px 0 0',
                                paddingLeft: 20,
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {item.installGuide.steps.map((step, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>
                                  {step}
                                </li>
                              ))}
                            </ol>
                            {item.installGuide.links?.map((link, i) => (
                              <a
                                key={i}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-block',
                                  marginTop: 4,
                                  marginRight: 12,
                                  fontSize: 12,
                                  color: 'var(--accent-primary)',
                                }}
                              >
                                Documentation →
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="editor-help">No prerequisites reported.</p>
              )}
            </div>

            <div className="editor-field">
              <label className="editor-label">Actions</label>
              <div className="editor-row">
                <button
                  className="editor-btn"
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending || resetMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  className="editor-btn editor-btn--ghost"
                  onClick={() => resetMutation.mutate(form.id)}
                  disabled={saveMutation.isPending || resetMutation.isPending}
                >
                  {resetMutation.isPending ? 'Resetting…' : 'Reset to Defaults'}
                </button>
                <button
                  className="editor-btn"
                  onClick={() => testMutation.mutate(form.id)}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? 'Testing…' : 'Test Connection'}
                </button>
              </div>
              {testMutation.data && (
                <p className="editor-help">
                  {testMutation.data.healthy ? 'Healthy' : 'Unavailable'} ·{' '}
                  {connectionStatusLabel(testMutation.data.status)}
                </p>
              )}
              {testMutation.error && (
                <p className="editor-error">
                  {testMutation.error instanceof Error
                    ? testMutation.error.message
                    : String(testMutation.error)}
                </p>
              )}
              {error && <p className="editor-error">{error}</p>}
            </div>

            <div className="editor-field">
              <label className="editor-label">Configuration</label>
              <p className="editor-help">
                This runtime is detected automatically. To use it, open an agent
                and set it in the Execution section.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="page-layout__empty">
          Select a runtime connection to inspect readiness and run a health
          check.
        </div>
      )}
    </SplitPaneLayout>
  );
}
