export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Returns true if the icon string is a URL/path that should be rendered as <img> */
export function isIconUrl(icon?: string): boolean {
  return !!icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/'));
}

type IconEntity = { name: string; icon?: string };

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function getIcon(entity: IconEntity): { display: string; isCustomIcon: boolean; isUrl: boolean } {
  if (entity.icon) {
    return {
      display: entity.icon,
      isCustomIcon: true,
      isUrl: isUrl(entity.icon),
    };
  }
  
  return {
    display: getInitials(entity.name),
    isCustomIcon: false,
    isUrl: false,
  };
}

function getIconStyle(entity: IconEntity, size: number = 48, variant: 'default' | 'user' = 'default') {
  const iconInfo = getIcon(entity);
  const baseStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: variant === 'user' ? '50%' : `${size / 4}px`,
    background: 'var(--accent-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: iconInfo.isCustomIcon ? `${size / 2}px` : `${size / 2.67}px`,
    fontWeight: 600,
    flexShrink: 0,
  };
  
  if (variant === 'user') {
    return {
      ...baseStyle,
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-primary)',
    };
  }
  
  return baseStyle;
}

export function getWorkspaceIcon(workspace: IconEntity) {
  return getIcon(workspace);
}

export function getWorkspaceIconStyle(workspace: IconEntity, size: number = 48) {
  return getIconStyle(workspace, size);
}

export function getAgentIcon(agent: IconEntity) {
  return getIcon(agent);
}

export function getAgentIconStyle(agent: IconEntity, size: number = 48) {
  return getIconStyle(agent, size);
}

export function getUserIconStyle(user: IconEntity, size: number = 20) {
  return getIconStyle(user, size, 'user');
}
