import type { WorkspaceTab } from '../types';
import '../plugins/shared/workspace.css';

export interface TabNavigationProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

export function TabNavigation({
  tabs,
  activeTabId,
  onTabChange,
}: TabNavigationProps) {
  if (tabs.length <= 1) return null;

  return (
    <div className="workspace-tabs">
      <div className="workspace-tabs__container">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`workspace-tabs__tab ${
              activeTabId === tab.id ? 'workspace-tabs__tab--active' : ''
            }`}
          >
            {tab.icon && (
              <span className="workspace-tabs__icon">{tab.icon}</span>
            )}
            <span className="workspace-tabs__label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
