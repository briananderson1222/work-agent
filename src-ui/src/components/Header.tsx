import { WorkspaceSelector } from './WorkspaceSelector';
import { TabNavigation } from './TabNavigation';
import { QuickActionsBar } from './QuickActionsBar';
import { ThemeToggle } from './ThemeToggle';
import type { NavigationView } from '../types';

interface HeaderProps {
  workspaces: any[];
  selectedWorkspace: any | null;
  activeTabId?: string;
  currentView?: NavigationView;
  onWorkspaceSelect: (slug: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (slug: string) => void;
  onToggleSettings: () => void;
  onTabChange?: (tabId: string) => void;
  onPromptSelect?: (prompt: any) => void;
}

export function Header({
  workspaces,
  selectedWorkspace,
  activeTabId,
  currentView,
  onWorkspaceSelect,
  onCreateWorkspace,
  onEditWorkspace,
  onToggleSettings,
  onTabChange,
  onPromptSelect,
}: HeaderProps) {
  const activeTab = selectedWorkspace?.tabs?.find((t: any) => t.id === activeTabId);
  const isWorkspaceView = currentView?.type === 'workspace';

  return (
    <header className="app-toolbar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', opacity: 0.7 }}>
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

      {selectedWorkspace && selectedWorkspace.tabs.length > 1 && (
        <TabNavigation
          tabs={selectedWorkspace.tabs}
          activeTabId={activeTabId || ''}
          onTabChange={onTabChange || (() => {})}
        />
      )}

      {isWorkspaceView && selectedWorkspace ? (
        <QuickActionsBar
          globalPrompts={selectedWorkspace.globalPrompts}
          localPrompts={activeTab?.prompts}
          onPromptSelect={onPromptSelect || (() => {})}
        />
      ) : (
        <div className="quick-actions quick-actions--placeholder" style={{ flex: 1 }} />
      )}

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
