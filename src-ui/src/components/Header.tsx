import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { useBranding } from '../hooks/useBranding';
import type { NavigationView } from '../types';
import { getInitials } from '../utils/workspace';
import { NotificationHistory } from './NotificationHistory';
import { WorkspaceIcon } from './WorkspaceIcon';

interface HeaderProps {
  workspaces: any[];
  selectedWorkspace: any | null;
  currentView?: NavigationView;
  onWorkspaceSelect: (slug: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (slug: string) => void;
  onToggleSettings: () => void;
  onNavigate: (view: NavigationView) => void;
}

export function Header({
  workspaces,
  selectedWorkspace,
  currentView,
  onWorkspaceSelect,
  onCreateWorkspace,
  onEditWorkspace,
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

  const _handleWorkspaceButtonClick = () => {
    // Navigate to workspaces management page
    onNavigate({ type: 'workspaces' });
  };

  const handleWorkspaceSelect = (workspace: any) => {
    onWorkspaceSelect(workspace.slug);
    setShowWorkspaceAutocomplete(false);
    setWorkspaceQuery('');
  };

  return (
    <header className="app-toolbar">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
        }}
        onClick={() => onNavigate({ type: 'workspace' })}
      >
        <img
          src="/favicon.png"
          alt=""
          style={{ width: '20px', height: '20px' }}
        />
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {appName}
        </div>
      </div>

      {/* Workspace indicator — always visible to prevent layout shift */}
      <div className="header-divider" />
      <button
        type="button"
        className="button button--secondary"
        onClick={handleWorkspaceIndicatorClick}
        disabled={!selectedWorkspace || workspaces.length <= 1}
        title={
          !selectedWorkspace
            ? 'No workspace selected'
            : workspaces.length > 1
              ? 'Switch workspace'
              : selectedWorkspace.name
        }
        style={{
          fontSize: '14px',
          padding: '4px 10px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: selectedWorkspace ? 1 : 0.4,
        }}
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

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <nav
          style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          className="header-nav"
        >
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'workspaces' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'workspaces') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'workspaces' });
              }
            }}
            title="Workspaces"
          >
            Workspaces
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'agents' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'agents') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'agents' });
              }
            }}
            title="Agents"
          >
            Agents
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'prompts' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'prompts') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'prompts' });
              }
            }}
            title="Prompts"
          >
            Prompts
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'plugins' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'plugins') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'plugins' });
              }
            }}
            title="Plugins"
          >
            Plugins
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'schedule' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'schedule') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'schedule' });
              }
            }}
            title="Schedule"
          >
            Schedule
          </button>
        </nav>

        <button
          type="button"
          className="header-hamburger"
          style={{ display: 'none' }}
          onClick={() => {
            const nav = document.querySelector('.header-nav');
            nav?.classList.toggle('header-nav--open');
          }}
        >
          ☰
        </button>

        <div className="header-divider" />

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            style={{
              fontSize: '14px',
              padding: '6px 12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
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
          className={`button button--secondary ${currentView?.type === 'profile' ? 'is-active' : ''}`}
          onClick={() => {
            if (currentView?.type === 'profile') {
              onNavigate({ type: 'workspace' });
            } else {
              onNavigate({ type: 'profile' });
            }
          }}
          title="Profile"
          style={{ fontSize: '14px', padding: '6px 12px', fontWeight: 600 }}
        >
          {userInitials}
        </button>

        <button
          type="button"
          className={`button button--secondary app-toolbar__settings ${currentView?.type === 'settings' ? 'is-active' : ''}`}
          onClick={onToggleSettings}
          title={`Settings (${settingsShortcut})`}
          style={{ fontSize: '14px', padding: '6px 12px', fontWeight: 600 }}
        >
          ⚙
        </button>
      </div>

      {/* Workspace autocomplete modal */}
      {showWorkspaceAutocomplete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowWorkspaceAutocomplete(false);
              setWorkspaceQuery('');
            }
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              padding: '16px',
              minWidth: '400px',
              maxWidth: '600px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            }}
          >
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
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background:
                        selectedWorkspace?.slug === ws.slug
                          ? 'var(--bg-hover)'
                          : 'transparent',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--bg-hover)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        selectedWorkspace?.slug === ws.slug
                          ? 'var(--bg-hover)'
                          : 'transparent')
                    }
                  >
                    <WorkspaceIcon workspace={ws} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{ws.name}</span>
                        {ws.plugin && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              fontWeight: 500,
                              border: '1px solid var(--border-primary)',
                            }}
                          >
                            {ws.plugin}
                          </span>
                        )}
                        {selectedWorkspace?.slug === ws.slug && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'var(--accent-primary)',
                              color: 'white',
                              fontWeight: 500,
                            }}
                          >
                            active
                          </span>
                        )}
                      </div>
                      {ws.description && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
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
                <div
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                  }}
                >
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
