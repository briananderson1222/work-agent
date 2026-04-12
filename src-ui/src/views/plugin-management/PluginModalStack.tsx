import { FolderPickerModal } from './FolderPickerModal';
import { InstallPluginModal } from './InstallPluginModal';
import { InstallPreviewModal } from './InstallPreviewModal';
import { LayoutAssignmentModal } from './LayoutAssignmentModal';
import { PluginRegistryModal } from './PluginRegistryModal';
import type { PluginMessage, PreviewData } from './types';

export function PluginModalStack({
  apiBase,
  showRegistryModal,
  showInstallModal,
  showFolderPicker,
  previewData,
  previewSkips,
  installPending,
  previewPending,
  installSource,
  installMessage,
  message,
  removeConfirm,
  layoutAssignment,
  projects,
  quickProjectName,
  selectedProjects,
  assigningLayout,
  onCloseRegistry,
  onChangeSource,
  onBrowse,
  onInstall,
  onCloseInstall,
  onSelectFolder,
  onCloseFolderPicker,
  onClosePreview,
  onToggleSkip,
  onConfirmInstall,
  onCancelRemove,
  onConfirmRemove,
  onCloseLayoutAssignment,
  onToggleProject,
  onCreateProject,
  onAddToProjects,
}: {
  apiBase: string;
  showRegistryModal: boolean;
  showInstallModal: boolean;
  showFolderPicker: boolean;
  previewData: PreviewData | null;
  previewSkips: Set<string>;
  installPending: boolean;
  previewPending: boolean;
  installSource: string;
  installMessage: PluginMessage | null;
  message: PluginMessage | null;
  removeConfirm: string | null;
  layoutAssignment: {
    pluginName: string;
    displayName: string;
    layoutSlug: string;
  } | null;
  projects: Array<{ slug: string; name: string }>;
  quickProjectName: string;
  selectedProjects: Set<string>;
  assigningLayout: boolean;
  onCloseRegistry: () => void;
  onChangeSource: (value: string) => void;
  onBrowse: () => void;
  onInstall: () => void;
  onCloseInstall: () => void;
  onSelectFolder: (value: string) => void;
  onCloseFolderPicker: () => void;
  onClosePreview: () => void;
  onToggleSkip: (key: string) => void;
  onConfirmInstall: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: (name: string) => void;
  onCloseLayoutAssignment: () => void;
  onToggleProject: (slug: string, checked: boolean) => void;
  onCreateProject: () => Promise<void>;
  onAddToProjects: () => Promise<void>;
}) {
  return (
    <>
      {showRegistryModal && <PluginRegistryModal onClose={onCloseRegistry} />}

      {showInstallModal && (
        <InstallPluginModal
          apiBase={apiBase}
          installSource={installSource}
          installMessage={installMessage}
          installPending={installPending}
          previewPending={previewPending}
          onChangeSource={onChangeSource}
          onBrowse={onBrowse}
          onInstall={onInstall}
          onClose={onCloseInstall}
        />
      )}

      {showFolderPicker && (
        <FolderPickerModal
          onSelect={onSelectFolder}
          onClose={onCloseFolderPicker}
        />
      )}

      {previewData && (
        <InstallPreviewModal
          previewData={previewData}
          previewSkips={previewSkips}
          installPending={installPending}
          onClose={onClosePreview}
          onToggleSkip={onToggleSkip}
          onConfirm={onConfirmInstall}
        />
      )}

      {installPending && (
        <div className="plugins__modal-overlay">
          <div className="plugins__installing-card">
            <div className="plugins__installing-spinner" />
            <p className="plugins__installing-text">
              {message?.text || 'Installing plugin…'}
            </p>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div className="plugins__confirm-overlay" onClick={onCancelRemove}>
          <div
            className="plugins__confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Remove Plugin</h3>
            <p>Remove &ldquo;{removeConfirm}&rdquo;? This cannot be undone.</p>
            <div className="plugins__confirm-actions">
              <button
                className="plugins__confirm-cancel"
                onClick={onCancelRemove}
              >
                Cancel
              </button>
              <button
                className="plugins__confirm-delete"
                onClick={() => onConfirmRemove(removeConfirm)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {layoutAssignment && (
        <LayoutAssignmentModal
          assignment={layoutAssignment}
          projects={projects}
          quickProjectName={quickProjectName}
          selectedProjects={selectedProjects}
          assigningLayout={assigningLayout}
          onClose={onCloseLayoutAssignment}
          onToggleProject={onToggleProject}
          onCreateProject={onCreateProject}
          onAddToProjects={onAddToProjects}
        />
      )}
    </>
  );
}
