import { parseAgentSlug, isWorkspaceAgent } from '../utils/agentResolver';
import './AgentBadge.css';

interface AgentBadgeProps {
  agentSlug: string;
  size?: 'sm' | 'md';
  source?: 'local' | 'acp';
}

export function AgentBadge({ agentSlug, size = 'md', source }: AgentBadgeProps) {
  if (!agentSlug) return null;
  
  const isAcp = source === 'acp';
  const { namespace, name } = parseAgentSlug(agentSlug);
  const isWorkspace = !isAcp && isWorkspaceAgent(agentSlug);

  // ACP agents: show "mode (connection)" format
  const displayName = isAcp ? name : name;
  const badgeClass = isAcp ? 'agent-badge--acp' : isWorkspace ? 'agent-badge--workspace' : 'agent-badge--global';
  const title = isAcp ? 'kiro-cli (ACP)' : isWorkspace ? `Workspace: ${namespace}` : 'Global agent';

  return (
    <span 
      className={`agent-badge agent-badge--${size} ${badgeClass}`}
      title={title}
    >
      {isAcp && <span className="agent-badge__namespace">kiro-cli</span>}
      {isWorkspace && <span className="agent-badge__namespace">{namespace}</span>}
      <span className="agent-badge__name">{displayName}</span>
    </span>
  );
}
