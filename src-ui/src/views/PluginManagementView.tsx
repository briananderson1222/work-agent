import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from '../components/Checkbox';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { Toggle } from '../components/Toggle';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';
import { usePermissions } from '../core/PermissionManager';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './PluginManagementView.css';
import './page-layout.css';

interface Plugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  hasBundle: boolean;
  layout?: { slug: string };
  agents?: Array<{ slug: string }>;
  providers?: Array<{ type: string }>;
  providerDetails?: Array<{
    type: string;
    module: string;
    layout: string | null;
    enabled: boolean;
  }>;
  git?: { hash: string; branch: string; remote?: string };
  permissions?: {
    declared: string[];
    granted: string[];
    missing: Array<{
      permission: string;
      tier: 'passive' | 'active' | 'trusted';
    }>;
  };
}

/* ── Folder Picker Modal ── */
function FolderPickerModal({
  apiBase,
  onSelect,
  onClose,
}: {
  apiBase: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<
    Array<{ name: string; isDirectory: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const browse = useCallback(
    async (path?: string) => {
      setLoading(true);
      setError('');
      try {
        const q = path ? `?path=${encodeURIComponent(path)}` : '';
        const res = await fetch(`${apiBase}/api/fs/browse${q}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to browse');
          return;
        }
        setCurrentPath(data.path);
        setEntries(data.entries);
      } catch {
        setError('Failed to connect');
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    browse();
  }, [browse]);

  const parentPath = currentPath
    ? currentPath.replace(/\/[^/]+\/?$/, '') || '/'
    : '';

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div
        className="plugins__modal plugins__folder-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Select Folder</h3>
          <button className="plugins__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="plugins__folder-path">
          <code>{currentPath}</code>
          <button
            className="plugins__folder-select-btn"
            onClick={() => {
              onSelect(currentPath);
              onClose();
            }}
          >
            Select This Folder
          </button>
        </div>
        <div className="plugins__modal-body">
          {error && (
            <div className="plugins__modal-message plugins__message--error">
              {error}
            </div>
          )}
          {loading ? (
            <div className="plugins__empty">Loading...</div>
          ) : (
            <div className="plugins__folder-list">
              {currentPath !== '/' && (
                <div
                  className="plugins__folder-entry"
                  onClick={() => browse(parentPath)}
                >
                  <span className="plugins__folder-icon">↑</span>
                  <span className="plugins__folder-name">..</span>
                </div>
              )}
              {entries.map((e) => (
                <div
                  key={e.name}
                  className="plugins__folder-entry"
                  onClick={() => browse(`${currentPath}/${e.name}`)}
                >
                  <span className="plugins__folder-icon">📁</span>
                  <span className="plugins__folder-name">{e.name}</span>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="plugins__empty">No subdirectories</div>
              )}
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
  dependencies?: Array<{
    id: string;
    source?: string;
    status: string;
    components?: Array<{ type: string; id: string }>;
    git?: GitInfo;
  }>;
  git?: GitInfo;
}

/* PathAutocomplete imported from shared component */
import { PathAutocomplete } from '../components/PathAutocomplete';

/* ── Main View ── */
export function PluginManagementView() {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const queryClient = useQueryClient();
  const { requestConsent } = usePermissions();
  const { data: plugins = [], isLoading } = useQuery<Plugin[]>({
    queryKey: ['plugins'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/plugins`);
      const json = await res.json();
      return json.plugins || [];
    },
  });
  const { data: updates = [] } = useQuery<
    Array<{
      name: string;
      currentVersion: string;
      latestVersion: string;
      source: string;
    }>
  >({
    queryKey: ['plugin-updates'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/plugins/check-updates`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.updates || [];
    },
  });
  const [installSource, setInstallSource] = useState('');
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSkips, setPreviewSkips] = useState<Set<string>>(new Set());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(),
  );
  const {
    selectedId: selectedPlugin,
    select: selectPlugin,
    deselect: deselectPlugin,
  } = useUrlSelection('/plugins');
  const [search, setSearch] = useState('');
  const { projects } = useProjects();
  const [layoutAssignment, setLayoutAssignment] = useState<{
    pluginName: string;
    displayName: string;
    layoutSlug: string;
  } | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [quickProjectName, setQuickProjectName] = useState('');
  const [assigningLayout, setAssigningLayout] = useState(false);

  const fetchProviderDetails = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(
          `${apiBase}/api/plugins/${encodeURIComponent(name)}/providers`,
        );
        if (!res.ok) return;
        const data = await res.json();
        queryClient.setQueryData<Plugin[]>(
          ['plugins'],
          (prev) =>
            prev?.map((p) =>
              p.name === name ? { ...p, providerDetails: data.providers } : p,
            ) ?? [],
        );
      } catch {
        /* ignore */
      }
    },
    [apiBase, queryClient.setQueryData],
  );

  const toggleProvider = useCallback(
    async (
      pluginName: string,
      providerType: string,
      currentlyEnabled: boolean,
    ) => {
      const plugin = plugins.find((p) => p.name === pluginName);
      if (!plugin?.providerDetails) return;
      const disabled = plugin.providerDetails
        .filter((p) =>
          p.type === providerType ? currentlyEnabled : !p.enabled,
        )
        .map((p) => p.type);
      try {
        await fetch(
          `${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/overrides`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabled }),
          },
        );
        fetchProviderDetails(pluginName);
      } catch {
        /* ignore */
      }
    },
    [apiBase, plugins, fetchProviderDetails],
  );

  const install = async (skipList?: string[]) => {
    const source = installSource.trim();
    if (!source) return;

    // If no preview yet, fetch preview first
    if (!previewData && !skipList) {
      setPreviewLoading(true);
      setMessage(null);
      try {
        const res = await fetch(`${apiBase}/api/plugins/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        });
        const data: PreviewData = await res.json();
        if (!data.valid) {
          setMessage({ type: 'error', text: data.error || 'Invalid plugin' });
        } else {
          // Auto-skip conflicting components
          const autoSkips = new Set(
            data.conflicts.map((c) => `${c.type}:${c.id}`),
          );
          setPreviewSkips(autoSkips);
          setPreviewData(data);
        }
      } catch (e: any) {
        setMessage({ type: 'error', text: e.message });
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    // Proceed with actual install
    setInstalling(true);
    setMessage(null);
    setPreviewData(null);
    try {
      const res = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          skip: skipList || Array.from(previewSkips),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const pluginName = data.plugin.displayName || data.plugin.name;
        const pending = data.permissions?.pendingConsent;
        if (pending?.length > 0) {
          await requestConsent(data.plugin.name, pluginName, pending);
        }
        setInstallSource('');
        setMessage({
          type: 'success',
          text: `Installed ${pluginName}. Setting up tools...`,
        });
        queryClient.invalidateQueries({ queryKey: ['plugins'] });
        fetch(`${apiBase}/api/plugins/reload`, { method: 'POST' }).catch(
          () => {},
        );
        queryClient.invalidateQueries({ queryKey: ['layouts'] });
        try {
          const { pluginRegistry } = await import('../core/PluginRegistry');
          await pluginRegistry.reload();
        } catch {}

        // Poll agent health until tools are connected (max 30s)
        const agents = data.plugin.agents || [];
        if (agents.length > 0) {
          const slug = agents[0].slug;
          let ready = false;
          for (let i = 0; i < 15 && !ready; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const h = await (
                await fetch(
                  `${apiBase}/agents/${encodeURIComponent(slug)}/health`,
                )
              ).json();
              ready = h.healthy;
            } catch {}
          }
        }
        queryClient.invalidateQueries({ queryKey: ['agents'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        setMessage({ type: 'success', text: `${pluginName} is ready.` });

        // If the plugin installed a layout, prompt user to assign it to a project
        if (data.layout?.slug) {
          setQuickProjectName(pluginName);
          setSelectedProjects(new Set());
          setLayoutAssignment({
            pluginName: data.plugin.name,
            displayName: pluginName,
            layoutSlug: data.layout.slug,
          });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Install failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setInstalling(false);
    }
  };

  const updatePlugin = async (name: string) => {
    setUpdating(name);
    try {
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}/update`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: `Updated ${data.plugin?.name || name} to v${data.plugin?.version}`,
        });
        queryClient.invalidateQueries({ queryKey: ['plugins'] });
        queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
      } else {
        setMessage({ type: 'error', text: data.error || 'Update failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUpdating(null);
    }
  };

  const remove = async (name: string) => {
    setRemoveConfirm(null);
    try {
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Removed ${name}.` });
        queryClient.invalidateQueries({ queryKey: ['plugins'] });
        queryClient.invalidateQueries({ queryKey: ['layouts'] });
        try {
          const { pluginRegistry } = await import('../core/PluginRegistry');
          await pluginRegistry.reload();
        } catch {}
      } else {
        setMessage({ type: 'error', text: data.error || 'Remove failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const filtered = useMemo(
    () =>
      plugins.filter((p) => {
        const q = search.toLowerCase();
        return (
          !q ||
          (p.displayName || p.name).toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      }),
    [plugins, search],
  );

  const items = filtered.map((p) => ({
    id: p.name,
    name: p.displayName || p.name,
    subtitle: `v${p.version}${p.description ? ` · ${p.description}` : ''}`,
  }));

  const selected = plugins.find((p) => p.name === selectedPlugin);

  return (
    <>
      <SplitPaneLayout
        label="plugins"
        title="Plugins"
        subtitle="Manage installed plugins"
        items={items}
        loading={isLoading}
        selectedId={selectedPlugin}
        onSelect={selectPlugin}
        onDeselect={deselectPlugin}
        onSearch={setSearch}
        searchPlaceholder="Search plugins..."
        onAdd={() => setShowInstallModal(true)}
        addLabel="+ Install Plugin"
        emptyIcon="⬡"
        emptyTitle="No plugin selected"
        emptyDescription="Select a plugin from the list or install a new one"
        emptyContent={
          <div className="detail-panel">
            {updates.length > 0 && (
              <div className="plugins__update-banner">
                <span className="plugins__update-banner-text">
                  {updates.length} update{updates.length > 1 ? 's' : ''}{' '}
                  available
                </span>
                <button
                  className="plugins__update-all-btn"
                  onClick={() => updates.forEach((u) => updatePlugin(u.name))}
                >
                  Update All
                </button>
              </div>
            )}
            {message && (
              <div
                className={`plugins__message plugins__message--${message.type}`}
              >
                {message.text}
              </div>
            )}
            {plugins.length === 0 && !isLoading && (
              <div className="plugins__empty">No plugins installed yet.</div>
            )}
          </div>
        }
      >
        {selected && (
          <div className="detail-panel">
            {message && (
              <div
                className={`plugins__message plugins__message--${message.type}`}
              >
                {message.text}
              </div>
            )}

            {/* Plugin detail */}
            <DetailHeader
              title={selected.displayName || selected.name}
              subtitle={selected.description}
              badge={{ label: `v${selected.version}`, variant: 'muted' as const }}
            >
              {updates.find((u) => u.name === selected.name) && (
                <button
                  className="editor-btn editor-btn--primary"
                  onClick={() => updatePlugin(selected.name)}
                  disabled={updating === selected.name}
                >
                  {updating === selected.name
                    ? 'Updating…'
                    : `Update to v${updates.find((u) => u.name === selected.name)!.latestVersion}`}
                </button>
              )}
              <button
                className="editor-btn editor-btn--danger"
                onClick={() => setRemoveConfirm(selected.name)}
              >
                Remove
              </button>
            </DetailHeader>

            <div className="detail-panel__body">
            {/* Capabilities */}
            <div className="detail-panel__caps">
              {selected.hasBundle && (
                <span className="plugins__cap plugins__cap--bundle">ui</span>
              )}
              {selected.workspace && (
                <span className="plugins__cap plugins__cap--workspace">
                  workspace:{selected.workspace.slug}
                </span>
              )}
              {selected.agents?.map((a) => (
                <span key={a.slug} className="plugins__cap plugins__cap--agent">
                  agent:{a.slug}
                </span>
              ))}
              {selected.providers?.map((pr) => (
                <span
                  key={pr.type}
                  className="plugins__cap plugins__cap--provider"
                >
                  provider:{pr.type}
                </span>
              ))}
              {selected.git && (
                <span className="plugins__cap plugins__cap--ref">
                  {selected.git.branch}@{selected.git.hash?.slice(0, 7)}
                </span>
              )}
            </div>

            {/* Providers */}
            {selected.providers && selected.providers.length > 0 && (
              <div className="detail-panel__section">
                <button
                  className="plugins__providers-toggle"
                  onClick={() => {
                    const next = new Set(expandedProviders);
                    if (next.has(selected.name)) next.delete(selected.name);
                    else {
                      next.add(selected.name);
                      fetchProviderDetails(selected.name);
                    }
                    setExpandedProviders(next);
                  }}
                >
                  <span
                    style={{
                      transform: expandedProviders.has(selected.name)
                        ? 'rotate(90deg)'
                        : 'none',
                      display: 'inline-block',
                      transition: 'transform 0.15s',
                    }}
                  >
                    ▶
                  </span>{' '}
                  Providers ({selected.providers.length})
                </button>
                {expandedProviders.has(selected.name) &&
                  selected.providerDetails && (
                    <div className="plugins__providers-list">
                      {selected.providerDetails.map((pr) => (
                        <div key={pr.type} className="plugins__provider-row">
                          <span className="plugins__cap plugins__cap--provider">
                            {pr.type}
                          </span>
                          {pr.workspace && (
                            <span className="plugins__provider-scope">
                              {pr.workspace}
                            </span>
                          )}
                          <label className="plugins__provider-toggle">
                            <Toggle
                              checked={pr.enabled}
                              onChange={() =>
                                toggleProvider(
                                  selected.name,
                                  pr.type,
                                  pr.enabled,
                                )
                              }
                              size="sm"
                            />
                            {pr.enabled ? 'Enabled' : 'Disabled'}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {/* Permissions */}
            {selected.permissions?.missing &&
              selected.permissions.missing.length > 0 && (
                <button
                  className="plugins__btn plugins__btn--permissions"
                  onClick={async () => {
                    const approved = await requestConsent(
                      selected.name,
                      selected.displayName || selected.name,
                      selected.permissions!.missing,
                    );
                    if (approved)
                      queryClient.invalidateQueries({ queryKey: ['plugins'] });
                  }}
                >
                  Review Permissions ({selected.permissions.missing.length})
                </button>
              )}

            </div>
          </div>
        )}
      </SplitPaneLayout>

      {/* Install Plugin Modal */}
      {showInstallModal && (
        <div className="plugins__modal-overlay" onClick={() => setShowInstallModal(false)}>
          <div className="plugins__modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="plugins__modal-header">
              <h3 className="plugins__modal-title">Install Plugin</h3>
              <button className="plugins__modal-close" onClick={() => setShowInstallModal(false)}>&times;</button>
            </div>
            <div className="plugins__modal-body">
              <div className="plugins__install" style={{ marginBottom: 16 }}>
                <span className="plugins__install-prefix">$</span>
                <PathAutocomplete
                  value={installSource}
                  onChange={(val) => { setInstallSource(val); setPreviewData(null); }}
                  onSubmit={() => { install(); setShowInstallModal(false); }}
                  placeholder="git@github.com:org/plugin.git or /local/path"
                  disabled={installing}
                  apiBase={apiBase}
                />
                <button className="plugins__browse-btn" onClick={() => setShowFolderPicker(true)} disabled={installing} title="Browse local folders">📁</button>
                <button
                  className="plugins__install-btn"
                  onClick={() => { install(); setShowInstallModal(false); }}
                  disabled={installing || previewLoading || !installSource.trim()}
                >
                  {installing ? 'Installing...' : previewLoading ? 'Validating...' : 'Install'}
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Paste a git URL or local path to a Stallion plugin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <FolderPickerModal
          apiBase={apiBase}
          onSelect={setInstallSource}
          onClose={() => setShowFolderPicker(false)}
        />
      )}

      {/* Install Preview Modal */}
      {previewData && (
        <div
          className="plugins__modal-overlay"
          onClick={() => setPreviewData(null)}
        >
          <div className="plugins__modal" onClick={(e) => e.stopPropagation()}>
            <div className="plugins__modal-header">
              <h3 className="plugins__modal-title">Install Preview</h3>
              <button
                className="plugins__modal-close"
                onClick={() => setPreviewData(null)}
              >
                &times;
              </button>
            </div>
            <div className="plugins__modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <strong>
                  {previewData.manifest?.displayName ||
                    previewData.manifest?.name}
                </strong>
                <span
                  className="plugins__card-version"
                  style={{ marginLeft: 8 }}
                >
                  v{previewData.manifest?.version}
                </span>
                {previewData.git && (
                  <span
                    className="plugins__cap plugins__cap--ref"
                    style={{ marginLeft: 8 }}
                  >
                    {previewData.git.branch}@{previewData.git.hash}
                  </span>
                )}
                {previewData.manifest?.description && (
                  <div className="plugins__card-desc" style={{ marginTop: 4 }}>
                    {previewData.manifest.description}
                  </div>
                )}
              </div>
              {previewData.conflicts.length > 0 && (
                <div
                  className="plugins__modal-message plugins__message--error"
                  style={{ marginBottom: '0.75rem' }}
                >
                  {previewData.conflicts.length} conflict
                  {previewData.conflicts.length > 1 ? 's' : ''} detected —
                  conflicting components are unchecked by default
                </div>
              )}
              <div className="plugins__registry-list">
                {previewData.components.map((comp) => {
                  const key = `${comp.type}:${comp.id}`;
                  const skipped = previewSkips.has(key);
                  return (
                    <div
                      key={key}
                      className="plugins__registry-item"
                      style={{ opacity: skipped ? 0.5 : 1 }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          cursor: 'pointer',
                        }}
                      >
                        <Checkbox
                          checked={!skipped}
                          onChange={() => {
                            const next = new Set(previewSkips);
                            if (skipped) next.delete(key);
                            else next.add(key);
                            setPreviewSkips(next);
                          }}
                        />
                        <span
                          className={`plugins__cap plugins__cap--${comp.type === 'agent' ? 'agent' : comp.type === 'workspace' ? 'workspace' : comp.type === 'provider' ? 'provider' : 'bundle'}`}
                        >
                          {comp.type}
                        </span>
                        <span>{comp.id}</span>
                      </label>
                      {comp.conflict && (
                        <span
                          style={{
                            color: 'var(--accent-primary)',
                            fontSize: 12,
                          }}
                        >
                          ⚠ conflict
                          {comp.conflict.existingSource
                            ? ` (${comp.conflict.existingSource})`
                            : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {previewData.dependencies &&
                previewData.dependencies.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      Dependencies ({previewData.dependencies.length})
                    </div>
                    <div className="plugins__registry-list">
                      {previewData.dependencies.map((dep) => (
                        <div
                          key={dep.id}
                          className="plugins__registry-item"
                          style={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span className="plugins__cap plugins__cap--bundle">
                              dep
                            </span>
                            <span>{dep.id}</span>
                            {dep.git && (
                              <span
                                className="plugins__cap plugins__cap--ref"
                                style={{ fontSize: 11 }}
                              >
                                {dep.git.branch}@{dep.git.hash}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                                marginLeft: 'auto',
                              }}
                            >
                              {dep.status === 'installed'
                                ? '✓ installed'
                                : dep.status === 'will-install'
                                  ? '↓ will install'
                                  : '⚠ missing'}
                            </span>
                          </div>
                          {dep.components && dep.components.length > 0 && (
                            <div
                              style={{
                                paddingLeft: 24,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 4,
                              }}
                            >
                              {dep.components.map((c) => (
                                <span
                                  key={`${c.type}:${c.id}`}
                                  className={`plugins__cap plugins__cap--${c.type === 'agent' ? 'agent' : c.type === 'workspace' ? 'workspace' : 'provider'}`}
                                  style={{ fontSize: 11 }}
                                >
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: '1rem',
                }}
              >
                <button
                  className="plugins__confirm-cancel"
                  onClick={() => setPreviewData(null)}
                >
                  Cancel
                </button>
                <button
                  className="plugins__install-btn"
                  onClick={() => install(Array.from(previewSkips))}
                  disabled={installing}
                >
                  {installing ? 'Installing...' : 'Confirm Install'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installing overlay */}
      {installing && (
        <div className="plugins__modal-overlay">
          <div className="plugins__installing-card">
            <div className="plugins__installing-spinner" />
            <p className="plugins__installing-text">
              {message?.text || 'Installing plugin…'}
            </p>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeConfirm && (
        <div
          className="plugins__confirm-overlay"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="plugins__confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Remove Plugin</h3>
            <p>Remove &ldquo;{removeConfirm}&rdquo;? This cannot be undone.</p>
            <div className="plugins__confirm-actions">
              <button
                className="plugins__confirm-cancel"
                onClick={() => setRemoveConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="plugins__confirm-delete"
                onClick={() => remove(removeConfirm)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layout assignment modal — shown after installing a plugin with a layout */}
      {layoutAssignment && (
        <div
          className="plugins__confirm-overlay"
          onClick={() => setLayoutAssignment(null)}
        >
          <div
            className="plugins__confirm plugins__confirm--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="plugins__assign-heading">Add Layout to Project</h3>
            <p className="plugins__assign-desc">
              <strong>{layoutAssignment.displayName}</strong> includes a layout.
              Add it to a project to start using it.
            </p>

            {/* Quick create */}
            <button
              className="plugins__btn plugins__btn--install plugins__assign-quick-btn"
              disabled={assigningLayout}
              onClick={async () => {
                setAssigningLayout(true);
                try {
                  const slug =
                    quickProjectName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '') || 'default';
                  const projRes = await (
                    await fetch(`${apiBase}/api/projects`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: quickProjectName,
                        slug,
                      }),
                    })
                  ).json();
                  if (projRes.success) {
                    await fetch(
                      `${apiBase}/api/projects/${slug}/layouts/from-plugin`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          plugin: layoutAssignment.pluginName,
                        }),
                      },
                    );
                    queryClient.invalidateQueries({ queryKey: ['projects'] });
                    setLayoutAssignment(null);
                    navigate(`/projects/${slug}`);
                  }
                } catch {
                } finally {
                  setAssigningLayout(false);
                }
              }}
            >
              ✨ Create &ldquo;{quickProjectName}&rdquo; Project
            </button>

            {/* Existing projects */}
            {projects.length > 0 && (
              <>
                <div className="plugins__assign-section-label">
                  Or add to existing
                </div>
                <div className="plugins__assign-project-list">
                  {projects.map((p) => (
                    <label
                      key={p.slug}
                      className={`plugins__assign-project${selectedProjects.has(p.slug) ? ' plugins__assign-project--selected' : ''}`}
                    >
                      <Checkbox
                        checked={selectedProjects.has(p.slug)}
                        onChange={(checked) => {
                          const next = new Set(selectedProjects);
                          checked ? next.add(p.slug) : next.delete(p.slug);
                          setSelectedProjects(next);
                        }}
                      />
                      <span>
                        {p.icon && `${p.icon} `}
                        {p.name}
                      </span>
                      <span className="plugins__assign-project-count">
                        {p.layoutCount} layout{p.layoutCount !== 1 ? 's' : ''}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedProjects.size > 0 && (
                  <button
                    className="plugins__btn plugins__btn--install plugins__assign-add-btn"
                    disabled={assigningLayout}
                    onClick={async () => {
                      setAssigningLayout(true);
                      try {
                        for (const slug of selectedProjects) {
                          await fetch(
                            `${apiBase}/api/projects/${slug}/layouts/from-plugin`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                plugin: layoutAssignment.pluginName,
                              }),
                            },
                          );
                        }
                        queryClient.invalidateQueries({
                          queryKey: ['projects'],
                        });
                        setLayoutAssignment(null);
                        navigate(`/projects/${[...selectedProjects][0]}`);
                      } catch {
                      } finally {
                        setAssigningLayout(false);
                      }
                    }}
                  >
                    Add to {selectedProjects.size} project
                    {selectedProjects.size !== 1 ? 's' : ''}
                  </button>
                )}
              </>
            )}

            <button
              className="plugins__assign-skip"
              onClick={() => setLayoutAssignment(null)}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
