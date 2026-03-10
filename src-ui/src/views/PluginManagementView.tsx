import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '@stallion-ai/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
import { usePermissions } from '../core/PermissionManager';
import './PluginManagementView.css';
import './page-layout.css';

interface Plugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  hasBundle: boolean;
  workspace?: { slug: string };
  agents?: Array<{ slug: string }>;
  providers?: Array<{ type: string }>;
  providerDetails?: Array<{ type: string; module: string; workspace: string | null; enabled: boolean }>;
  git?: { hash: string; branch: string; remote?: string };
  permissions?: { declared: string[]; granted: string[]; missing: Array<{ permission: string; tier: 'passive' | 'active' | 'trusted' }> };
}

/* ── Folder Picker Modal ── */
function FolderPickerModal({ apiBase, onSelect, onClose }: { apiBase: string; onSelect: (path: string) => void; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<Array<{ name: string; isDirectory: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError('');
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await fetch(`${apiBase}/api/fs/browse${q}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to browse'); return; }
      setCurrentPath(data.path);
      setEntries(data.entries);
    } catch { setError('Failed to connect'); }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { browse(); }, [browse]);

  const parentPath = currentPath ? currentPath.replace(/\/[^/]+\/?$/, '') || '/' : '';

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div className="plugins__modal plugins__folder-modal" onClick={e => e.stopPropagation()}>
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Select Folder</h3>
          <button className="plugins__modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="plugins__folder-path">
          <code>{currentPath}</code>
          <button className="plugins__folder-select-btn" onClick={() => { onSelect(currentPath); onClose(); }}>
            Select This Folder
          </button>
        </div>
        <div className="plugins__modal-body">
          {error && <div className="plugins__modal-message plugins__message--error">{error}</div>}
          {loading ? (
            <div className="plugins__empty">Loading...</div>
          ) : (
            <div className="plugins__folder-list">
              {currentPath !== '/' && (
                <div className="plugins__folder-entry" onClick={() => browse(parentPath)}>
                  <span className="plugins__folder-icon">↑</span>
                  <span className="plugins__folder-name">..</span>
                </div>
              )}
              {entries.map(e => (
                <div key={e.name} className="plugins__folder-entry" onClick={() => browse(`${currentPath}/${e.name}`)}>
                  <span className="plugins__folder-icon">📁</span>
                  <span className="plugins__folder-name">{e.name}</span>
                </div>
              ))}
              {entries.length === 0 && <div className="plugins__empty">No subdirectories</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PreviewComponent {
  type: string;
  id: string;
  detail?: string;
  conflict?: { type: string; id: string; existingSource?: string };
}

interface GitInfo {
  hash: string;
  branch: string;
  remote?: string;
}

interface PreviewData {
  valid: boolean;
  error?: string;
  manifest?: Plugin;
  components: PreviewComponent[];
  conflicts: Array<{ type: string; id: string; existingSource?: string }>;
  dependencies?: Array<{ id: string; source?: string; status: string; components?: Array<{ type: string; id: string }>; git?: GitInfo }>;
  git?: GitInfo;
}

/* PathAutocomplete imported from shared component */
import { PathAutocomplete } from '../components/PathAutocomplete';

/* ── Main View ── */
export function PluginManagementView() {
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const { requestConsent } = usePermissions();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installSource, setInstallSource] = useState('');
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updates, setUpdates] = useState<Array<{ name: string; currentVersion: string; latestVersion: string; source: string }>>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSkips, setPreviewSkips] = useState<Set<string>>(new Set());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins`);
      const { plugins } = await res.json();
      setPlugins(plugins || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [apiBase]);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/check-updates`);
      if (!res.ok) return;
      const data = await res.json();
      setUpdates(data.updates || []);
    } catch { /* ignore */ }
  }, [apiBase]);

  const fetchProviderDetails = useCallback(async (name: string) => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(name)}/providers`);
      if (!res.ok) return;
      const data = await res.json();
      setPlugins(prev => prev.map(p => p.name === name ? { ...p, providerDetails: data.providers } : p));
    } catch { /* ignore */ }
  }, [apiBase]);

  const toggleProvider = useCallback(async (pluginName: string, providerType: string, currentlyEnabled: boolean) => {
    const plugin = plugins.find(p => p.name === pluginName);
    if (!plugin?.providerDetails) return;
    const disabled = plugin.providerDetails
      .filter(p => p.type === providerType ? currentlyEnabled : !p.enabled)
      .map(p => p.type);
    try {
      await fetch(`${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      fetchProviderDetails(pluginName);
    } catch { /* ignore */ }
  }, [apiBase, plugins, fetchProviderDetails]);

  useEffect(() => { fetchPlugins(); fetchUpdates(); }, [fetchPlugins, fetchUpdates]);

  const install = async (skipList?: string[]) => {
    const source = installSource.trim();
    if (!source) return;

    // If no preview yet, fetch preview first
    if (!previewData && !skipList) {
      setPreviewLoading(true);
      setMessage(null);
      try {
        const res = await fetch(`${apiBase}/api/plugins/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        });
        const data: PreviewData = await res.json();
        if (!data.valid) {
          setMessage({ type: 'error', text: data.error || 'Invalid plugin' });
        } else {
          // Auto-skip conflicting components
          const autoSkips = new Set(data.conflicts.map(c => `${c.type}:${c.id}`));
          setPreviewSkips(autoSkips);
          setPreviewData(data);
        }
      } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
      finally { setPreviewLoading(false); }
      return;
    }

    // Proceed with actual install
    setInstalling(true);
    setMessage(null);
    setPreviewData(null);
    try {
      const res = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, skip: skipList || Array.from(previewSkips) }),
      });
      const data = await res.json();
      if (data.success) {
        const pluginName = data.plugin.displayName || data.plugin.name;
        const pending = data.permissions?.pendingConsent;
        if (pending?.length > 0) {
          await requestConsent(data.plugin.name, pluginName, pending);
        }
        setInstallSource('');
        setMessage({ type: 'success', text: `Installed ${pluginName}. Setting up tools...` });
        fetchPlugins();
        fetch(`${apiBase}/api/plugins/reload`, { method: 'POST' }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        try { const { pluginRegistry } = await import('../core/PluginRegistry'); await pluginRegistry.reload(); } catch {}

        // Poll agent health until tools are connected (max 30s)
        const agents = data.plugin.agents || [];
        if (agents.length > 0) {
          const slug = agents[0].slug;
          let ready = false;
          for (let i = 0; i < 15 && !ready; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const h = await (await fetch(`${apiBase}/agents/${encodeURIComponent(slug)}/health`)).json();
              ready = h.healthy;
            } catch {}
          }
        }
        queryClient.invalidateQueries({ queryKey: ['agents'] });
        setMessage({ type: 'success', text: `${pluginName} is ready.` });
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
        fetchPlugins();
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        try { const { pluginRegistry } = await import('../core/PluginRegistry'); await pluginRegistry.reload(); } catch {}
      } else { setMessage({ type: 'error', text: data.error || 'Remove failed' }); }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
  };

  return (
    <>
      <div className="plugins page">
        <div className="page__header">
          <div className="page__header-text">
            <div className="page__label">sys / plugins</div>
            <h1 className="page__title">Plugins</h1>
            <p className="page__subtitle">Manage installed plugins</p>
          </div>
        </div>

        {/* Install bar */}
        <div className="plugins__install">
          <span className="plugins__install-prefix">$</span>
          <PathAutocomplete
            value={installSource}
            onChange={val => { setInstallSource(val); setPreviewData(null); }}
            onSubmit={() => install()}
            placeholder="git@github.com:org/plugin.git or /local/path"
            disabled={installing}
            apiBase={apiBase}
          />
          <button className="plugins__browse-btn" onClick={() => setShowFolderPicker(true)} disabled={installing} title="Browse local folders">
            📁
          </button>
          <button className="plugins__install-btn" onClick={() => install()} disabled={installing || previewLoading || !installSource.trim()}>
            {installing ? 'Installing...' : previewLoading ? 'Validating...' : 'Install'}
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
                          {upd && <span className="plugins__card-update-hint">&rarr; {/^\d/.test(upd.latestVersion) ? `v${upd.latestVersion}` : upd.latestVersion}</span>}
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
                    {p.providers && p.providers.length > 0 && (
                      <div className="plugins__providers">
                        <button
                          className="plugins__providers-toggle"
                          onClick={() => {
                            const next = new Set(expandedProviders);
                            if (next.has(p.name)) next.delete(p.name);
                            else { next.add(p.name); fetchProviderDetails(p.name); }
                            setExpandedProviders(next);
                          }}
                        >
                          <span style={{ transform: expandedProviders.has(p.name) ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
                          {' '}Providers ({p.providers.length})
                        </button>
                        {expandedProviders.has(p.name) && p.providerDetails && (
                          <div className="plugins__providers-list">
                            {p.providerDetails.map(pr => (
                              <div key={pr.type} className="plugins__provider-row">
                                <span className="plugins__cap plugins__cap--provider">{pr.type}</span>
                                {pr.workspace && <span className="plugins__provider-scope">{pr.workspace}</span>}
                                <label className="plugins__provider-toggle">
                                  <input
                                    type="checkbox"
                                    checked={pr.enabled}
                                    onChange={() => toggleProvider(p.name, pr.type, pr.enabled)}
                                  />
                                  {pr.enabled ? 'Enabled' : 'Disabled'}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && <FolderPickerModal apiBase={apiBase} onSelect={setInstallSource} onClose={() => setShowFolderPicker(false)} />}

      {/* Install Preview Modal */}
      {previewData && (
        <div className="plugins__modal-overlay" onClick={() => setPreviewData(null)}>
          <div className="plugins__modal" onClick={e => e.stopPropagation()}>
            <div className="plugins__modal-header">
              <h3 className="plugins__modal-title">Install Preview</h3>
              <button className="plugins__modal-close" onClick={() => setPreviewData(null)}>&times;</button>
            </div>
            <div className="plugins__modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <strong>{previewData.manifest?.displayName || previewData.manifest?.name}</strong>
                <span className="plugins__card-version" style={{ marginLeft: 8 }}>v{previewData.manifest?.version}</span>
                {previewData.git && <span className="plugins__cap plugins__cap--ref" style={{ marginLeft: 8 }}>{previewData.git.branch}@{previewData.git.hash}</span>}
                {previewData.manifest?.description && <div className="plugins__card-desc" style={{ marginTop: 4 }}>{previewData.manifest.description}</div>}
              </div>
              {previewData.conflicts.length > 0 && (
                <div className="plugins__modal-message plugins__message--error" style={{ marginBottom: '0.75rem' }}>
                  {previewData.conflicts.length} conflict{previewData.conflicts.length > 1 ? 's' : ''} detected — conflicting components are unchecked by default
                </div>
              )}
              <div className="plugins__registry-list">
                {previewData.components.map(comp => {
                  const key = `${comp.type}:${comp.id}`;
                  const skipped = previewSkips.has(key);
                  return (
                    <div key={key} className="plugins__registry-item" style={{ opacity: skipped ? 0.5 : 1 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!skipped}
                          onChange={() => {
                            const next = new Set(previewSkips);
                            if (skipped) next.delete(key); else next.add(key);
                            setPreviewSkips(next);
                          }}
                        />
                        <span className={`plugins__cap plugins__cap--${comp.type === 'agent' ? 'agent' : comp.type === 'workspace' ? 'workspace' : comp.type === 'provider' ? 'provider' : 'bundle'}`}>
                          {comp.type}
                        </span>
                        <span>{comp.id}</span>
                      </label>
                      {comp.conflict && <span style={{ color: 'var(--accent-primary)', fontSize: 12 }}>⚠ conflict{comp.conflict.existingSource ? ` (${comp.conflict.existingSource})` : ''}</span>}
                    </div>
                  );
                })}
              </div>
              {previewData.dependencies && previewData.dependencies.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Dependencies ({previewData.dependencies.length})</div>
                  <div className="plugins__registry-list">
                    {previewData.dependencies.map(dep => (
                      <div key={dep.id} className="plugins__registry-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="plugins__cap plugins__cap--bundle">dep</span>
                          <span>{dep.id}</span>
                          {dep.git && <span className="plugins__cap plugins__cap--ref" style={{ fontSize: 11 }}>{dep.git.branch}@{dep.git.hash}</span>}
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {dep.status === 'installed' ? '✓ installed' : dep.status === 'will-install' ? '↓ will install' : '⚠ missing'}
                          </span>
                        </div>
                        {dep.components && dep.components.length > 0 && (
                          <div style={{ paddingLeft: 24, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {dep.components.map(c => (
                              <span key={`${c.type}:${c.id}`} className={`plugins__cap plugins__cap--${c.type === 'agent' ? 'agent' : c.type === 'workspace' ? 'workspace' : 'provider'}`} style={{ fontSize: 11 }}>
                                {c.type}:{c.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
                <button className="plugins__confirm-cancel" onClick={() => setPreviewData(null)}>Cancel</button>
                <button className="plugins__install-btn" onClick={() => install(Array.from(previewSkips))} disabled={installing}>
                  {installing ? 'Installing...' : 'Confirm Install'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
