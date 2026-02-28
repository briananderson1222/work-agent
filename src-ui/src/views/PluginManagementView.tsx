import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '@work-agent/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
import { usePermissions } from '../core/PermissionManager';
import './PluginManagementView.css';

interface Plugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  hasBundle: boolean;
  workspace?: { slug: string };
  agents?: Array<{ slug: string }>;
  providers?: Array<{ type: string }>;
  git?: { hash: string; branch: string; remote?: string };
  permissions?: { declared: string[]; granted: string[]; missing: Array<{ permission: string; tier: 'passive' | 'active' | 'trusted' }> };
}

interface ToolDef {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  transport?: string;
  enabled?: boolean;
}

interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  status?: string;
  installed: boolean;
}

/* ── Tool Registry Modal ── */
function ToolRegistryModal({ apiBase, onClose }: { apiBase: string; onClose: () => void }) {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/registry/tools`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAction = async (item: RegistryItem, action: 'install' | 'uninstall') => {
    setActionLoading(item.id);
    setMessage(null);
    try {
      const res = action === 'install'
        ? await fetch(`${apiBase}/api/registry/tools/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
        : await fetch(`${apiBase}/api/registry/tools/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || `${action === 'install' ? 'Installed' : 'Removed'} ${item.displayName || item.id}` });
        fetchItems();
      } else {
        setMessage({ type: 'error', text: data.error || `${action} failed` });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
    finally { setActionLoading(null); }
  };

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div className="plugins__modal" onClick={e => e.stopPropagation()}>
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Tool Registry</h3>
          <button className="plugins__modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="plugins__modal-body">
          {message && <div className={`plugins__modal-message plugins__message--${message.type}`}>{message.text}</div>}
          {loading ? (
            <LoadingState message="Loading registry..." />
          ) : items.length === 0 ? (
            <div className="plugins__empty">No tool registry provider configured.</div>
          ) : (
            <div className="plugins__registry-list">
              {items.map(item => (
                <div key={item.id} className="plugins__registry-item">
                  <div className="plugins__registry-info">
                    <div className="plugins__registry-name">
                      {item.displayName || item.id}
                      {item.version && <span className="plugins__card-version">v{item.version}</span>}
                    </div>
                    {item.description && <div className="plugins__registry-desc">{item.description}</div>}
                  </div>
                  <button
                    className={`plugins__btn ${item.installed ? 'plugins__btn--uninstall' : 'plugins__btn--install'}`}
                    onClick={() => handleAction(item, item.installed ? 'uninstall' : 'install')}
                    disabled={actionLoading === item.id}
                  >
                    {actionLoading === item.id ? '...' : (item.installed ? 'Remove' : 'Install')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main View ── */
export function PluginManagementView() {
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const { requestConsent } = usePermissions();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [installSource, setInstallSource] = useState('');
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updates, setUpdates] = useState<Array<{ name: string; currentVersion: string; latestVersion: string; source: string }>>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [showRegistry, setShowRegistry] = useState(false);

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins`);
      const { plugins } = await res.json();
      setPlugins(plugins || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [apiBase]);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/tools`);
      const data = await res.json();
      setTools(data.success ? data.data || [] : []);
    } catch { /* ignore */ }
  }, [apiBase]);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/check-updates`);
      if (!res.ok) return;
      const data = await res.json();
      setUpdates(data.updates || []);
    } catch { /* ignore */ }
  }, [apiBase]);

  useEffect(() => { fetchPlugins(); fetchTools(); fetchUpdates(); }, [fetchPlugins, fetchTools, fetchUpdates]);

  const install = async () => {
    if (!installSource.trim()) return;
    setInstalling(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: installSource.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        const pending = data.permissions?.pendingConsent;
        if (pending?.length > 0) {
          const approved = await requestConsent(data.plugin.name, data.plugin.displayName || data.plugin.name, pending);
          setMessage({ type: 'success', text: `Installed ${data.plugin.displayName || data.plugin.name}${approved ? '' : ' (some permissions denied)'}.` });
        } else {
          setMessage({ type: 'success', text: `Installed ${data.plugin.displayName || data.plugin.name}.` });
        }
        setInstallSource('');
        fetchPlugins(); fetchTools();
        fetch(`${apiBase}/api/plugins/reload`, { method: 'POST' }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        try { const { pluginRegistry } = await import('../core/PluginRegistry'); await pluginRegistry.reload(); } catch {}
      } else {
        setMessage({ type: 'error', text: data.error || 'Install failed' });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
    finally { setInstalling(false); }
  };

  const updatePlugin = async (name: string) => {
    setUpdating(name);
    try {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(name)}/update`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Updated ${data.plugin?.name || name} to v${data.plugin?.version}` });
        fetchPlugins(); fetchUpdates();
      } else { setMessage({ type: 'error', text: data.error || 'Update failed' }); }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
    finally { setUpdating(null); }
  };

  const remove = async (name: string) => {
    setRemoveConfirm(null);
    try {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Removed ${name}.` });
        fetchPlugins(); fetchTools();
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        try { const { pluginRegistry } = await import('../core/PluginRegistry'); await pluginRegistry.reload(); } catch {}
      } else { setMessage({ type: 'error', text: data.error || 'Remove failed' }); }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <>
      <div className="plugins">
        <div className="plugins__header">
          <div>
            <h2 className="plugins__title">Plugins</h2>
            <div className="plugins__subtitle">Manage installed plugins and MCP tools</div>
          </div>
        </div>

        {/* Install bar */}
        <div className="plugins__install">
          <span className="plugins__install-prefix">$</span>
          <input
            className="plugins__install-input"
            type="text"
            value={installSource}
            onChange={e => setInstallSource(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && install()}
            placeholder="git@github.com:org/plugin.git or /local/path"
            disabled={installing}
          />
          <button className="plugins__install-btn" onClick={install} disabled={installing || !installSource.trim()}>
            {installing ? 'Installing...' : 'Install'}
          </button>
        </div>

        {/* Update banner */}
        {updates.length > 0 && (
          <div className="plugins__update-banner">
            <span className="plugins__update-banner-text">{updates.length} update{updates.length > 1 ? 's' : ''} available</span>
            <button className="plugins__update-all-btn" onClick={() => updates.forEach(u => updatePlugin(u.name))}>Update All</button>
          </div>
        )}

        {message && <div className={`plugins__message plugins__message--${message.type}`}>{message.text}</div>}

        {/* ── Installed Plugins ── */}
        <div className="plugins__section">
          <div className="plugins__section-header">
            <h3 className="plugins__section-title">Installed Plugins</h3>
            {!loading && <span className="plugins__section-count">{plugins.length}</span>}
          </div>
          {loading ? (
            <LoadingState message="Loading plugins..." />
          ) : plugins.length === 0 ? (
            <div className="plugins__empty">No plugins installed yet.</div>
          ) : (
            <div className="plugins__grid">
              {plugins.map(p => {
                const upd = updates.find(u => u.name === p.name);
                return (
                  <div key={p.name} className="plugins__card">
                    <div className="plugins__card-top">
                      <div className="plugins__card-info">
                        <div className="plugins__card-name">
                          {p.displayName || p.name}
                          <span className="plugins__card-version">v{p.version}</span>
                          {upd && <span className="plugins__card-update-hint">&rarr; v{upd.latestVersion}</span>}
                        </div>
                        {p.description && <div className="plugins__card-desc">{p.description}</div>}
                        <div className="plugins__provides">
                          {p.hasBundle && <span className="plugins__cap plugins__cap--bundle">ui</span>}
                          {p.workspace && <span className="plugins__cap plugins__cap--workspace">workspace:{p.workspace.slug}</span>}
                          {p.agents?.map(a => <span key={a.slug} className="plugins__cap plugins__cap--agent">agent:{a.slug}</span>)}
                          {p.providers?.map(pr => <span key={pr.type} className="plugins__cap plugins__cap--provider">provider:{pr.type}</span>)}
                          {p.git && <span className="plugins__cap plugins__cap--ref">{p.git.branch}@{p.git.hash?.slice(0, 7)}</span>}
                        </div>
                      </div>
                      <div className="plugins__card-actions">
                        {upd && (
                          <button className="plugins__btn plugins__btn--update" onClick={() => updatePlugin(p.name)} disabled={updating === p.name}>
                            {updating === p.name ? '...' : 'Update'}
                          </button>
                        )}
                        {p.permissions?.missing && p.permissions.missing.length > 0 && (
                          <button className="plugins__btn plugins__btn--permissions" onClick={async () => {
                            const approved = await requestConsent(p.name, p.displayName || p.name, p.permissions!.missing);
                            if (approved) fetchPlugins();
                          }}>
                            Permissions ({p.permissions.missing.length})
                          </button>
                        )}
                        <button className="plugins__btn plugins__btn--remove" onClick={() => setRemoveConfirm(p.name)}>Remove</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Installed Tools ── */}
        <div className="plugins__section">
          <div className="plugins__section-header">
            <h3 className="plugins__section-title">Tools</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="plugins__section-count">{tools.length} active</span>
              <button className="plugins__section-action" onClick={() => setShowRegistry(true)}>Browse Registry</button>
            </div>
          </div>
          {tools.length === 0 ? (
            <div className="plugins__empty">No tools configured.</div>
          ) : (
            <table className="plugins__tools-table">
              <thead>
                <tr>
                  <th className="plugins__tools-th">Name</th>
                  <th className="plugins__tools-th">Type</th>
                  <th className="plugins__tools-th">Description</th>
                </tr>
              </thead>
              <tbody>
                {tools.map(t => (
                  <tr key={t.id} className="plugins__tools-tr">
                    <td className="plugins__tools-td"><span className="plugins__tools-name">{t.name}</span></td>
                    <td className="plugins__tools-td"><span className="plugins__tools-kind">{t.kind || 'mcp'}</span></td>
                    <td className="plugins__tools-td"><span className="plugins__tools-desc">{t.description || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Tool Registry Modal */}
      {showRegistry && <ToolRegistryModal apiBase={apiBase} onClose={() => { setShowRegistry(false); fetchTools(); }} />}

      {/* Remove confirmation */}
      {removeConfirm && (
        <div className="plugins__confirm-overlay" onClick={() => setRemoveConfirm(null)}>
          <div className="plugins__confirm" onClick={e => e.stopPropagation()}>
            <h3>Remove Plugin</h3>
            <p>Remove &ldquo;{removeConfirm}&rdquo;? This cannot be undone.</p>
            <div className="plugins__confirm-actions">
              <button className="plugins__confirm-cancel" onClick={() => setRemoveConfirm(null)}>Cancel</button>
              <button className="plugins__confirm-delete" onClick={() => remove(removeConfirm)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
