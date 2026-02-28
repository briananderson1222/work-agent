import { getWorkspaceIcon } from '../utils/workspace';

interface WorkspaceIconProps {
  workspace: { name: string; icon?: string };
  size?: number;
}

export function WorkspaceIcon({ workspace, size = 24 }: WorkspaceIconProps) {
  const icon = getWorkspaceIcon(workspace);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: 'var(--color-primary)',
        color: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: icon.isCustomIcon ? `${size * 0.58}px` : `${size * 0.46}px`,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {icon.display}
    </div>
  );
}
