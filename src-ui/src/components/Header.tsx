import { useAgents } from '../contexts/AgentsContext';
import type { NavigationView } from '../types';
import { useHeaderViewModel } from './header/useHeaderViewModel';
import { HeaderActions } from './header/HeaderActions';
import './chat.css';

interface HeaderProps {
  currentView?: NavigationView;
  onToggleSettings: () => void;
  onNavigate: (view: NavigationView) => void;
}

export function Header({
  currentView,
  onToggleSettings,
  onNavigate,
}: HeaderProps) {
  const agents = useAgents();
  const {
    breadcrumb,
    closeConnectionModal,
    closeHelp,
    closeNotifications,
    closeOverflow,
    goHome,
    handleHelpPrompt,
    helpPrompts,
    openConnectionModal,
    openProfile,
    settingsShortcut,
    showConnectionModal,
    showHelp,
    showNotifications,
    showOverflow,
    toggleHelp,
    toggleNotifications,
    toggleOverflow,
    userInitials,
  } = useHeaderViewModel({ currentView, agents, onNavigate });

  return (
    <header className="app-toolbar">
      {/* Mobile: hamburger + logo (opens sidebar drawer) */}
      <button
        className="app-toolbar__sidebar-toggle"
        onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
        aria-label="Toggle menu"
      >
        ☰
      </button>
      <img
        src="/favicon.png"
        alt=""
        className="app-toolbar__logo"
        onClick={goHome}
      />
      <span className="app-toolbar__brand" onClick={goHome}>
        Stallion
      </span>

      {/* Breadcrumb — show current project/layout context */}
      {breadcrumb && (
        <div className="app-toolbar__breadcrumb">
          <span
            className="app-toolbar__breadcrumb-link"
            onClick={() =>
              onNavigate({
                type: 'project',
                slug: breadcrumb.projectSlug,
              })
            }
          >
            {breadcrumb.projectSlug}
          </span>
          {breadcrumb.layoutSlug && (
            <>
              <span className="app-toolbar__breadcrumb-sep">/</span>
              <span className="app-toolbar__breadcrumb-current">
                {breadcrumb.layoutSlug}
              </span>
            </>
          )}
        </div>
      )}

      <div className="app-toolbar__spacer" />

      <HeaderActions
        currentViewType={currentView?.type}
        helpPrompts={helpPrompts}
        settingsShortcut={settingsShortcut}
        showConnectionModal={showConnectionModal}
        showHelp={showHelp}
        showNotifications={showNotifications}
        showOverflow={showOverflow}
        userInitials={userInitials}
        onCloseConnectionModal={closeConnectionModal}
        onCloseHelp={closeHelp}
        onCloseNotifications={closeNotifications}
        onCloseOverflow={closeOverflow}
        onHelpPrompt={handleHelpPrompt}
        onOpenConnections={openConnectionModal}
        onOpenProfile={openProfile}
        onToggleHelp={toggleHelp}
        onToggleNotifications={toggleNotifications}
        onToggleSettings={onToggleSettings}
        onToggleOverflow={toggleOverflow}
        onViewAllNotifications={() => onNavigate({ type: 'notifications' })}
      />
    </header>
  );
}
