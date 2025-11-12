import { WorkspaceSelector } from './WorkspaceSelector';
import { ThemeToggle } from './ThemeToggle';
import type { NavigationView } from '../types';

interface HeaderProps {
  workspaces: any[];
  selectedWorkspace: any | null;
  currentView?: NavigationView;
  onWorkspaceSelect: (slug: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (slug: string) => void;
  onToggleSettings: () => void;
}

export function Header({
  workspaces,
  selectedWorkspace,
  currentView,
  onWorkspaceSelect,
  onCreateWorkspace,
  onEditWorkspace,
  onToggleSettings,
}: HeaderProps) {
  return (
    <header className="app-toolbar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img src="/favicon.png" alt="" style={{ width: '16px', height: '16px' }} />
          Project Stallion
        </div>
        <WorkspaceSelector
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onSelect={onWorkspaceSelect}
          onCreateWorkspace={onCreateWorkspace}
          onEditWorkspace={onEditWorkspace}
          onSettings={onToggleSettings}
        />
      </div>

      <div className="quick-actions quick-actions--placeholder" style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <ThemeToggle />
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
