import { useState } from 'react';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { getInitials } from '../utils/workspace';
import { WorkspaceIcon } from './WorkspaceIcon';
import { WorkspaceAutocomplete } from './WorkspaceAutocomplete';
import { NotificationHistory } from './NotificationHistory';
import type { NavigationView } from '../types';

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
  const userName = 'Default User';
  const userInitials = getInitials(userName);
  const [showWorkspaceAutocomplete, setShowWorkspaceAutocomplete] = useState(false);
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

  const handleWorkspaceButtonClick = () => {
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
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        onClick={() => onNavigate({ type: 'workspace' })}
      >
        <img src="/favicon.png" alt="" style={{ width: '20px', height: '20px' }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Project Stallion
        </div>
      </div>

      {/* Workspace indicator when in workspace view */}
      {currentView?.type === 'workspace' && selectedWorkspace && (
        <>
          <div className="header-divider" />
          <button
            type="button"
            className="button button--secondary"
            onClick={handleWorkspaceIndicatorClick}
            title={workspaces.length > 1 ? "Switch workspace" : selectedWorkspace.name}
            style={{ fontSize: '14px', padding: '6px 12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <WorkspaceIcon workspace={selectedWorkspace} size={24} />
            <span>{selectedWorkspace.name}</span>
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="header-nav">
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
            className={`header-nav-btn ${currentView?.type === 'integrations' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'integrations') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'integrations' });
              }
            }}
            title="Integrations"
          >
            Integrations
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'monitoring' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'monitoring') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'monitoring' });
              }
            }}
            title="Monitoring"
          >
            Monitoring
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'scheduler' ? 'is-active' : ''}`}
            onClick={() => {
              if (currentView?.type === 'scheduler') {
                onNavigate({ type: 'workspace' });
              } else {
                onNavigate({ type: 'scheduler' });
              }
            }}
            title="Scheduler"
          >
            Scheduler
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
            style={{ fontSize: '14px', padding: '6px 12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="button button--secondary app-toolbar__settings"
          onClick={onToggleSettings}
          title={`Settings (${settingsShortcut})`}
          style={{ fontSize: '14px', padding: '6px 12px', fontWeight: 600 }}
        >
          ⚙
        </button>
      </div>

      {/* Workspace autocomplete modal */}
      {showWorkspaceAutocomplete && (
        <div style={{
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
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '16px',
            minWidth: '400px',
            maxWidth: '600px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}>
            <input
              type="text"
              value={workspaceQuery}
              onChange={(e) => setWorkspaceQuery(e.target.value)}
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
            <WorkspaceAutocomplete
              query={workspaceQuery}
              workspaces={workspaces}
              currentWorkspace={selectedWorkspace?.slug}
              onSelect={handleWorkspaceSelect}
              onClose={() => {
                setShowWorkspaceAutocomplete(false);
                setWorkspaceQuery('');
              }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
