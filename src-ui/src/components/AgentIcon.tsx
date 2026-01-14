import { getAgentIcon } from '../utils/workspace';

interface AgentIconProps {
  agent: { name: string; icon?: string };
  size?: 'small' | 'medium' | 'large';
  className?: string;
  style?: React.CSSProperties;
}

export function AgentIcon({ agent, size = 'medium', className, style }: AgentIconProps) {
  const iconInfo = getAgentIcon(agent);
  
  const sizeMap = {
    small: { width: '24px', height: '24px', fontSize: '12px' },
    medium: { width: '32px', height: '32px', fontSize: '16px' },
    large: { width: '48px', height: '48px', fontSize: '24px' }
  };
  
  const dimensions = sizeMap[size];
  
  return (
    <div
      className={className}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: '8px',
        background: 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: agent.icon ? dimensions.fontSize : '14px',
        fontWeight: agent.icon ? 'normal' : 600,
        flexShrink: 0,
        color: agent.icon ? 'inherit' : 'var(--color-bg)',
        ...style
      }}
    >
      {agent.icon || iconInfo.display}
    </div>
  );
}
