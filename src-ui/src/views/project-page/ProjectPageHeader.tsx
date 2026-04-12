import { GitBadge } from '../../components/GitBadge';
import { PathAutocomplete } from '../../components/PathAutocomplete';

export function ProjectPageHeader({
  apiBase,
  project,
  gitStatus,
  editingDir,
  setEditingDir,
  dirDraft,
  setDirDraft,
  updateWorkingDirectory,
  navigateToSettings,
}: {
  apiBase: string;
  project: {
    icon?: string;
    name: string;
    description?: string;
    workingDirectory?: string;
  };
  gitStatus: any;
  editingDir: boolean;
  setEditingDir: (editing: boolean) => void;
  dirDraft: string;
  setDirDraft: (value: string) => void;
  updateWorkingDirectory: (value: string) => void;
  navigateToSettings: () => void;
}) {
  return (
    <>
      <div className="project-page__header">
        <div className="project-page__identity">
          {project.icon && (
            <span className="project-page__icon">{project.icon}</span>
          )}
          <div className="project-page__identity-info">
            <h2 className="project-page__name">{project.name}</h2>
            {!editingDir && (
              <button
                className="project-page__dir-display"
                onClick={() => {
                  setDirDraft(project.workingDirectory ?? '');
                  setEditingDir(true);
                }}
              >
                <span className="project-page__dir-path">
                  {project.workingDirectory || 'Set working directory…'}
                </span>
                <span className="project-page__dir-edit-icon">✎</span>
              </button>
            )}
            {gitStatus && (
              <GitBadge git={gitStatus} className="project-page__git-badge" />
            )}
            {project.description && (
              <p className="project-page__desc">{project.description}</p>
            )}
          </div>
        </div>
        <button
          className="project-page__settings-btn"
          onClick={navigateToSettings}
        >
          ⚙ Settings
        </button>
      </div>

      {editingDir && (
        <div className="project-page__dir-inline">
          <PathAutocomplete
            apiBase={apiBase}
            value={dirDraft}
            onChange={setDirDraft}
            onSubmit={() => updateWorkingDirectory(dirDraft)}
            onBlur={() => {
              if (dirDraft !== (project.workingDirectory ?? '')) {
                updateWorkingDirectory(dirDraft);
              } else {
                setEditingDir(false);
              }
            }}
            placeholder="/path/to/project"
            className="project-page__dir-input"
          />
        </div>
      )}
    </>
  );
}
