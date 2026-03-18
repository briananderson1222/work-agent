import { useProjectLayoutsQuery } from '@stallion-ai/sdk';
import { type ReactNode, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { type ProjectMetadata, useProjects } from '../contexts/ProjectsContext';
import { useBranding } from '../hooks/useBranding';
import { LayoutIcon } from './LayoutIcon';
import './ProjectSidebar.css';

const NAV_ITEMS: { type: string; label: string; icon: ReactNode }[] = [
  {
    type: 'agents',
    label: 'Agents',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    type: 'connections',
    label: 'Connections',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    type: 'plugins',
    label: 'Plugins',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    type: 'schedule',
    label: 'Schedule',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    type: 'monitoring',
    label: 'Monitoring',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

const STORAGE_KEY = 'stallion-sidebar-collapsed';

function ProjectRow({
  project,
  isActive,
  activeLayout,
  collapsed,
  pageType,
}: {
  project: ProjectMetadata;
  isActive: boolean;
  activeLayout: string | null;
  collapsed: boolean;
  pageType: string | null;
}) {
  const [expanded, setExpanded] = useState(isActive);
  const { setProject, setLayout } = useNavigation();
  const { data: layouts } = useProjectLayoutsQuery(project.slug);

  const handleClick = () => {
    if (collapsed) {
      setProject(project.slug);
      return;
    }
    // Navigate to project dashboard and expand
    setExpanded(true);
    setProject(project.slug);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const btnClass = `sidebar__project-btn${isActive && !activeLayout ? ' sidebar__project-btn--active' : ''}`;

  return (
    <div>
      <button
        type="button"
        className={btnClass}
        onClick={handleClick}
        title={collapsed ? project.name : undefined}
      >
        <LayoutIcon layout={project} size={collapsed ? 28 : 18} />
        <span className="sidebar__project-name">{project.name}</span>
        {isActive && !collapsed && pageType && (
          <span className="sidebar__page-type">{pageType}</span>
        )}
        <span
          className={`sidebar__chevron${expanded ? ' sidebar__chevron--open' : ''}`}
          onClick={handleChevronClick}
          role="button"
          tabIndex={-1}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {expanded &&
        !collapsed &&
        Array.isArray(layouts) &&
        layouts.length > 0 && (
          <div className="sidebar__layouts">
            {layouts.map((layout: { slug: string; name: string }) => {
              const isLayoutActive = isActive && activeLayout === layout.slug;
              return (
                <button
                  key={layout.slug}
                  type="button"
                  className={`sidebar__layout-btn${isLayoutActive ? ' sidebar__layout-btn--active' : ''}`}
                  onClick={() => setLayout(project.slug, layout.slug)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {layout.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

export function ProjectSidebar() {
  const { projects } = useProjects();
  const { selectedProject, selectedLayout, pathname, navigate } = useNavigation();
  const { appName } = useBranding();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== 'false',
  );

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar__header" onClick={() => navigate('/')}>
        <img src="/favicon.png" alt="" className="sidebar__logo" />
        <span className="sidebar__brand-name">{appName}</span>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse();
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
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
            {collapsed ? (
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
        </button>
      </div>

      {/* Projects */}
      <div className="sidebar__body">
        {projects.map((project) => {
          const isActive = selectedProject === project.slug;
          let pageType: string | null = null;
          if (isActive) {
            if (pathname.includes('/settings')) pageType = 'Settings';
            else if (selectedLayout) pageType = null; // layout name shown in layout list
            else pageType = 'Dashboard';
          }
          return (
            <ProjectRow
              key={project.slug}
              project={project}
              isActive={isActive}
              activeLayout={
                isActive ? ((selectedLayout as string | null) ?? null) : null
              }
              collapsed={collapsed}
              pageType={pageType}
            />
          );
        })}

        <button
          type="button"
          className="sidebar__new-project"
          onClick={() => navigate('/projects/new')}
          title={collapsed ? 'New Project' : undefined}
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

      {/* Global nav */}
      <div className="sidebar__nav">
        {NAV_ITEMS.map(({ type, label, icon }) => {
          const isActive = window.location.pathname.startsWith(`/${type}`);
          return (
            <button
              key={type}
              type="button"
              className={`sidebar__nav-btn${isActive ? ' sidebar__nav-btn--active' : ''}`}
              onClick={() => navigate(`/${type}`)}
              title={collapsed ? label : undefined}
            >
              {icon}
              <span className="sidebar__nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
