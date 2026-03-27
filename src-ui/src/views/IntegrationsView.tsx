import { LoadingState } from '@stallion-ai/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './PluginManagementView.css';
import './IntegrationsView.css';
import './page-layout.css';
import './editor-layout.css';

interface IntegrationDef {
  id: string;
  displayName?: string;
  description?: string;
  kind?: string;
  transport?: string;
  command?: string;
  args?: string[];
  endpoint?: string;
  env?: Record<string, string>;
  source?: string;
  plugin?: string;
  usedBy?: string[];
  permissions?: Record<string, boolean>;
  connected?: boolean;
}

interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  installed?: boolean;
  source?: string;
}

/* ── Integration Registry Modal ── */
function RegistryModal({
  apiBase,
  onClose,
}: {
  apiBase: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [filter, setFilter] = useState('');

  const { data: items = [], isLoading } = useQuery<RegistryItem[]>({
    queryKey: ['registry', 'integrations'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/registry/integrations`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return data.success ? data.data || [] : [];
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      item,
      action,
    }: {
      item: RegistryItem;
      action: 'install' | 'uninstall';
    }) => {
      const res =
        action === 'install'
          ? await fetch(`${apiBase}/api/registry/integrations/install`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id }),
            })
          : await fetch(
              `${apiBase}/api/registry/integrations/${encodeURIComponent(item.id)}`,
              { method: 'DELETE' },
            );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || `${action} failed`);
      return { action, name: item.displayName || item.id };
    },
    onSuccess: ({ action, name }) => {
      setMessage({
        type: 'success',
        text: `${action === 'install' ? 'Installed' : 'Removed'} ${name}`,
      });
      qc.invalidateQueries({ queryKey: ['registry', 'integrations'] });
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  const filtered = items.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (item.displayName || item.id).toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div className="plugins__modal" onClick={(e) => e.stopPropagation()}>
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Integration Registry</h3>
          <button className="plugins__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="plugins__modal-body">
          {message && (
            <div
              className={`plugins__modal-message plugins__message--${message.type}`}
            >
              {message.text}
            </div>
          )}
          {isLoading ? (
            <LoadingState message="Loading registry..." />
          ) : items.length === 0 ? (
            <div className="plugins__empty">
              No integration registry configured.
            </div>
          ) : (
            <>
              <input
                className="plugins__filter-input"
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter integrations..."
                autoFocus
              />
              <div className="plugins__registry-list">
                {filtered.length === 0 ? (
                  <div className="plugins__empty">
                    No matches for &ldquo;{filter}&rdquo;
                  </div>
                ) : (
                  filtered.map((item) => (
                    <div key={item.id} className="plugins__registry-item">
                      <div className="plugins__registry-info">
                        <div className="plugins__registry-name">
                          {item.displayName || item.id}
                          {item.version && (
                            <span className="plugins__card-version">
                              v{item.version}
                            </span>
                          )}
                          {item.source && (
                            <span className="plugins__cap plugins__cap--ref">
                              {item.source}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="plugins__registry-desc plugins__registry-desc--clamp">
                            {item.description.replace(/\\n/g, ' ')}
                          </div>
                        )}
                      </div>
                      <button
                        className={`plugins__btn ${item.installed ? 'plugins__btn--uninstall' : 'plugins__btn--install'}`}
                        onClick={() =>
                          actionMutation.mutate({
                            item,
                            action: item.installed ? 'uninstall' : 'install',
                          })
                        }
                        disabled={actionMutation.isPending}
                      >
                        {actionMutation.isPending
                          ? '...'
                          : item.installed
                            ? 'Remove'
                            : 'Install'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Integrations View ── */
export function IntegrationsView() {
  const { apiBase } = useApiBase();
  const qc = useQueryClient();
  const { data: integrations = [], isLoading } = useQuery<IntegrationDef[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/integrations`);
      const data = await res.json();
      return data.success ? data.data || [] : [];
    },
  });
  const [showRegistry, setShowRegistry] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const { selectedId, select, deselect } =
    useUrlSelection('/connections/tools');
  const [editForm, setEditForm] = useState<IntegrationDef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [viewMode, setViewMode] = useState<'form' | 'raw'>('form');
  const [rawJson, setRawJson] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);

  // Load full detail when selected
  const { data: detailData } = useQuery<IntegrationDef>({
    queryKey: ['integrations', selectedId],
    queryFn: async () => {
      const r = await fetch(
        `${apiBase}/integrations/${encodeURIComponent(selectedId!)}`,
      );
      const d = await r.json();
      if (d.success) return d.data;
      throw new Error(d.error || 'Failed to load');
    },
    enabled: !!selectedId && selectedId !== 'new',
  });

  useEffect(() => {
    if (detailData) setEditForm(detailData);
  }, [detailData]);

  const saveMutation = useMutation({
    mutationFn: async (form: IntegrationDef) => {
      const isNew = selectedId === 'new';
      const url = isNew
        ? `${apiBase}/integrations`
        : `${apiBase}/integrations/${encodeURIComponent(form.id)}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');
      return data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Saved' });
      qc.invalidateQueries({ queryKey: ['integrations'] });
      if (selectedId === 'new' && editForm?.id) select(editForm.id);
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/integrations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      deselect();
      setEditForm(null);
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  const reconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `${apiBase}/integrations/${encodeURIComponent(id)}/reconnect`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('Reconnect failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setMessage({ type: 'success', text: 'Reconnecting…' });
    },
    onError: (e: Error) => setMessage({ type: 'error', text: e.message }),
  });

  const handleNew = () => {
    setEditForm({
      id: '',
      kind: 'mcp',
      transport: 'stdio',
      command: '',
      args: [],
      env: {},
      displayName: '',
      description: '',
    });
    setViewMode('form');
    setRawJson('');
    setRawError(null);
    select('new');
  };

  /** Serialize current form to standard mcp.json format */
  const formToMcpJson = (form: IntegrationDef): string => {
    const server: Record<string, any> = {};
    if (form.transport === 'stdio' || !form.transport) {
      if (form.command) server.command = form.command;
      if (form.args?.length) server.args = form.args;
    } else {
      if (form.endpoint) server.url = form.endpoint;
      server.transport = form.transport;
    }
    if (form.env && Object.keys(form.env).length > 0) {
      server.env = form.env;
    }
    const name = form.id || 'my-server';
    return JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
  };

  /** Parse mcp.json (or flat server object) into form fields */
  const parseMcpJson = (json: string): IntegrationDef | null => {
    setRawError(null);
    try {
      const parsed = JSON.parse(json);
      // Support { mcpServers: { name: { ... } } } format
      let id: string;
      let server: any;
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        const keys = Object.keys(parsed.mcpServers);
        if (keys.length === 0) {
          setRawError('No servers found in mcpServers');
          return null;
        }
        id = keys[0];
        server = parsed.mcpServers[id];
      } else if (parsed.command || parsed.url || parsed.endpoint) {
        // Flat format: { command, args, ... }
        id = editForm?.id || '';
        server = parsed;
      } else {
        setRawError(
          'Unrecognized format. Expected { mcpServers: { ... } } or { command, args }',
        );
        return null;
      }
      const transport = server.transport || (server.url ? 'sse' : 'stdio');
      return {
        id,
        kind: 'mcp',
        transport,
        command: server.command || '',
        args: server.args || [],
        endpoint: server.url || server.endpoint || '',
        displayName: editForm?.displayName || id,
        description: editForm?.description || '',
        env: server.env || {},
      };
    } catch (e: any) {
      setRawError(e.message);
      return null;
    }
  };

  const switchToRaw = () => {
    if (editForm) setRawJson(formToMcpJson(editForm));
    setRawError(null);
    setViewMode('raw');
  };

  const switchToForm = () => {
    if (rawJson.trim()) {
      const parsed = parseMcpJson(rawJson);
      if (parsed) setEditForm(parsed);
      else return; // Don't switch if parse failed
    }
    setViewMode('form');
  };

  const items = useMemo(
    () =>
      integrations
        .filter((t) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return (
            (t.displayName || t.id).toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q)
          );
        })
        .map((t) => ({
          id: t.id,
          name: t.displayName || t.id,
          subtitle: [t.transport || t.kind, t.description]
            .filter(Boolean)
            .join(' · '),
          icon: (
            <span
              className={`status-dot status-dot--${t.connected ? 'connected' : 'disconnected'}`}
            />
          ),
        })),
    [integrations, search],
  );

  const isNew = selectedId === 'new';
  const locked = !!(editForm?.plugin && isLocked && !isNew);

  return (
    <>
      <SplitPaneLayout
        label="connections / tools"
        title="Tool Servers"
        subtitle="MCP server connections"
        items={items}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={(id) => {
          select(id);
          setMessage(null);
          setIsLocked(true);
        }}
        onDeselect={() => {
          deselect();
          setEditForm(null);
        }}
        onSearch={setSearch}
        searchPlaceholder="Search tool servers..."
        onAdd={handleNew}
        addLabel="+ Add Tool Server"
        sidebarActions={
          <button
            className="split-pane__add-btn split-pane__add-btn--secondary"
            onClick={() => setShowRegistry(true)}
          >
            Browse Registry
          </button>
        }
        emptyIcon="⚙"
        emptyTitle="No integration selected"
        emptyDescription="Select an integration to edit, or add a new one"
        emptyContent={
          <div className="split-pane__empty">
            <div className="split-pane__empty-icon">⚙</div>
            <p className="split-pane__empty-title">No integration selected</p>
            <p className="split-pane__empty-desc">
              Select an integration to edit, or add a new one
            </p>
          </div>
        }
      >
        {editForm && (
          <div className="detail-panel">
            <DetailHeader
              title={editForm.displayName || editForm.id || 'New Integration'}
              badge={
                editForm.transport
                  ? { label: editForm.transport, variant: 'muted' as const }
                  : undefined
              }
              statusDot={
                !isNew
                  ? editForm.connected
                    ? 'connected'
                    : 'disconnected'
                  : undefined
              }
            >
              {!isNew && !editForm.connected && (
                <button
                  type="button"
                  className="editor-btn"
                  onClick={() => reconnectMutation.mutate(editForm.id)}
                  disabled={reconnectMutation.isPending}
                >
                  {reconnectMutation.isPending ? 'Reconnecting…' : 'Reconnect'}
                </button>
              )}
              {!isNew && (
                <button
                  type="button"
                  className="editor-btn editor-btn--danger"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                className="editor-btn editor-btn--primary"
                onClick={() => editForm && saveMutation.mutate(editForm)}
                disabled={saveMutation.isPending || !editForm.id || locked}
              >
                {saveMutation.isPending ? 'Saving…' : isNew ? 'Create' : 'Save'}
              </button>
            </DetailHeader>

            <div className="detail-panel__body">
              {message && (
                <div
                  className={`plugins__message plugins__message--${message.type}`}
                >
                  {message.text}
                </div>
              )}

              {/* Form / Raw toggle */}
              <div className="integration__mode-tabs">
                <button
                  className={`integration__mode-tab ${viewMode === 'form' ? 'integration__mode-tab--active' : ''}`}
                  onClick={() => switchToForm()}
                >
                  Form
                </button>
                <button
                  className={`integration__mode-tab ${viewMode === 'raw' ? 'integration__mode-tab--active' : ''}`}
                  onClick={() => switchToRaw()}
                >
                  Raw JSON
                </button>
              </div>

              {viewMode === 'raw' ? (
                <div className="integration__raw-section">
                  <div className="integration__raw-hint">
                    Paste a standard <code>mcp.json</code> config — compatible
                    with Claude Desktop, Cursor, Windsurf, etc.
                  </div>
                  <textarea
                    className="integration__raw-editor"
                    value={rawJson}
                    onChange={(e) => {
                      setRawJson(e.target.value);
                      setRawError(null);
                    }}
                    placeholder={
                      '{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "my-mcp-server"]\n    }\n  }\n}'
                    }
                    spellCheck={false}
                    disabled={locked}
                  />
                  {rawError && (
                    <div className="integration__raw-error">{rawError}</div>
                  )}
                </div>
              ) : (
                <>
                  {/* Plugin lock banner */}
                  {editForm.plugin && isLocked && !isNew && (
                    <div className="editor__lock-banner">
                      <span>
                        🔒 Managed by plugin &ldquo;{editForm.plugin}&rdquo;.
                        Edits will be overwritten on plugin updates.
                      </span>
                      <button
                        type="button"
                        className="editor__lock-btn"
                        onClick={() => setIsLocked(false)}
                      >
                        Unlock
                      </button>
                    </div>
                  )}

                  <div className="editor-field">
                    <label className="editor-label" htmlFor="int-id">
                      ID
                    </label>
                    <input
                      id="int-id"
                      className="editor-input"
                      value={editForm.id}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, id: e.target.value })
                      }
                      placeholder="my-integration"
                      disabled={!isNew || locked}
                    />
                    {!isNew && (
                      <span className="editor-hint">
                        ID cannot be changed after creation
                      </span>
                    )}
                  </div>
                  <div className="editor-field">
                    <label className="editor-label" htmlFor="int-name">
                      Display Name
                    </label>
                    <input
                      id="int-name"
                      className="editor-input"
                      value={editForm.displayName || ''}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, displayName: e.target.value },
                        )
                      }
                      placeholder="My Integration"
                      disabled={locked}
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label" htmlFor="int-desc">
                      Description
                    </label>
                    <input
                      id="int-desc"
                      className="editor-input"
                      value={editForm.description || ''}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, description: e.target.value },
                        )
                      }
                      placeholder="What this integration does"
                      disabled={locked}
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label" htmlFor="int-transport">
                      Transport
                    </label>
                    <select
                      id="int-transport"
                      className="editor-select"
                      aria-label="Transport"
                      value={editForm.transport || 'stdio'}
                      disabled={locked}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, transport: e.target.value },
                        )
                      }
                    >
                      <option value="stdio">stdio</option>
                      <option value="sse">SSE</option>
                      <option value="streamable-http">Streamable HTTP</option>
                      <option value="process">Process</option>
                      <option value="ws">WebSocket</option>
                      <option value="tcp">TCP</option>
                    </select>
                    <p className="editor-help">
                      Connection fields change based on transport type
                    </p>
                  </div>
                  {(!editForm.transport ||
                    editForm.transport === 'stdio' ||
                    editForm.transport === 'process') && (
                    <>
                      <div className="editor-field">
                        <label className="editor-label" htmlFor="int-cmd">
                          Command
                        </label>
                        <input
                          id="int-cmd"
                          className="editor-input"
                          value={editForm.command || ''}
                          onChange={(e) =>
                            setEditForm(
                              (f) => f && { ...f, command: e.target.value },
                            )
                          }
                          placeholder="npx, uvx, node, etc."
                          disabled={locked}
                        />
                      </div>
                      <div className="editor-field">
                        <label className="editor-label" htmlFor="int-args">
                          Arguments
                        </label>
                        <input
                          id="int-args"
                          className="editor-input"
                          value={(editForm.args || []).join(' ')}
                          onChange={(e) =>
                            setEditForm(
                              (f) =>
                                f && {
                                  ...f,
                                  args: e.target.value
                                    .split(/\s+/)
                                    .filter(Boolean),
                                },
                            )
                          }
                          placeholder="Space-separated arguments"
                          disabled={locked}
                        />
                      </div>
                    </>
                  )}
                  {(editForm.transport === 'sse' ||
                    editForm.transport === 'streamable-http' ||
                    editForm.transport === 'ws' ||
                    editForm.transport === 'tcp') && (
                    <div className="editor-field">
                      <label className="editor-label" htmlFor="int-endpoint">
                        Endpoint URL
                      </label>
                      <input
                        id="int-endpoint"
                        className="editor-input"
                        value={editForm.endpoint || ''}
                        onChange={(e) =>
                          setEditForm(
                            (f) => f && { ...f, endpoint: e.target.value },
                          )
                        }
                        placeholder="http://localhost:3001/mcp"
                        disabled={locked}
                      />
                    </div>
                  )}
                  {/* Environment Variables */}
                  <div className="editor-field">
                    <label className="editor-label">
                      Environment Variables
                    </label>
                    {Object.entries(editForm.env || {}).map(([key, val], i) => (
                      <div key={i} className="editor-kv-row">
                        <input
                          className="editor-input editor-input--half"
                          value={key}
                          placeholder="KEY"
                          disabled={locked}
                          onChange={(e) => {
                            const entries = Object.entries(editForm.env || {});
                            entries[i] = [e.target.value, val];
                            setEditForm(
                              (f) =>
                                f && { ...f, env: Object.fromEntries(entries) },
                            );
                          }}
                        />
                        <input
                          className="editor-input editor-input--half"
                          value={val}
                          placeholder="value"
                          disabled={locked}
                          onChange={(e) => {
                            setEditForm(
                              (f) =>
                                f && {
                                  ...f,
                                  env: {
                                    ...(f.env || {}),
                                    [key]: e.target.value,
                                  },
                                },
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="editor-btn--icon"
                          disabled={locked}
                          onClick={() => {
                            const { [key]: _, ...rest } = editForm.env || {};
                            setEditForm((f) => f && { ...f, env: rest });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="editor-btn--ghost"
                      disabled={locked}
                      onClick={() =>
                        setEditForm(
                          (f) =>
                            f && { ...f, env: { ...(f.env || {}), '': '' } },
                        )
                      }
                    >
                      + Add Variable
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      {showRegistry && (
        <RegistryModal
          apiBase={apiBase}
          onClose={() => {
            setShowRegistry(false);
            qc.invalidateQueries({ queryKey: ['integrations'] });
          }}
        />
      )}

      {deleteConfirm && (
        <div
          className="plugins__confirm-overlay"
          onClick={() => setDeleteConfirm(false)}
        >
          <div
            className="plugins__confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete Integration</h3>
            <p>
              Remove &ldquo;{editForm?.displayName || selectedId}&rdquo;? This
              cannot be undone.
            </p>
            <div className="plugins__confirm-actions">
              <button
                className="plugins__confirm-cancel"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="plugins__confirm-delete"
                onClick={() => {
                  setDeleteConfirm(false);
                  if (selectedId) deleteMutation.mutate(selectedId);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
