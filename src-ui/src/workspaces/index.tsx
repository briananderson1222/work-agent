import type { AgentSummary, AgentQuickPrompt } from '../types';
import { WorkAgentDashboard } from './WorkAgentDashboard';
import { CodeReviewDashboard } from './CodeReviewDashboard';
import { DocumentationDashboard } from './DocumentationDashboard';
import { DevOpsDashboard } from './DevOpsDashboard';
import { ResearchWorkspace } from './ResearchWorkspace';
import { SADashboard } from './SADashboard';

export interface AgentWorkspaceProps {
  agent: AgentSummary;
  onLaunchPrompt?: (prompt: AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
}

export type AgentWorkspaceComponent = (props: AgentWorkspaceProps) => JSX.Element;

const registry: Record<string, AgentWorkspaceComponent> = {
  'work-agent-dashboard': WorkAgentDashboard,
  'code-review-dashboard': CodeReviewDashboard,
  'documentation-dashboard': DocumentationDashboard,
  'devops-dashboard': DevOpsDashboard,
  'research-workspace': ResearchWorkspace,
  'sa-dashboard': SADashboard,
};

const DefaultWorkspace: AgentWorkspaceComponent = ({ agent, onShowChat }) => (
  <div className="workspace-default">
    <h2>{agent.name}</h2>
    <p>This agent does not define a custom workspace component yet.</p>
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

export function WorkspaceRenderer(props: AgentWorkspaceProps) {
  const componentId = props.agent.ui?.component;
  console.log('WorkspaceRenderer:', { 
    agentSlug: props.agent.slug, 
    componentId, 
    hasComponent: componentId ? componentId in registry : false,
    ui: props.agent.ui 
  });
  const Component = resolveWorkspaceComponent(componentId);
  return <Component {...props} />;
}
