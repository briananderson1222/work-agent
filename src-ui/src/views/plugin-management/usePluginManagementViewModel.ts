import {
  type PluginProviderDetail,
  type PluginSettingField,
  useAddProjectLayoutFromPluginMutation,
  useCreateProjectMutation,
  usePluginChangelogQuery,
  usePluginInstallMutation,
  usePluginPreviewMutation,
  usePluginProvidersQuery,
  usePluginProviderToggleMutation,
  usePluginRemoveMutation,
  usePluginSettingsMutation,
  usePluginSettingsQuery,
  usePluginsQuery,
  usePluginUpdateMutation,
  usePluginUpdatesQuery,
  useReloadPluginsMutation,
  waitForAgentHealth,
} from '@stallion-ai/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useApiBase } from '../../contexts/ApiBaseContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { useProjects } from '../../contexts/ProjectsContext';
import { usePermissions } from '../../core/PermissionManager';
import { pluginRegistry } from '../../core/PluginRegistry';
import { useUrlSelection } from '../../hooks/useUrlSelection';
import type {
  Plugin,
  PluginMessage,
  PluginUpdateSummary,
  PreviewData,
} from './types';
import {
  buildPluginListItems,
  filterPlugins,
  slugifyProjectName,
  toggleSetValue,
} from './view-utils';

export function usePluginManagementViewModel() {
  const { apiBase } = useApiBase();
  const { setLayout } = useNavigation();
  const queryClient = useQueryClient();
  const { requestConsent } = usePermissions();
  const { projects } = useProjects();
  const {
    selectedId: selectedPlugin,
    select: selectPlugin,
    deselect: deselectPlugin,
  } = useUrlSelection('/plugins');

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
  const [search, setSearch] = useState('');
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

  const selected = plugins.find((plugin) => plugin.name === selectedPlugin);

  const { data: settingsData } = usePluginSettingsQuery(selectedPlugin, {
    enabled: !!selectedPlugin && !!selected?.hasSettings,
  });

  const { data: changelogData } = usePluginChangelogQuery(selectedPlugin, {
    enabled: !!selectedPlugin && !!selected?.git,
  });

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

  const filtered = useMemo(
    () => filterPlugins(plugins, search),
    [plugins, search],
  );
  const items = useMemo(() => buildPluginListItems(filtered), [filtered]);

  async function reloadClientPluginRegistry() {
    try {
      await pluginRegistry.reload();
    } catch (error) {
      console.warn('Plugin registry reload failed', error);
    }
  }

  function toggleProvider(
    pluginName: string,
    providerType: string,
    currentlyEnabled: boolean,
  ) {
    if (!providerDetails) return;
    const disabled = providerDetails
      .filter((provider) =>
        provider.type === providerType ? currentlyEnabled : !provider.enabled,
      )
      .map((provider) => provider.type);
    toggleProviderMutation.mutate(
      { pluginName, disabled },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: ['plugin-providers', pluginName],
          }),
      },
    );
  }

  async function install(skipList?: string[]) {
    const source = installSource.trim();
    if (!source) return;

    if (!previewData && !skipList) {
      setInstallMessage(null);
      previewMutation.mutate(source, {
        onSuccess: (data: PreviewData) => {
          if (!data.valid) {
            setInstallMessage({
              type: 'error',
              text: data.error || 'Invalid plugin',
            });
            return;
          }
          setPreviewSkips(
            new Set(data.conflicts.map((entry) => `${entry.type}:${entry.id}`)),
          );
          setPreviewData(data);
        },
        onError: (error) =>
          setInstallMessage({ type: 'error', text: error.message }),
      });
      return;
    }

    setMessage(null);
    setPreviewData(null);
    installMutation.mutate(
      { source, skip: skipList || Array.from(previewSkips) },
      {
        onSuccess: async (data) => {
          const pluginName = data.plugin.displayName || data.plugin.name;
          const pending = data.permissions?.pendingConsent;
          setShowInstallModal(false);

          if (pending?.length) {
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
        onError: (error) =>
          setInstallMessage({ type: 'error', text: error.message }),
      },
    );
  }

  function updatePlugin(name: string) {
    setMessage(null);
    updateMutation.mutate(name, {
      onSuccess: (data) => {
        setMessage({
          type: 'success',
          text: `Updated ${data.plugin?.name || name} to v${data.plugin?.version}`,
        });
      },
      onError: (error) => setMessage({ type: 'error', text: error.message }),
    });
  }

  function remove(name: string) {
    setRemoveConfirm(null);
    removeMutation.mutate(name, {
      onSuccess: async () => {
        setMessage({ type: 'success', text: `Removed ${name}.` });
        deselectPlugin();
        await reloadClientPluginRegistry();
      },
      onError: (error) => setMessage({ type: 'error', text: error.message }),
    });
  }

  function savePluginSetting(name: string, key: string, value: unknown) {
    saveSettingsMutation.mutate({
      name,
      settings: {
        ...(settingsData?.values || {}),
        [key]: value,
      },
    });
  }

  async function createProjectForLayout() {
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
  }

  async function addLayoutToProjects() {
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
  }

  return {
    apiBase,
    assigningLayout,
    changelogData,
    changelogExpanded,
    createProjectForLayout,
    filtered,
    install,
    installMessage,
    installMutation,
    installSource,
    isLoading,
    items,
    layoutAssignment,
    loadingProviderDetails,
    message,
    plugins,
    previewData,
    previewMutation,
    previewSkips,
    projects,
    providerDetails: providerDetails as PluginProviderDetail[] | undefined,
    queryClient,
    quickProjectName,
    remove,
    removeConfirm,
    requestConsent,
    savePluginSetting,
    search,
    selected,
    selectedPlugin,
    selectedProjects,
    selectPlugin,
    deselectPlugin,
    setChangelogExpanded,
    setInstallMessage,
    setLayoutAssignment,
    setPreviewData,
    setQuickProjectName,
    setRemoveConfirm,
    setSearch,
    setShowFolderPicker,
    setShowInstallModal,
    setShowRegistryModal,
    settingsData: settingsData
      ? {
          schema: settingsData.schema as PluginSettingField[],
          values: settingsData.values,
        }
      : undefined,
    showFolderPicker,
    showInstallModal,
    showRegistryModal,
    setInstallSourceAndReset: (value: string) => {
      setInstallSource(value);
      setPreviewData(null);
    },
    toggleExpandedProviders: (pluginName: string) =>
      setExpandedProviders((current) => toggleSetValue(current, pluginName)),
    expandedProviders,
    togglePreviewSkip: (key: string) =>
      setPreviewSkips((current) => toggleSetValue(current, key)),
    toggleProjectSelection: (slug: string, checked: boolean) =>
      setSelectedProjects((current) =>
        checked ? new Set(current).add(slug) : toggleSetValue(current, slug),
      ),
    toggleProvider,
    updateMutation,
    updatePlugin,
    updates,
    addLayoutToProjects,
  };
}
