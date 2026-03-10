import { getAgentIcon, getAgentIconStyle } from '../utils/layout';

interface AgentIconProps {
  agent: { name: string; icon?: string };
  size?: 'small' | 'medium' | 'large' | number;
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_MAP = { small: 24, medium: 32, large: 48 };

export function AgentIcon({
  agent,
  size = 'medium',
  className,
  style,
}: AgentIconProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const iconInfo = getAgentIcon(agent);
  const baseStyle = getAgentIconStyle(agent, px);

  return (
    <div
      className={className}
      style={{ ...baseStyle, overflow: 'hidden', ...style }}
    >
      {iconInfo.isUrl ? (
        <img
          src={iconInfo.display}
          alt={agent.name}
          width={px}
          height={px}
          style={{ borderRadius: 'inherit', objectFit: 'cover' }}
        />
      ) : (
        iconInfo.display
      )}
    </div>
  );
}
