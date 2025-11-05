import type { AgentSummary, AgentQuickPrompt, WorkspaceConfig, WorkspaceTab } from '../types';
import { ProjectStallionDashboard } from './ProjectStallionDashboard';
import { CodeReviewDashboard } from './CodeReviewDashboard';
import { DocumentationDashboard } from './DocumentationDashboard';
import { DevOpsDashboard } from './DevOpsDashboard';
import { ResearchWorkspace } from './ResearchWorkspace';
import SADashboard from '../plugins/sa-dashboard/index';
import SFDCAccountManager from '../plugins/sfdc-account-manager/index';

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

export type AgentWorkspaceComponent = (props: AgentWorkspaceProps) => JSX.Element;

const registry: Record<string, AgentWorkspaceComponent> = {
  'project-stallion-dashboard': ProjectStallionDashboard,
  'code-review-dashboard': CodeReviewDashboard,
  'documentation-dashboard': DocumentationDashboard,
  'devops-dashboard': DevOpsDashboard,
  'research-workspace': ResearchWorkspace,
  'sa-dashboard': SADashboard,
  'sfdc-account-manager': SFDCAccountManager,
};

const DefaultWorkspace: AgentWorkspaceComponent = ({ workspace, onShowChat }) => (
  <div className="workspace-default">
    <h2>{workspace?.name || 'Workspace'}</h2>
    <p>This workspace does not define a custom component yet.</p>
    <button type="button" className="workspace-dashboard__action" onClick={() => onShowChat?.()}>
      Open Chat Dock
    </button>
  </div>
);

export function resolveWorkspaceComponent(componentId?: string): AgentWorkspaceComponent {
  if (componentId && registry[componentId]) {
    return registry[componentId];
  }
  return DefaultWorkspace;
}

interface WorkspaceRendererProps extends AgentWorkspaceProps {
  componentId?: string;
}

export function WorkspaceRenderer({ componentId, ...props }: WorkspaceRendererProps) {
  const Component = resolveWorkspaceComponent(componentId);
  return <Component {...props} />;
}
