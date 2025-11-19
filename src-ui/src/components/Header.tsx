import { useState } from 'react';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { getInitials, getWorkspaceIcon } from '../utils/workspace';
import { WorkspaceAutocomplete } from './WorkspaceAutocomplete';
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
  const [workspaceQuery, setWorkspaceQuery] = useState('');

  // Debug logging
  console.log('Header:', { 
    viewType: currentView?.type, 
    workspace: selectedWorkspace,
    shouldShow: currentView?.type === 'workspace' && !!selectedWorkspace
  });

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
            <span>{getWorkspaceIcon(selectedWorkspace).display}</span>
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
            onClick={handleWorkspaceButtonClick}
            title="Workspaces"
          >
            Workspaces
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'agents' ? 'is-active' : ''}`}
            onClick={() => onNavigate({ type: 'agents' })}
            title="Agents"
          >
            Agents
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'prompts' ? 'is-active' : ''}`}
            onClick={() => onNavigate({ type: 'prompts' })}
            title="Prompts"
          >
            Prompts
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'integrations' ? 'is-active' : ''}`}
            onClick={() => onNavigate({ type: 'integrations' })}
            title="Integrations"
          >
            Integrations
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'monitoring' ? 'is-active' : ''}`}
            onClick={() => onNavigate({ type: 'monitoring' })}
            title="Monitoring"
          >
            Monitoring
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

        <button
          type="button"
          className={`button button--secondary ${currentView?.type === 'profile' ? 'is-active' : ''}`}
          onClick={() => onNavigate({ type: 'profile' })}
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
