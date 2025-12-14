import { parseAgentSlug, isWorkspaceAgent } from '../utils/agentResolver';
import './AgentBadge.css';

interface AgentBadgeProps {
  agentSlug: string;
  size?: 'sm' | 'md';
}

export function AgentBadge({ agentSlug, size = 'md' }: AgentBadgeProps) {
  if (!agentSlug) return null;
  
  const { namespace, name } = parseAgentSlug(agentSlug);
  const isWorkspace = isWorkspaceAgent(agentSlug);

  return (
    <span 
      className={`agent-badge agent-badge--${size} ${isWorkspace ? 'agent-badge--workspace' : 'agent-badge--global'}`}
      title={isWorkspace ? `Workspace: ${namespace}` : 'Global agent'}
    >
      {isWorkspace && <span className="agent-badge__namespace">{namespace}</span>}
      <span className="agent-badge__name">{name}</span>
    </span>
  );
}
