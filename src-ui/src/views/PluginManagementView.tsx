import {
  type PluginProviderDetail,
  type PluginSettingField,
  useAddProjectLayoutFromPluginMutation,
  useCreateProjectMutation,
  usePluginChangelogQuery,
  usePluginInstallMutation,
  usePluginPreviewMutation,
  usePluginProviderToggleMutation,
  usePluginProvidersQuery,
  usePluginRemoveMutation,
  usePluginSettingsMutation,
  usePluginSettingsQuery,
  usePluginsQuery,
  useReloadPluginsMutation,
  usePluginUpdateMutation,
  usePluginUpdatesQuery,
  waitForAgentHealth,
} from '@stallion-ai/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { pluginRegistry } from '../core/PluginRegistry';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';
import { usePermissions } from '../core/PermissionManager';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './PluginManagementView.css';
import './page-layout.css';
import './editor-layout.css';
import { PluginDetailPanel } from './plugin-management/PluginDetailPanel';
import { PluginEmptyState } from './plugin-management/PluginEmptyState';
import { PluginModalStack } from './plugin-management/PluginModalStack';
import type {
  Plugin,
  PluginMessage,
  PluginUpdateSummary,
  PreviewData,
} from './plugin-management/types';
import {
  buildPluginListItems,
  filterPlugins,
  slugifyProjectName,
} from './plugin-management/view-utils';

