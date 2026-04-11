import { useProjectLayoutsQuery } from '@stallion-ai/sdk';
import { useState } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import type { ProjectMetadata } from '../../contexts/ProjectsContext';
import { LayoutIcon } from '../LayoutIcon';

export function ProjectSidebarRow({
  project,
  isActive,
  activeLayout,
  collapsed,
  onNavigate,
}: {
  project: ProjectMetadata;
  isActive: boolean;
  activeLayout: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(isActive);
  const { setProject, setLayout } = useNavigation();
  const { data: layouts } = useProjectLayoutsQuery(project.slug);

  const handleClick = () => {
    if (collapsed) {
      setProject(project.slug);
      onNavigate?.();
      return;
    }
    setExpanded(true);
    setProject(project.slug);
    onNavigate?.();
  };

  const handleChevronClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const btnClass = `sidebar__project-btn${isActive ? ' sidebar__project-btn--active' : ''}`;

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
                  onClick={() => {
                    setLayout(project.slug, layout.slug);
                    onNavigate?.();
                  }}
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
