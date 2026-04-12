import { SplitPaneLayout } from '../components/SplitPaneLayout';
import './PluginManagementView.css';
import './page-layout.css';
import './editor-layout.css';
import { PluginDetailPanel } from './plugin-management/PluginDetailPanel';
import { PluginEmptyState } from './plugin-management/PluginEmptyState';
import { PluginModalStack } from './plugin-management/PluginModalStack';
import { usePluginManagementViewModel } from './plugin-management/usePluginManagementViewModel';

/* ── Main View ── */
export function PluginManagementView() {
  const {
    addLayoutToProjects,
    apiBase,
    assigningLayout,
    changelogData,
    changelogExpanded,
    createProjectForLayout,
    deselectPlugin,
    expandedProviders,
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
    providerDetails,
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
    setChangelogExpanded,
    setInstallMessage,
    setInstallSourceAndReset,
    setLayoutAssignment,
    setPreviewData,
    setRemoveConfirm,
    setSearch,
    setShowFolderPicker,
    setShowInstallModal,
    setShowRegistryModal,
    showFolderPicker,
    showInstallModal,
    showRegistryModal,
    settingsData,
    toggleExpandedProviders,
    togglePreviewSkip,
    toggleProjectSelection,
    toggleProvider,
    updateMutation,
    updatePlugin,
    updates,
  } = usePluginManagementViewModel();

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
            onUpdateAll={() =>
              updates.forEach((update) => updatePlugin(update.name))
            }
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
            settingsData={settingsData}
            changelogData={changelogData}
            expandedProviders={expandedProviders}
            providerDetails={providerDetails}
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
          setInstallSourceAndReset(value);
          setInstallMessage(null);
        }}
        onBrowse={() => setShowFolderPicker(true)}
        onInstall={() => install()}
        onCloseInstall={() => setShowInstallModal(false)}
        onSelectFolder={setInstallSourceAndReset}
        onCloseFolderPicker={() => setShowFolderPicker(false)}
        onClosePreview={() => setPreviewData(null)}
        onToggleSkip={togglePreviewSkip}
        onConfirmInstall={() => install(Array.from(previewSkips))}
        onCancelRemove={() => setRemoveConfirm(null)}
        onConfirmRemove={remove}
        onCloseLayoutAssignment={() => setLayoutAssignment(null)}
        onToggleProject={toggleProjectSelection}
        onCreateProject={createProjectForLayout}
        onAddToProjects={addLayoutToProjects}
      />
    </>
  );
}
