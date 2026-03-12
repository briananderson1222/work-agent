import {
  ConnectionManagerModal,
  ConnectionStatusDot,
  useConnectionStatus,
  useConnections,
} from '@stallion-ai/connect';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import type { NavigationView } from '../types';
import { getInitials } from '../utils/layout';
import { NotificationHistory } from './NotificationHistory';
import './chat.css';

function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`)
    .then((r) => r.ok)
    .catch(() => false);
}

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
  const settingsShortcut = useShortcutDisplay('app.settings');
  const { user: authUser } = useAuth();
  const userName = authUser?.name || authUser?.alias || 'User';
  const userInitials = getInitials(userName);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const { activeConnection } = useConnections();
  const { status: connStatus } = useConnectionStatus({
    checkHealth: checkServerHealth,
    pollInterval: 15_000,
  });

  return (
    <header className="app-toolbar">
      {/* Breadcrumb — show current project/layout context */}
      {currentView &&
        'projectSlug' in currentView &&
        (currentView as any).projectSlug && (
          <div className="app-toolbar__breadcrumb">
            <span
              className="app-toolbar__breadcrumb-link"
              onClick={() =>
                onNavigate({
                  type: 'project',
                  slug: (currentView as any).projectSlug,
                })
              }
            >
              {(currentView as any).projectSlug}
            </span>
            {'layoutSlug' in currentView && (currentView as any).layoutSlug && (
              <>
                <span className="app-toolbar__breadcrumb-sep">/</span>
                <span className="app-toolbar__breadcrumb-current">
                  {(currentView as any).layoutSlug}
                </span>
              </>
            )}
          </div>
        )}

      <div className="app-toolbar__spacer" />

      <div className="app-toolbar__actions">
        <div className="header-divider" />

        {/* Connection status chip */}
        <button
          type="button"
          className="app-toolbar__icon-btn"
          onClick={() => setShowConnectionModal(true)}
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
            onClick={() => setShowNotifications(!showNotifications)}
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
            onClose={() => setShowNotifications(false)}
            onViewAll={() => onNavigate({ type: 'notifications' })}
          />
        </div>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentView?.type === 'profile' ? 'is-active' : ''}`}
          onClick={() => {
            if (currentView?.type === 'profile') {
              onNavigate({ type: 'standalone-layout' });
            } else {
              onNavigate({ type: 'profile' });
            }
          }}
          title="Profile"
        >
          {userInitials}
        </button>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentView?.type === 'settings' ? 'is-active' : ''}`}
          onClick={onToggleSettings}
          title={`Settings (${settingsShortcut})`}
        >
          ⚙
        </button>
      </div>

      {/* Connection manager modal */}
      <ConnectionManagerModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        checkHealth={checkServerHealth}
      />
    </header>
  );
}
