import { log } from '@/utils/logger';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { pluginRegistry } from '../core/PluginRegistry';
import type {
  AgentQuickPrompt,
  AgentSummary,
  WorkspaceConfig,
  WorkspaceTab,
} from '../types';

export interface AgentWorkspaceProps {
  agent?: AgentSummary;
  workspace?: WorkspaceConfig;
  activeTab?: WorkspaceTab;
  onLaunchPrompt?: (prompt: AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

export type AgentWorkspaceComponent = (
  props: AgentWorkspaceProps,
) => JSX.Element;

// Core workspace components (not plugins)
const coreRegistry: Record<string, AgentWorkspaceComponent> = {};
const loggedComponents = new Set<string>();

const DefaultWorkspace: AgentWorkspaceComponent = ({
  workspace,
  onShowChat,
}) => (
  <div className="workspace-default">
    <h2>{workspace?.name || 'Workspace'}</h2>
    <p>This workspace does not define a custom component yet.</p>
    <button
      type="button"
      className="workspace-dashboard__action"
      onClick={() => onShowChat?.()}
    >
      Open Chat Dock
    </button>
  </div>
);

export function resolveWorkspaceComponent(
  componentId?: string,
): AgentWorkspaceComponent {
  if (!componentId) return DefaultWorkspace;

  // Check core components first
  if (coreRegistry[componentId]) {
    return coreRegistry[componentId];
  }

  // Check plugin registry as fallback
  const pluginComponent = pluginRegistry.getWorkspace(componentId);
  if (pluginComponent) {
    if (!loggedComponents.has(componentId)) {
      log.plugin(`Loaded workspace component: ${componentId}`);
      loggedComponents.add(componentId);
    }
    return pluginComponent as AgentWorkspaceComponent;
  }

  return DefaultWorkspace;
}

interface WorkspaceRendererProps extends AgentWorkspaceProps {
  componentId?: string;
  onRefresh?: () => void;
  loading?: boolean;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  refreshKey?: number;
}

export function WorkspaceRenderer({
  componentId,
  workspace,
  activeTab,
  onRefresh,
  loading,
  activeTabId,
  onTabChange,
  onLaunchPrompt,
  refreshKey = 0,
  ...props
}: WorkspaceRendererProps) {
  try {
    return (
      <>
        {workspace && (
          <WorkspaceHeader
            workspaceName={workspace.name}
            tabs={workspace.tabs?.map((tab) => ({
              id: tab.id,
              label: tab.label,
              icon: tab.icon,
            }))}
            activeTabId={activeTabId}
            onTabChange={onTabChange}
            workspacePrompts={workspace.globalPrompts}
            onWorkspacePromptSelect={onLaunchPrompt}
            title={activeTab?.label || workspace.name}
            description={workspace.description || ''}
            tabPrompts={activeTab?.prompts}
            onTabPromptSelect={onLaunchPrompt}
            onRefresh={onRefresh}
            loading={loading}
          />
        )}
        {workspace?.tabs
          ? // Only mount the active tab to avoid duplicate data fetching
            workspace.tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              if (!isActive) return null;
              const Component = resolveWorkspaceComponent(tab.component);
              return (
                <div key={tab.id} className="workspace-tab-content">
                  <Component
                    key={`${tab.id}-${refreshKey}`}
                    workspace={workspace}
                    activeTab={tab}
                    onLaunchPrompt={onLaunchPrompt}
                    {...props}
                  />
                </div>
              );
            })
          : // Fallback for workspaces without tabs
            (() => {
              const Component = resolveWorkspaceComponent(componentId);
              return (
                <Component
                  key={refreshKey}
                  workspace={workspace}
                  activeTab={activeTab}
                  onLaunchPrompt={onLaunchPrompt}
                  {...props}
                />
              );
            })()}
      </>
    );
  } catch (error) {
    log.api('Error rendering workspace:', error);
    return <div>Error loading workspace navigation</div>;
  }
}
