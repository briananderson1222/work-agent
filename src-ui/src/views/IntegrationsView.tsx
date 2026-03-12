import { LoadingState } from '@stallion-ai/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './PluginManagementView.css';
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
  source?: string;
  usedBy?: string[];
  permissions?: Record<string, boolean>;
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
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/registry/integrations`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (
    item: RegistryItem,
    action: 'install' | 'uninstall',
  ) => {
    setActionLoading(item.id);
    setMessage(null);
    try {
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
      if (data.success) {
        setMessage({
          type: 'success',
          text: `${action === 'install' ? 'Installed' : 'Removed'} ${item.displayName || item.id}`,
        });
        fetchItems();
      } else {
        setMessage({ type: 'error', text: data.error || `${action} failed` });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

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
          {loading ? (
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
                          <div
                            className="plugins__registry-desc"
                            style={{ maxHeight: 60, overflow: 'hidden' }}
                          >
                            {item.description.replace(/\\n/g, ' ')}
                          </div>
                        )}
                      </div>
                      <button
                        className={`plugins__btn ${item.installed ? 'plugins__btn--uninstall' : 'plugins__btn--install'}`}
                        onClick={() =>
                          handleAction(
                            item,
                            item.installed ? 'uninstall' : 'install',
                          )
                        }
                        disabled={actionLoading === item.id}
                      >
                        {actionLoading === item.id
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
  const [_hasRegistry, setHasRegistry] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const { selectedId, select, deselect } = useUrlSelection('/integrations');
  const [editForm, setEditForm] = useState<IntegrationDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/registry/integrations`)
      .then((r) => r.json())
      .then((d) => setHasRegistry(d.success && d.data?.length > 0))
      .catch(() => {});
  }, [apiBase]);

  // Load full detail when selected
  useEffect(() => {
    if (!selectedId || selectedId === 'new') return;
    fetch(`${apiBase}/integrations/${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEditForm(d.data);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, apiBase]);

  const handleSave = async () => {
    if (!editForm?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      const isNew = selectedId === 'new';
      const _locked = !!(editForm?.plugin && isLocked && !isNew);
      const url = isNew
        ? `${apiBase}/integrations`
        : `${apiBase}/integrations/${encodeURIComponent(editForm.id)}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Saved' });
        qc.invalidateQueries({ queryKey: ['integrations'] });
        if (isNew) select(editForm.id);
      } else {
        setMessage({ type: 'error', text: data.error || 'Save failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleteConfirm(false);
    try {
      await fetch(`${apiBase}/integrations/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
      });
      deselect();
      setEditForm(null);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleNew = () => {
    setEditForm({
      id: '',
      kind: 'mcp',
      transport: 'stdio',
      command: '',
      args: [],
      displayName: '',
      description: '',
    });
    select('new');
  };

  const items = useMemo(
    () =>
      integrations.map((t) => ({
        id: t.id,
        name: t.displayName || t.id,
        subtitle: [t.transport || t.kind, t.description]
          .filter(Boolean)
          .join(' · '),
      })),
    [integrations],
  );

  const isNew = selectedId === 'new';
  const locked = !!(editForm?.plugin && isLocked && !isNew);

  return (
    <>
      <SplitPaneLayout
        label="integrations"
        title="Integrations"
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
        onSearch={() => {}}
        searchPlaceholder="Search integrations..."
        onAdd={handleNew}
        addLabel="+ Add Integration"
        sidebarActions={
          <button
            className="split-pane__add-btn"
            onClick={() => setShowRegistry(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
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
            <div className="agent-inline-editor__header">
              <h2 className="detail-panel__title">
                {editForm.displayName || editForm.id || 'New Integration'}
              </h2>
              <div className="agent-inline-editor__header-actions">
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
                  onClick={handleSave}
                  disabled={saving || !editForm.id || locked}
                >
                  {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
                </button>
              </div>
            </div>

            {message && (
              <div
                className={`plugins__message plugins__message--${message.type}`}
              >
                {message.text}
              </div>
            )}

            {/* Plugin lock banner */}
            {editForm.plugin && isLocked && !isNew && (
              <div className="editor__lock-banner">
                <span>
                  🔒 Managed by plugin &ldquo;{editForm.plugin}&rdquo;. Edits
                  will be overwritten on plugin updates.
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
              <label className="editor-label">ID</label>
              <input
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
              <label className="editor-label">Display Name</label>
              <input
                className="editor-input"
                value={editForm.displayName || ''}
                onChange={(e) =>
                  setEditForm((f) => f && { ...f, displayName: e.target.value })
                }
                placeholder="My Integration"
                disabled={locked}
              />
            </div>
            <div className="editor-field">
              <label className="editor-label">Description</label>
              <input
                className="editor-input"
                value={editForm.description || ''}
                onChange={(e) =>
                  setEditForm((f) => f && { ...f, description: e.target.value })
                }
                placeholder="What this integration does"
                disabled={locked}
              />
            </div>
            <div className="editor-field">
              <label className="editor-label">Transport</label>
              <select
                className="editor-select"
                value={editForm.transport || 'stdio'}
                disabled={locked}
                onChange={(e) =>
                  setEditForm((f) => f && { ...f, transport: e.target.value })
                }
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="streamable-http">Streamable HTTP</option>
              </select>
            </div>
            {(!editForm.transport || editForm.transport === 'stdio') && (
              <>
                <div className="editor-field">
                  <label className="editor-label">Command</label>
                  <input
                    className="editor-input"
                    value={editForm.command || ''}
                    onChange={(e) =>
                      setEditForm((f) => f && { ...f, command: e.target.value })
                    }
                    placeholder="npx, uvx, node, etc."
                    disabled={locked}
                  />
                </div>
                <div className="editor-field">
                  <label className="editor-label">Arguments</label>
                  <input
                    className="editor-input"
                    value={(editForm.args || []).join(' ')}
                    onChange={(e) =>
                      setEditForm(
                        (f) =>
                          f && {
                            ...f,
                            args: e.target.value.split(/\s+/).filter(Boolean),
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
              editForm.transport === 'streamable-http') && (
              <div className="editor-field">
                <label className="editor-label">Endpoint URL</label>
                <input
                  className="editor-input"
                  value={editForm.endpoint || ''}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, endpoint: e.target.value })
                  }
                  placeholder="http://localhost:3001/mcp"
                  disabled={locked}
                />
              </div>
            )}
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
                onClick={handleDelete}
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
