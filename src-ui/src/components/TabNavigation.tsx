import type { WorkspaceTab } from '../types';

export interface TabNavigationProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

export function TabNavigation({ tabs, activeTabId, onTabChange }: TabNavigationProps) {
  if (tabs.length <= 1) return null;

  return (
    <div className="flex gap-1 border-b border-gray-700 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 flex items-center gap-2 transition-colors ${
            activeTabId === tab.id
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {tab.icon && <span>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
