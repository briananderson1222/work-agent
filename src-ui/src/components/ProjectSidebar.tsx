import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useBranding } from '../hooks/useBranding';
import { ProjectSidebarHeader } from './project-sidebar/ProjectSidebarHeader';
import { ProjectSidebarNav } from './project-sidebar/ProjectSidebarNav';
import { ProjectSidebarRow } from './project-sidebar/ProjectSidebarRow';
import { useProjectSidebarState } from './project-sidebar/useProjectSidebarState';
import { buildSidebarClassName } from './project-sidebar/utils';
import './ProjectSidebar.css';

export function ProjectSidebar() {
  const { projects } = useProjects();
  const { selectedProject, selectedProjectLayout, navigate } = useNavigation();
  const { appName } = useBranding();
  const {
    effectiveCollapsed,
    isMobile,
    mobileOpen,
    setMobileOpen,
    toggleCollapse,
  } = useProjectSidebarState();

  return (
    <>
      {isMobile && mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={buildSidebarClassName({
          isMobile,
          mobileOpen,
          collapsed: effectiveCollapsed,
        })}
      >
        <ProjectSidebarHeader
          appName={appName}
          collapsed={effectiveCollapsed}
          isMobile={isMobile}
          onCloseMobile={() => setMobileOpen(false)}
          onGoHome={() => {
            navigate('/');
            if (isMobile) setMobileOpen(false);
          }}
          onToggleCollapse={toggleCollapse}
        />

        <div className="sidebar__body">
          {projects.map((project) => {
            const isActive = selectedProject === project.slug;
            return (
              <ProjectSidebarRow
                key={project.slug}
                project={project}
                isActive={isActive}
                activeLayout={
                  isActive
                    ? ((selectedProjectLayout as string | null) ?? null)
                    : null
                }
                collapsed={effectiveCollapsed}
                onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
              />
            );
          })}

          <button
            type="button"
            className="sidebar__new-project"
            onClick={() => {
              navigate('/projects/new');
              if (isMobile) setMobileOpen(false);
            }}
            title={effectiveCollapsed ? 'New Project' : undefined}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="sidebar__new-project-label">New Project</span>
          </button>
        </div>

        <ProjectSidebarNav
          collapsed={effectiveCollapsed}
          isMobile={isMobile}
          navigate={navigate}
          onAfterNavigate={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}
