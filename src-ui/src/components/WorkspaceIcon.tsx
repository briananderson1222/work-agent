import { getWorkspaceIcon, getWorkspaceIconStyle } from '../utils/workspace';

interface WorkspaceIconProps {
  workspace: { name: string; icon?: string };
  size?: number;
  style?: React.CSSProperties;
}

export function WorkspaceIcon({
  workspace,
  size = 24,
  style,
}: WorkspaceIconProps) {
  const icon = getWorkspaceIcon(workspace);
  const baseStyle = getWorkspaceIconStyle(workspace, size);

  return (
    <div
      style={{
        ...baseStyle,
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {icon.isUrl ? (
        <img
          src={icon.display}
          alt={workspace.name}
          width={size}
          height={size}
          style={{ borderRadius: 'inherit', objectFit: 'cover' }}
        />
      ) : (
        icon.display
      )}
    </div>
  );
}
