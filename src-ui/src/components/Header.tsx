import { WorkspaceSelector } from './WorkspaceSelector';
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
  return (
    <header className="app-toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src="/favicon.png" alt="" style={{ width: '20px', height: '20px' }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Project Stallion
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <WorkspaceSelector
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onSelect={onWorkspaceSelect}
          onCreateWorkspace={onCreateWorkspace}
          onEditWorkspace={onEditWorkspace}
          onSettings={onToggleSettings}
        />
        
        <div className="header-divider" />
        
        <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="header-nav">
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'agents' ? 'is-active' : ''}`}
            onClick={() => onNavigate('agents')}
            title="Agents"
          >
            Agents
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'workflows' ? 'is-active' : ''}`}
            onClick={() => onNavigate('workflows')}
            title="Prompts"
          >
            Prompts
          </button>
          <button
            type="button"
            className={`header-nav-btn ${currentView?.type === 'tools' ? 'is-active' : ''}`}
            onClick={() => onNavigate('tools')}
            title="Integrations"
          >
            Integrations
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
          className="button button--secondary app-toolbar__settings"
          onClick={onToggleSettings}
          title="Settings (⌘,)"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
