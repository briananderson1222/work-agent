import { log } from '@/utils/logger';
import { FullScreenError } from '@stallion-ai/sdk';
import { LayoutHeader } from '../components/LayoutHeader';
import { pluginRegistry } from '../core/PluginRegistry';
import type {
  AgentQuickPrompt,
  AgentSummary,
  WorkspaceConfig,
  WorkspaceTab,
} from '../types';

export interface AgentLayoutProps {
  agent?: AgentSummary;
  workspace?: WorkspaceConfig;
  activeTab?: WorkspaceTab;
  onLaunchPrompt?: (prompt: AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

export type AgentLayoutComponent = (
  props: AgentLayoutProps,
) => JSX.Element;

// Core layout components (not plugins)
const coreRegistry: Record<string, AgentLayoutComponent> = {};
const loggedComponents = new Set<string>();

const DefaultLayout: AgentLayoutComponent = ({
  workspace,
  onShowChat,
}) => (
  <div className="workspace-default">
    <div className="workspace-default__empty">
      <svg className="workspace-default__icon" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="10" width="36" height="28" rx="4" />
        <path d="M6 18h36" />
        <circle cx="14" cy="14" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="14" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="26" cy="14" r="1.5" fill="currentColor" stroke="none" />
        <path d="M16 28l4-4 3 3 5-5 4 4" opacity="0.5" />
      </svg>
      <h3 className="workspace-default__title">{workspace?.name || 'Layout'}</h3>
      <p className="workspace-default__desc">Start a conversation or schedule an automated job to get things moving.</p>
      <div className="workspace-default__actions">
        <button
          type="button"
          className="workspace-default__btn"
          onClick={() => onShowChat?.()}
        >
          Open Chat
        </button>
      </div>
    </div>
  </div>
);

export function resolveLayoutComponent(
  componentId?: string,
): AgentLayoutComponent {
  if (!componentId) return DefaultLayout;

  // Check core components first
  if (coreRegistry[componentId]) {
    return coreRegistry[componentId];
  }

  // Check plugin registry as fallback
  const pluginComponent = pluginRegistry.getWorkspace(componentId);
  if (pluginComponent) {
    if (!loggedComponents.has(componentId)) {
      log.plugin(`Loaded layout component: ${componentId}`);
      loggedComponents.add(componentId);
    }
    return pluginComponent as AgentLayoutComponent;
  }

  return DefaultLayout;
}

interface LayoutRendererProps extends AgentLayoutProps {
  componentId?: string;
  onRefresh?: () => void;
  loading?: boolean;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  refreshKey?: number;
}

export function LayoutRenderer({
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
}: LayoutRendererProps) {
  try {
    return (
      <>
        {workspace && (
          <LayoutHeader
            layoutName={workspace.name}
            tabs={workspace.tabs?.map((tab) => ({
              id: tab.id,
              label: tab.label,
              icon: tab.icon,
            }))}
            activeTabId={activeTabId}
            onTabChange={onTabChange}
            layoutPrompts={workspace.globalPrompts}
            onLayoutPromptSelect={onLaunchPrompt}
            title={activeTab?.label || workspace.name}
            description={activeTab?.description || workspace.description || ''}
            tabActions={activeTab?.actions}
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
              const Component = resolveLayoutComponent(tab.component);
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
          : // Fallback for layouts without tabs
            (() => {
              const Component = resolveLayoutComponent(componentId);
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
    log.api('Error rendering layout:', error);
    return <FullScreenError title="Error loading layout" description="Something unexpected happened while rendering this layout." onRetry={() => window.location.reload()} />;
  }
}
