import { PROJECT_SIDEBAR_NAV_ITEMS } from './nav-items';

interface ProjectSidebarNavProps {
  collapsed: boolean;
  isMobile: boolean;
  navigate: (path: string) => void;
  onAfterNavigate?: () => void;
}

export function ProjectSidebarNav({
  collapsed,
  isMobile,
  navigate,
  onAfterNavigate,
}: ProjectSidebarNavProps) {
  return (
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
              if (isMobile) onAfterNavigate?.();
            }}
            title={collapsed ? label : undefined}
          >
            {icon}
            <span className="sidebar__nav-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
