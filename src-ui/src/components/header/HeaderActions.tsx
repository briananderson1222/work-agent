import {
  ConnectionManagerModal,
  ConnectionStatusDot,
  useConnectionStatus,
  useConnections,
} from '@stallion-ai/connect';
import { NotificationHistory } from '../NotificationHistory';
import { checkServerHealth } from '../../lib/serverHealth';
import { HelpMenu } from './HelpMenu';
import { OverflowMenu } from './OverflowMenu';
import type { HeaderHelpPrompt } from './utils';

interface HeaderActionsProps {
  currentViewType?: string;
  helpPrompts: HeaderHelpPrompt[];
  settingsShortcut: string;
  showConnectionModal: boolean;
  showHelp: boolean;
  showNotifications: boolean;
  showOverflow: boolean;
  userInitials: string;
  onCloseConnectionModal: () => void;
  onCloseHelp: () => void;
  onCloseNotifications: () => void;
  onCloseOverflow: () => void;
  onHelpPrompt: (prompt: string) => void;
  onOpenConnections: () => void;
  onOpenProfile: () => void;
  onToggleHelp: () => void;
  onToggleNotifications: () => void;
  onToggleSettings: () => void;
  onToggleOverflow: () => void;
  onViewAllNotifications: () => void;
}

export function HeaderActions({
  currentViewType,
  helpPrompts,
  settingsShortcut,
  showConnectionModal,
  showHelp,
  showNotifications,
  showOverflow,
  userInitials,
  onCloseConnectionModal,
  onCloseHelp,
  onCloseNotifications,
  onCloseOverflow,
  onHelpPrompt,
  onOpenConnections,
  onOpenProfile,
  onToggleHelp,
  onToggleNotifications,
  onToggleSettings,
  onToggleOverflow,
  onViewAllNotifications,
}: HeaderActionsProps) {
  const { activeConnection } = useConnections();
  const { status: connStatus } = useConnectionStatus({
    checkHealth: checkServerHealth,
    pollInterval: 15_000,
  });

  return (
    <>
      <div className="app-toolbar__actions">
        <div className="header-divider" />

        <button
          type="button"
          className="app-toolbar__icon-btn app-toolbar__action--secondary"
          onClick={onOpenConnections}
          title="Manage connections"
        >
          <ConnectionStatusDot status={connStatus} size={7} />
          {activeConnection?.name && activeConnection.name !== 'Default' && (
            <span className="app-toolbar__conn-name">
              {activeConnection.name}
            </span>
          )}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="app-toolbar__icon-btn"
            onClick={onToggleNotifications}
            title="Notifications"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </button>
          <NotificationHistory
            isOpen={showNotifications}
            onClose={onCloseNotifications}
            onViewAll={onViewAllNotifications}
          />
        </div>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentViewType === 'profile' ? 'is-active' : ''}`}
          onClick={onOpenProfile}
          title="Profile"
          aria-label="Profile"
        >
          {userInitials}
        </button>

        <div className="app-toolbar__action--secondary">
          <button
            type="button"
            className={`app-toolbar__icon-btn app-toolbar__icon-btn--help ${showHelp ? 'is-active' : ''}`}
            onClick={onToggleHelp}
            title="Ask Stallion for help"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>

        <HelpMenu
          isOpen={showHelp}
          prompts={helpPrompts}
          onClose={onCloseHelp}
          onSelectPrompt={onHelpPrompt}
        />

        <div className="app-toolbar__overflow" style={{ position: 'relative' }}>
          <button
            type="button"
            className="app-toolbar__icon-btn app-toolbar__overflow-btn"
            onClick={onToggleOverflow}
            aria-label="More actions"
          >
            ⋯
          </button>
          <OverflowMenu
            isOpen={showOverflow}
            connStatus={connStatus}
            onClose={onCloseOverflow}
            onOpenConnections={onOpenConnections}
            onOpenHelp={onToggleHelp}
          />
        </div>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentViewType === 'settings' ? 'is-active' : ''}`}
          onClick={onToggleSettings}
          title={`Settings (${settingsShortcut})`}
        >
          ⚙
        </button>
      </div>

      <ConnectionManagerModal
        isOpen={showConnectionModal}
        onClose={onCloseConnectionModal}
        checkHealth={checkServerHealth}
      />
    </>
  );
}
