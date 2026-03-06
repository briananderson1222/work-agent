import {
  ConnectionManagerModal,
  ConnectionStatusDot,
  useConnectionStatus,
  useConnections,
} from '@stallion-ai/connect';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { useBranding } from '../hooks/useBranding';
import type { NavigationView } from '../types';
import { getInitials } from '../utils/workspace';
import { NotificationHistory } from './NotificationHistory';
import { WorkspaceIcon } from './WorkspaceIcon';
import './chat.css';

function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`)
    .then((r) => r.ok)
    .catch(() => false);
}

interface HeaderProps {
  workspaces: any[];
  selectedWorkspace: any | null;
  currentView?: NavigationView;
  onWorkspaceSelect: (slug: string) => void;
  onCreateWorkspace?: () => void;
  onEditWorkspace?: (slug: string) => void;
  onToggleSettings: () => void;
  onNavigate: (view: NavigationView) => void;
}

export function Header({
  workspaces,
  selectedWorkspace,
  currentView,
  onWorkspaceSelect,
  onToggleSettings,
  onNavigate,
}: HeaderProps) {
  const settingsShortcut = useShortcutDisplay('app.settings');
  const { user: authUser } = useAuth();
  const { appName } = useBranding();
  const userName = authUser?.name || authUser?.alias || 'User';
  const userInitials = getInitials(userName);
  const [showWorkspaceAutocomplete, setShowWorkspaceAutocomplete] =
    useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const { activeConnection } = useConnections();
  const { status: connStatus } = useConnectionStatus({
    checkHealth: checkServerHealth,
    pollInterval: 15_000,
  });

  // Debug logging

  const handleWorkspaceIndicatorClick = () => {
    // If only one workspace, do nothing (already in it)
    if (workspaces.length === 1) {
      return;
    }

    // Otherwise show autocomplete to switch workspaces
    setWorkspaceQuery('');
    setShowWorkspaceAutocomplete(true);
  };

  const handleWorkspaceSelect = (workspace: any) => {
    onWorkspaceSelect(workspace.slug);
    setShowWorkspaceAutocomplete(false);
    setWorkspaceQuery('');
  };

  return (
    <header className="app-toolbar">
      <div
        className="app-toolbar__brand"
        onClick={() => onNavigate({ type: 'workspace' })}
      >
        <img src="/favicon.png" alt="" className="app-toolbar__logo" />
        <div className="app-toolbar__name">{appName}</div>
      </div>

      {/* Workspace indicator — always visible to prevent layout shift */}
      <div className="header-divider" />
      <button
        type="button"
        className="app-toolbar__workspace-btn"
        onClick={handleWorkspaceIndicatorClick}
        disabled={!selectedWorkspace || workspaces.length <= 1}
        title={
          !selectedWorkspace
            ? 'No workspace selected'
            : workspaces.length > 1
              ? 'Switch workspace'
              : selectedWorkspace.name
        }
      >
        {selectedWorkspace ? (
          <>
            <WorkspaceIcon workspace={selectedWorkspace} size={20} />
            <span>{selectedWorkspace.name}</span>
          </>
        ) : (
          <span>No Workspace</span>
        )}
      </button>

      <div className="app-toolbar__spacer" />

      <div className="app-toolbar__actions">
        <nav
          style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          className="header-nav"
        >
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'schedule' ? 'is-active' : ''}`}
            onClick={() =>
              onNavigate(
                currentView?.type === 'schedule'
                  ? { type: 'workspace' }
                  : { type: 'schedule' },
              )
            }
            title="Schedule"
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <button
            type="button"
            className={`header-nav-btn ${['manage', 'workspaces', 'agents', 'prompts', 'plugins'].includes(currentView?.type || '') ? 'is-active' : ''}`}
            onClick={() =>
              onNavigate(
                currentView?.type === 'manage'
                  ? { type: 'workspace' }
                  : { type: 'manage' },
              )
            }
            title="Manage"
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
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
        </nav>

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
              onNavigate({ type: 'workspace' });
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

      {/* Workspace autocomplete modal */}
      {showWorkspaceAutocomplete && (
        <div
          className="workspace-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowWorkspaceAutocomplete(false);
              setWorkspaceQuery('');
            }
          }}
        >
          <div className="workspace-modal">
            <input
              type="text"
              value={workspaceQuery}
              onChange={(e) => setWorkspaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowWorkspaceAutocomplete(false);
                  setWorkspaceQuery('');
                }
              }}
              placeholder="Search workspaces..."
              autoFocus
              className="workspace-modal__search"
            />
            <div className="workspace-modal__list">
              {workspaces
                .filter((w) => {
                  const q = (workspaceQuery || '').toLowerCase();
                  return (
                    w.name.toLowerCase().includes(q) ||
                    w.slug.toLowerCase().includes(q)
                  );
                })
                .map((ws: any) => (
                  <div
                    key={ws.slug}
                    onClick={() => handleWorkspaceSelect(ws)}
                    className={`workspace-modal__item ${selectedWorkspace?.slug === ws.slug ? 'is-active' : ''}`}
                  >
                    <WorkspaceIcon workspace={ws} size={32} />
                    <div className="workspace-modal__item-info">
                      <div className="workspace-modal__item-name">
                        <span>{ws.name}</span>
                        {ws.plugin && (
                          <span className="workspace-modal__pill workspace-modal__pill--plugin">
                            {ws.plugin}
                          </span>
                        )}
                        {selectedWorkspace?.slug === ws.slug && (
                          <span className="workspace-modal__pill workspace-modal__pill--active">
                            active
                          </span>
                        )}
                      </div>
                      {ws.description && (
                        <div className="workspace-modal__item-desc">
                          {ws.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {workspaces.filter((w) => {
                const q = (workspaceQuery || '').toLowerCase();
                return (
                  w.name.toLowerCase().includes(q) ||
                  w.slug.toLowerCase().includes(q)
                );
              }).length === 0 && (
                <div className="workspace-modal__empty">
                  No workspaces found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
