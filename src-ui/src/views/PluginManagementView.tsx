import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import './editor-layout.css';

interface Plugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  hasBundle: boolean;
  hasSettings?: boolean;
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

  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['fs-browse', currentPath],
    queryFn: async () => {
      const q = currentPath ? `?path=${encodeURIComponent(currentPath)}` : '';
      const res = await fetch(`${apiBase}/api/fs/browse${q}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to browse');
      return d;
    },
  });

  const entries: Array<{ name: string; isDirectory: boolean }> =
    data?.entries || [];
  const resolvedPath = data?.path || currentPath;

  const parentPath = resolvedPath
    ? resolvedPath.replace(/\/[^/]+\/?$/, '') || '/'
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
          <code>{resolvedPath}</code>
          <button
            className="plugins__folder-select-btn"
            onClick={() => {
              onSelect(resolvedPath);
              onClose();
            }}
          >
            Select This Folder
          </button>
        </div>
        <div className="plugins__modal-body">
          {error && (
            <div className="plugins__modal-message plugins__message--error">
              {(error as Error).message}
            </div>
          )}
          {loading ? (
            <div className="plugins__empty">Loading...</div>
          ) : (
            <div className="plugins__folder-list">
              {resolvedPath !== '/' && (
                <div
                  className="plugins__folder-entry"
                  onClick={() => setCurrentPath(parentPath)}
                >
                  <span className="plugins__folder-icon">↑</span>
                  <span className="plugins__folder-name">..</span>
                </div>
              )}
              {entries.map((e) => (
                <div
                  key={e.name}
                  className="plugins__folder-entry"
                  onClick={() => setCurrentPath(`${resolvedPath}/${e.name}`)}
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

/* ── Plugin Registry Modal ── */
function PluginRegistryModal({ onClose }: { onClose: () => void }) {
  const { apiBase } = useApiBase();
  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['registry-plugins'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/registry/plugins`);
      const data = await res.json();
      return data.success ? data.data || [] : [];
    },
  });
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [filter, setFilter] = useState('');

  const queryClient = useQueryClient();
  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'install' | 'uninstall';
    }) => {
      const res =
        action === 'install'
          ? await fetch(`${apiBase}/api/registry/plugins/install`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            })
          : await fetch(
              `${apiBase}/api/registry/plugins/${encodeURIComponent(id)}`,
              { method: 'DELETE' },
            );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || `${action} failed`);
      return { data, action };
    },
    onSuccess: (_result, _variables) => {
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
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
          <h3 className="plugins__modal-title">Plugin Registry</h3>
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
            <div className="plugins__empty">Loading registry...</div>
          ) : items.length === 0 ? (
            <div className="plugins__empty">
              No plugin registry configured.
              <br />
              Add a <code>pluginRegistry</code> provider to enable browsing.
            </div>
          ) : (
            <>
              <input
                className="plugins__filter-input"
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter plugins..."
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
                        onClick={() => {
                          setMessage(null);
                          const action = item.installed
                            ? 'uninstall'
                            : 'install';
                          actionMutation.mutate(
                            { id: item.id, action },
                            {
                              onSuccess: (result) => {
                                setMessage({
                                  type: 'success',
                                  text: `${result.action === 'install' ? 'Installed' : 'Removed'} ${item.displayName || item.id}`,
                                });
                              },
                              onError: (e) => {
                                setMessage({ type: 'error', text: e.message });
                              },
                            },
                          );
                        }}
                        disabled={
                          actionMutation.isPending &&
                          actionMutation.variables?.id === item.id
                        }
                      >
                        {actionMutation.isPending &&
                        actionMutation.variables?.id === item.id
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

/* ── Plugin Setting Field ── */
function PluginSettingFieldRow({
  field,
  value,
  onChange,
}: {
  field: { key: string; label: string; type: string; description?: string; options?: Array<{ label: string; value: string }>; secret?: boolean; required?: boolean };
  value: any;
  onChange: (val: any) => void;
}) {
  return (
    <div className="plugins__setting-field">
      <label className="plugins__setting-label">
        {field.label}
        {field.required && <span className="plugins__setting-required"> *</span>}
      </label>
      {field.description && <div className="plugins__setting-desc">{field.description}</div>}
      {field.type === 'boolean' ? (
        <Toggle checked={!!value} onChange={onChange} size="sm" />
      ) : field.type === 'select' ? (
        <select className="plugins__setting-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className="plugins__setting-input"
          type={field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
    </div>
  );
}

/* ── Main View ── */
export function PluginManagementView() {
  const { apiBase } = useApiBase();
  const { setLayout } = useNavigation();
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
  useQuery<Array<{ id: string }>>({
    queryKey: ['registry-plugins'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/registry/plugins`);
      const d = await res.json();
      return d.success ? d.data || [] : [];
    },
  });

  const [installSource, setInstallSource] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewSkips, setPreviewSkips] = useState<Set<string>>(new Set());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(),
  );
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
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
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(
    new Set(),
  );
  const [installMessage, setInstallMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  /* ── Settings & Changelog Queries ── */

  const selected = plugins.find((p) => p.name === selectedPlugin);

  const { data: settingsData } = useQuery({
    queryKey: ['plugin-settings', selectedPlugin],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(selectedPlugin!)}/settings`);
      return res.json();
    },
    enabled: !!selectedPlugin && !!selected?.hasSettings,
  });

  const { data: changelogData } = useQuery({
    queryKey: ['plugin-changelog', selectedPlugin],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(selectedPlugin!)}/changelog`);
      return res.json();
    },
    enabled: !!selectedPlugin && !!selected?.git,
  });

  /* ── Mutations ── */

  const saveSettingsMutation = useMutation({
    mutationFn: async ({ name, settings }: { name: string; settings: Record<string, any> }) => {
      const res = await fetch(`${apiBase}/api/plugins/${encodeURIComponent(name)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plugin-settings', selectedPlugin] }),
  });

  const previewMutation = useMutation({
    mutationFn: async (source: string) => {
      const res = await fetch(`${apiBase}/api/plugins/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      return res.json() as Promise<PreviewData>;
    },
  });

  const installMutation = useMutation({
    mutationFn: async ({
      source,
      skip,
    }: {
      source: string;
      skip: string[];
    }) => {
      const res = await fetch(`${apiBase}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, skip }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Install failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}/update`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Remove failed');
      return data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
      try {
        const { pluginRegistry } = await import('../core/PluginRegistry');
        await pluginRegistry.reload();
      } catch (e) {
        console.warn('Plugin registry reload failed', e);
      }
    },
  });

  const toggleProviderMutation = useMutation({
    mutationFn: async ({
      pluginName,
      disabled,
    }: {
      pluginName: string;
      disabled: string[];
    }) => {
      const res = await fetch(
        `${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled }),
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const fetchProviderDetails = async (name: string) => {
    setLoadingProviders((prev) => new Set(prev).add(name));
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
    } catch (e) {
      console.warn('Failed to fetch provider details', e);
    } finally {
      setLoadingProviders((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const toggleProvider = (
    pluginName: string,
    providerType: string,
    currentlyEnabled: boolean,
  ) => {
    const plugin = plugins.find((p) => p.name === pluginName);
    if (!plugin?.providerDetails) return;
    const disabled = plugin.providerDetails
      .filter((p) => (p.type === providerType ? currentlyEnabled : !p.enabled))
      .map((p) => p.type);
    toggleProviderMutation.mutate(
      { pluginName, disabled },
      {
        onSuccess: () => fetchProviderDetails(pluginName),
      },
    );
  };

  const install = async (skipList?: string[]) => {
    const source = installSource.trim();
    if (!source) return;

    // If no preview yet, fetch preview first
    if (!previewData && !skipList) {
      setInstallMessage(null);
      previewMutation.mutate(source, {
        onSuccess: (data) => {
          if (!data.valid) {
            setInstallMessage({ type: 'error', text: data.error || 'Invalid plugin' });
          } else {
            const autoSkips = new Set(
              data.conflicts.map((c) => `${c.type}:${c.id}`),
            );
            setPreviewSkips(autoSkips);
            setPreviewData(data);
          }
        },
        onError: (e) => setInstallMessage({ type: 'error', text: e.message }),
      });
      return;
    }

    // Proceed with actual install
    setMessage(null);
    setPreviewData(null);
    installMutation.mutate(
      { source, skip: skipList || Array.from(previewSkips) },
      {
        onSuccess: async (data) => {
          setShowInstallModal(false);
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
          fetch(`${apiBase}/api/plugins/reload`, { method: 'POST' }).catch(
            (e) => console.warn('Plugin reload failed', e),
          );
          queryClient.invalidateQueries({ queryKey: ['layouts'] });
          try {
            const { pluginRegistry } = await import('../core/PluginRegistry');
            await pluginRegistry.reload();
          } catch (e) {
            console.warn('Plugin registry reload failed', e);
          }

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
              } catch (e) {
                console.warn('Agent health poll failed', e);
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: ['agents'] });
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          setMessage({ type: 'success', text: `${pluginName} is ready.` });

          if (data.layout?.slug) {
            setQuickProjectName(pluginName);
            setSelectedProjects(new Set());
            setLayoutAssignment({
              pluginName: data.plugin.name,
              displayName: pluginName,
              layoutSlug: data.layout.slug,
            });
          }
        },
        onError: (e) => setInstallMessage({ type: 'error', text: e.message }),
      },
    );
  };

  const updatePlugin = (name: string) => {
    setMessage(null);
    updateMutation.mutate(name, {
      onSuccess: (data) => {
        setMessage({
          type: 'success',
          text: `Updated ${data.plugin?.name || name} to v${data.plugin?.version}`,
        });
      },
      onError: (e) => setMessage({ type: 'error', text: e.message }),
    });
  };

  const remove = (name: string) => {
    setRemoveConfirm(null);
    removeMutation.mutate(name, {
      onSuccess: () =>
        setMessage({ type: 'success', text: `Removed ${name}.` }),
      onError: (e) => setMessage({ type: 'error', text: e.message }),
    });
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
        onAdd={() => {
          setInstallMessage(null);
          setShowInstallModal(true);
        }}
        addLabel="+ Install Plugin"
        sidebarActions={
          <button
            className="split-pane__add-btn plugins__registry-btn"
            onClick={() => setShowRegistryModal(true)}
          >
            Browse Registry
          </button>
        }
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
              badge={{
                label: `v${selected.version}`,
                variant: 'muted' as const,
              }}
            >
              {(() => {
                const upd = updates.find((u) => u.name === selected.name);
                if (upd) {
                  const label =
                    updateMutation.isPending &&
                    updateMutation.variables === selected.name
                      ? 'Updating…'
                      : upd.source === 'git'
                        ? `Update (${upd.latestVersion})`
                        : `Update to v${upd.latestVersion}`;
                  return (
                    <button
                      className="editor-btn editor-btn--primary"
                      onClick={() => updatePlugin(selected.name)}
                      disabled={
                        updateMutation.isPending &&
                        updateMutation.variables === selected.name
                      }
                    >
                      {label}
                    </button>
                  );
                }
                return (
                  <button
                    className="editor-btn"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: ['plugin-updates'],
                      })
                    }
                  >
                    Check for Updates
                  </button>
                );
              })()}
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
                {selected.layout && (
                  <span className="plugins__cap plugins__cap--workspace">
                    layout:{selected.layout.slug}
                  </span>
                )}
                {selected.agents?.map((a) => (
                  <span
                    key={a.slug}
                    className="plugins__cap plugins__cap--agent"
                  >
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
                      className={`plugins__providers-arrow${expandedProviders.has(selected.name) ? ' plugins__providers-arrow--expanded' : ''}`}
                    >
                      ▶
                    </span>{' '}
                    Providers ({selected.providers.length})
                  </button>
                  {expandedProviders.has(selected.name) &&
                    (loadingProviders.has(selected.name) &&
                    !selected.providerDetails ? (
                      <div className="plugins__empty">
                        Loading providers...
                      </div>
                    ) : (
                      selected.providerDetails && (
                        <div className="plugins__providers-list">
                        {selected.providerDetails.map((pr) => (
                          <div key={pr.type} className="plugins__provider-row">
                            <span className="plugins__cap plugins__cap--provider">
                              {pr.type}
                            </span>
                            {pr.layout && (
                              <span className="plugins__provider-scope">
                                {pr.layout}
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
                    )))}
                </div>
              )}

              {/* Settings */}
              {selected.hasSettings && settingsData?.schema?.length > 0 && (
                <div className="detail-panel__section">
                  <div className="plugins__settings-header">Settings</div>
                  <div className="plugins__settings-form">
                    {settingsData.schema.map((field: any) => (
                      <PluginSettingFieldRow
                        key={field.key}
                        field={field}
                        value={settingsData.values[field.key]}
                        onChange={(val) => {
                          const updated = { ...settingsData.values, [field.key]: val };
                          saveSettingsMutation.mutate({ name: selected.name, settings: updated });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Changelog */}
              {selected.git && changelogData?.entries?.length > 0 && (
                <div className="detail-panel__section">
                  <button
                    className="plugins__providers-toggle"
                    onClick={() => setChangelogExpanded((v) => !v)}
                  >
                    <span className={`plugins__providers-arrow${changelogExpanded ? ' plugins__providers-arrow--expanded' : ''}`}>▶</span>
                    {' '}Changelog ({changelogData.entries.length})
                  </button>
                  {changelogExpanded && (
                    <div className="plugins__changelog-list">
                      {changelogData.entries.map((entry: any) => (
                        <div key={entry.hash} className="plugins__changelog-entry">
                          <code className="plugins__changelog-hash">{entry.short}</code>
                          <span className="plugins__changelog-subject">{entry.subject}</span>
                          <span className="plugins__changelog-meta">
                            {entry.author} · {new Date(entry.date).toLocaleDateString()}
                          </span>
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
                        queryClient.invalidateQueries({
                          queryKey: ['plugins'],
                        });
                    }}
                  >
                    Review Permissions ({selected.permissions.missing.length})
                  </button>
                )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      {showRegistryModal && (
        <PluginRegistryModal
          onClose={() => {
            setShowRegistryModal(false);
            queryClient.invalidateQueries({ queryKey: ['plugins'] });
          }}
        />
      )}

      {/* Install Plugin Modal */}
      {showInstallModal && (
        <div
          className="plugins__modal-overlay"
          onClick={() => setShowInstallModal(false)}
        >
          <div
            className="plugins__modal plugins__modal--install"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="plugins__modal-header">
              <h3 className="plugins__modal-title">Install Plugin</h3>
              <button
                className="plugins__modal-close"
                onClick={() => setShowInstallModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="plugins__modal-body plugins__modal-body--visible">
              {installMessage && (
                <div
                  className={`plugins__modal-message plugins__message--${installMessage.type}`}
                >
                  {installMessage.text}
                </div>
              )}
              <div className="plugins__install plugins__install--modal">
                <span className="plugins__install-prefix">$</span>
                <PathAutocomplete
                  className="plugins__install-input"
                  value={installSource}
                  onChange={(val) => {
                    setInstallSource(val);
                    setPreviewData(null);
                    setInstallMessage(null);
                  }}
                  onSubmit={() => {
                    install();
                  }}
                  placeholder="git@github.com:org/plugin.git or /local/path"
                  disabled={installMutation.isPending}
                  apiBase={apiBase}
                />
                <button
                  className="plugins__browse-btn"
                  onClick={() => setShowFolderPicker(true)}
                  disabled={installMutation.isPending}
                  title="Browse local folders"
                >
                  📁
                </button>
                <button
                  className="plugins__install-btn"
                  onClick={() => {
                    install();
                  }}
                  disabled={
                    installMutation.isPending ||
                    previewMutation.isPending ||
                    !installSource.trim()
                  }
                >
                  {installMutation.isPending
                    ? 'Installing...'
                    : previewMutation.isPending
                      ? 'Validating...'
                      : 'Install'}
                </button>
              </div>
              <p className="plugins__install-hint">
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
              <div className="plugins__preview-header">
                <strong>
                  {previewData.manifest?.displayName ||
                    previewData.manifest?.name}
                </strong>
                <span className="plugins__card-version plugins__preview-version">
                  v{previewData.manifest?.version}
                </span>
                {previewData.git && (
                  <span className="plugins__cap plugins__cap--ref plugins__preview-version">
                    {previewData.git.branch}@{previewData.git.hash}
                  </span>
                )}
                {previewData.manifest?.description && (
                  <div className="plugins__card-desc plugins__preview-desc">
                    {previewData.manifest.description}
                  </div>
                )}
              </div>
              {previewData.conflicts.length > 0 && (
                <div className="plugins__modal-message plugins__message--error plugins__preview-conflicts">
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
                      className={`plugins__registry-item${skipped ? ' plugins__registry-item--skipped' : ''}`}
                    >
                      <label className="plugins__preview-label">
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
                        <span className="plugins__preview-conflict-tag">
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
                  <div className="plugins__preview-deps">
                    <div className="plugins__preview-deps-label">
                      Dependencies ({previewData.dependencies.length})
                    </div>
                    <div className="plugins__registry-list">
                      {previewData.dependencies.map((dep) => (
                        <div
                          key={dep.id}
                          className="plugins__registry-item plugins__preview-dep-item"
                        >
                          <div className="plugins__preview-dep-row">
                            <span className="plugins__cap plugins__cap--bundle">
                              dep
                            </span>
                            <span>{dep.id}</span>
                            {dep.git && (
                              <span className="plugins__cap plugins__cap--ref plugins__cap--sm">
                                {dep.git.branch}@{dep.git.hash}
                              </span>
                            )}
                            <span className="plugins__preview-dep-status">
                              {dep.status === 'installed'
                                ? '✓ installed'
                                : dep.status === 'will-install'
                                  ? '↓ will install'
                                  : '⚠ missing'}
                            </span>
                          </div>
                          {dep.components && dep.components.length > 0 && (
                            <div className="plugins__preview-dep-components">
                              {dep.components.map((c) => (
                                <span
                                  key={`${c.type}:${c.id}`}
                                  className={`plugins__cap plugins__cap--sm plugins__cap--${c.type === 'agent' ? 'agent' : c.type === 'workspace' ? 'workspace' : 'provider'}`}
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
              <div className="plugins__preview-actions">
                <button
                  className="plugins__confirm-cancel"
                  onClick={() => setPreviewData(null)}
                >
                  Cancel
                </button>
                <button
                  className="plugins__install-btn"
                  onClick={() => install(Array.from(previewSkips))}
                  disabled={installMutation.isPending}
                >
                  {installMutation.isPending
                    ? 'Installing...'
                    : 'Confirm Install'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installing overlay */}
      {installMutation.isPending && (
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
                    setLayout(slug, layoutAssignment.layoutSlug);
                  }
                } catch (e) {
                  console.warn('Quick project creation failed', e);
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
                        setLayout([...selectedProjects][0], layoutAssignment.layoutSlug);
                      } catch (e) {
                        console.warn('Layout assignment failed', e);
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
