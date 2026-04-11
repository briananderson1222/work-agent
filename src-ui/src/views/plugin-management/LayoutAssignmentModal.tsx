import { Checkbox } from '../../components/Checkbox';

export function LayoutAssignmentModal({
  assignment,
  projects,
  quickProjectName,
  selectedProjects,
  assigningLayout,
  onClose,
  onToggleProject,
  onCreateProject,
  onAddToProjects,
}: {
  assignment: {
    pluginName: string;
    displayName: string;
    layoutSlug: string;
  };
  projects: Array<{
    slug: string;
    name: string;
    icon?: string;
    layoutCount: number;
  }>;
  quickProjectName: string;
  selectedProjects: Set<string>;
  assigningLayout: boolean;
  onClose: () => void;
  onToggleProject: (slug: string, checked: boolean) => void;
  onCreateProject: () => void;
  onAddToProjects: () => void;
}) {
  return (
    <div className="plugins__confirm-overlay" onClick={onClose}>
      <div
        className="plugins__confirm plugins__confirm--wide"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="plugins__assign-heading">Add Layout to Project</h3>
        <p className="plugins__assign-desc">
          <strong>{assignment.displayName}</strong> includes a layout. Add it to
          a project to start using it.
        </p>

        <button
          className="plugins__btn plugins__btn--install plugins__assign-quick-btn"
          disabled={assigningLayout}
          onClick={onCreateProject}
        >
          ✨ Create &ldquo;{quickProjectName}&rdquo; Project
        </button>

        {projects.length > 0 && (
          <>
            <div className="plugins__assign-section-label">
              Or add to existing
            </div>
            <div className="plugins__assign-project-list">
              {projects.map((project) => (
                <label
                  key={project.slug}
                  className={`plugins__assign-project${selectedProjects.has(project.slug) ? ' plugins__assign-project--selected' : ''}`}
                >
                  <Checkbox
                    checked={selectedProjects.has(project.slug)}
                    onChange={(checked) =>
                      onToggleProject(project.slug, checked)
                    }
                  />
                  <span>
                    {project.icon && `${project.icon} `}
                    {project.name}
                  </span>
                  <span className="plugins__assign-project-count">
                    {project.layoutCount} layout
                    {project.layoutCount !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>
            {selectedProjects.size > 0 && (
              <button
                className="plugins__btn plugins__btn--install plugins__assign-add-btn"
                disabled={assigningLayout}
                onClick={onAddToProjects}
              >
                Add to {selectedProjects.size} project
                {selectedProjects.size !== 1 ? 's' : ''}
              </button>
            )}
          </>
        )}

        <button className="plugins__assign-skip" onClick={onClose}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