/* ── Main View ── */
export function PluginManagementView() {
  const { apiBase } = useApiBase();
  const { setLayout } = useNavigation();
  const queryClient = useQueryClient();
  const { requestConsent } = usePermissions();
  const { data: plugins = [], isLoading } = usePluginsQuery() as {
    data: Plugin[];
    isLoading: boolean;
  };
  const { data: updates = [] } = usePluginUpdatesQuery() as {
    data: PluginUpdateSummary[];
  };

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
  const [message, setMessage] = useState<PluginMessage | null>(null);
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
  const [installMessage, setInstallMessage] = useState<PluginMessage | null>(
    null,
  );
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  /* ── Settings & Changelog Queries ── */

  const selected = plugins.find((p) => p.name === selectedPlugin);

  const { data: settingsData } = usePluginSettingsQuery(selectedPlugin, {
    enabled: !!selectedPlugin && !!selected?.hasSettings,
  });

  const { data: changelogData } = usePluginChangelogQuery(selectedPlugin, {
    enabled: !!selectedPlugin && !!selected?.git,
  });

  /* ── Mutations ── */

  const saveSettingsMutation = usePluginSettingsMutation();

  const previewMutation = usePluginPreviewMutation();

  const installMutation = usePluginInstallMutation();

  const createProjectMutation = useCreateProjectMutation();
  const addLayoutFromPluginMutation = useAddProjectLayoutFromPluginMutation();
  const reloadPluginsMutation = useReloadPluginsMutation();
  const updateMutation = usePluginUpdateMutation();

  const removeMutation = usePluginRemoveMutation();

  const toggleProviderMutation = usePluginProviderToggleMutation();

  const { data: providerDetails, isLoading: loadingProviderDetails } =
    usePluginProvidersQuery(selectedPlugin, {
      enabled: !!selectedPlugin && expandedProviders.has(selectedPlugin),
    });

  async function reloadClientPluginRegistry() {
    try {
      await pluginRegistry.reload();
    } catch (error) {
      console.warn('Plugin registry reload failed', error);
    }
  }

  const toggleProvider = (
    pluginName: string,
    providerType: string,
    currentlyEnabled: boolean,
  ) => {
    if (!providerDetails) return;
    const disabled = providerDetails
      .filter((p) => (p.type === providerType ? currentlyEnabled : !p.enabled))
      .map((p) => p.type);
    toggleProviderMutation.mutate(
      { pluginName, disabled },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: ['plugin-providers', pluginName],
          }),
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
        onSuccess: (data: PreviewData) => {
          if (!data.valid) {
            setInstallMessage({
              type: 'error',
              text: data.error || 'Invalid plugin',
            });
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
          try {
            await reloadPluginsMutation.mutateAsync();
          } catch (error) {
            console.warn('Plugin reload failed', error);
          }
          await reloadClientPluginRegistry();

          // Poll agent health until tools are connected (max 30s)
          const agents = data.plugin.agents || [];
          if (agents.length > 0) {
            const slug = agents[0].slug;
            const health = await waitForAgentHealth(slug);
            if (!health) {
              console.warn('Agent health poll timed out', { slug });
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
      onSuccess: async () => {
        setMessage({ type: 'success', text: `Removed ${name}.` });
        await reloadClientPluginRegistry();
      },
      onError: (e) => setMessage({ type: 'error', text: e.message }),
    });
  };

  const filtered = useMemo(() => filterPlugins(plugins, search), [plugins, search]);
  const items = useMemo(() => buildPluginListItems(filtered), [filtered]);

  const toggleExpandedProviders = (pluginName: string) => {
    const next = new Set(expandedProviders);
    if (next.has(pluginName)) next.delete(pluginName);
    else next.add(pluginName);
    setExpandedProviders(next);
  };

  const savePluginSetting = (name: string, key: string, value: unknown) => {
    const updated = {
      ...(settingsData?.values || {}),
      [key]: value,
    };
    saveSettingsMutation.mutate({
      name,
      settings: updated,
    });
  };

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
          <PluginEmptyState
            updates={updates}
            plugins={plugins}
            filteredPlugins={filtered}
            isLoading={isLoading}
            search={search}
            message={message}
            onUpdateAll={() => updates.forEach((update) => updatePlugin(update.name))}
            onInstall={() => {
              setInstallMessage(null);
              setShowInstallModal(true);
            }}
          />
        }
      >
        {selected && (
          <PluginDetailPanel
            selected={selected}
            updates={updates}
            message={message}
            settingsData={
              settingsData
                ? {
                    schema: settingsData.schema as PluginSettingField[],
                    values: settingsData.values,
                  }
                : undefined
            }
            changelogData={changelogData}
            expandedProviders={expandedProviders}
            providerDetails={providerDetails as PluginProviderDetail[] | undefined}
            loadingProviderDetails={loadingProviderDetails}
            changelogExpanded={changelogExpanded}
            updatePending={updateMutation.isPending}
            updateTarget={updateMutation.variables}
            onUpdate={updatePlugin}
            onCheckUpdates={() =>
              queryClient.invalidateQueries({
                queryKey: ['plugin-updates'],
              })
            }
            onRemove={setRemoveConfirm}
            onToggleProviders={toggleExpandedProviders}
            onToggleProvider={toggleProvider}
            onSaveSetting={savePluginSetting}
            onToggleChangelog={() => setChangelogExpanded((value) => !value)}
            onReviewPermissions={async () => {
              const approved = await requestConsent(
                selected.name,
                selected.displayName || selected.name,
                selected.permissions?.missing || [],
              );
              if (approved) {
                queryClient.invalidateQueries({
                  queryKey: ['plugins'],
                });
              }
            }}
          />
        )}
      </SplitPaneLayout>

      <PluginModalStack
        apiBase={apiBase}
        showRegistryModal={showRegistryModal}
        showInstallModal={showInstallModal}
        showFolderPicker={showFolderPicker}
        previewData={previewData}
        previewSkips={previewSkips}
        installPending={installMutation.isPending}
        previewPending={previewMutation.isPending}
        installSource={installSource}
        installMessage={installMessage}
        message={message}
        removeConfirm={removeConfirm}
        layoutAssignment={layoutAssignment}
        projects={projects}
        quickProjectName={quickProjectName}
        selectedProjects={selectedProjects}
        assigningLayout={assigningLayout}
        onCloseRegistry={() => {
          setShowRegistryModal(false);
          queryClient.invalidateQueries({ queryKey: ['plugins'] });
        }}
        onChangeSource={(value) => {
          setInstallSource(value);
          setPreviewData(null);
          setInstallMessage(null);
        }}
        onBrowse={() => setShowFolderPicker(true)}
        onInstall={() => install()}
        onCloseInstall={() => setShowInstallModal(false)}
        onSelectFolder={setInstallSource}
        onCloseFolderPicker={() => setShowFolderPicker(false)}
        onClosePreview={() => setPreviewData(null)}
        onToggleSkip={(key) => {
          const next = new Set(previewSkips);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          setPreviewSkips(next);
        }}
        onConfirmInstall={() => install(Array.from(previewSkips))}
        onCancelRemove={() => setRemoveConfirm(null)}
        onConfirmRemove={remove}
        onCloseLayoutAssignment={() => setLayoutAssignment(null)}
        onToggleProject={(slug, checked) => {
          const next = new Set(selectedProjects);
          checked ? next.add(slug) : next.delete(slug);
          setSelectedProjects(next);
        }}
        onCreateProject={async () => {
          if (!layoutAssignment) return;
          setAssigningLayout(true);
          try {
            const slug = slugifyProjectName(quickProjectName);
            await createProjectMutation.mutateAsync({
              name: quickProjectName,
              slug,
            });
            await addLayoutFromPluginMutation.mutateAsync({
              projectSlug: slug,
              plugin: layoutAssignment.pluginName,
            });
            setLayoutAssignment(null);
            setLayout(slug, layoutAssignment.layoutSlug);
          } catch (error) {
            console.warn('Quick project creation failed', error);
            setMessage({
              type: 'error',
              text: 'Failed to create a project for the plugin layout.',
            });
          } finally {
            setAssigningLayout(false);
          }
        }}
        onAddToProjects={async () => {
          if (!layoutAssignment) return;
          setAssigningLayout(true);
          try {
            for (const slug of selectedProjects) {
              await addLayoutFromPluginMutation.mutateAsync({
                projectSlug: slug,
                plugin: layoutAssignment.pluginName,
              });
            }
            setLayoutAssignment(null);
            setLayout([...selectedProjects][0], layoutAssignment.layoutSlug);
          } catch (error) {
            console.warn('Layout assignment failed', error);
            setMessage({
              type: 'error',
              text: 'Failed to add the plugin layout to one or more projects.',
            });
          } finally {
            setAssigningLayout(false);
          }
        }}
      />
    </>
  );
}
