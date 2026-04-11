import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useBranding } from '../hooks/useBranding';
import { PROJECT_SIDEBAR_NAV_ITEMS } from './project-sidebar/nav-items';
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
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={buildSidebarClassName({
          isMobile,
          mobileOpen,
          collapsed: effectiveCollapsed,
        })}
      >
        <div
          className="sidebar__header"
          onClick={() => {
            navigate('/');
            if (isMobile) setMobileOpen(false);
          }}
        >
          <img src="/favicon.png" alt="" className="sidebar__logo" />
          <span className="sidebar__brand-name">{appName}</span>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={(event) => {
              event.stopPropagation();
              if (isMobile) {
                setMobileOpen(false);
              } else {
                toggleCollapse();
              }
            }}
            title={
              isMobile
                ? 'Close menu'
                : effectiveCollapsed
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
            }
          >
            {isMobile ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {effectiveCollapsed ? (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <polyline points="13 9 16 12 13 15" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <polyline points="15 9 12 12 15 15" />
                  </>
                )}
              </svg>
            )}
          </button>
        </div>

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

        <div className="sidebar__nav">
          {PROJECT_SIDEBAR_NAV_ITEMS.map(({ type, label, icon }) => {
            const isActive = window.location.pathname.startsWith(`/${type}`);
            return (
              <button
                key={type}
                type="button"
                className={`sidebar__nav-btn${isActive ? ' sidebar__nav-btn--active' : ''}`}
                onClick={() => {
                  navigate(`/${type}`);
                  if (isMobile) setMobileOpen(false);
                }}
                title={effectiveCollapsed ? label : undefined}
              >
                {icon}
                <span className="sidebar__nav-label">{label}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
