interface ProjectSidebarHeaderProps {
  appName: string;
  collapsed: boolean;
  isMobile: boolean;
  onCloseMobile: () => void;
  onGoHome: () => void;
  onToggleCollapse: () => void;
}

export function ProjectSidebarHeader({
  appName,
  collapsed,
  isMobile,
  onCloseMobile,
  onGoHome,
  onToggleCollapse,
}: ProjectSidebarHeaderProps) {
  return (
    <div className="sidebar__header" onClick={onGoHome}>
      <img src="/favicon.png" alt="" className="sidebar__logo" />
      <span className="sidebar__brand-name">{appName}</span>
      <button
        type="button"
        className="sidebar__toggle"
        onClick={(event) => {
          event.stopPropagation();
          if (isMobile) {
            onCloseMobile();
          } else {
            onToggleCollapse();
          }
        }}
        title={
          isMobile
            ? 'Close menu'
            : collapsed
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
        )}
      </button>
    </div>
  );
}
