export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function getWorkspaceIcon(workspace: { name: string; icon?: string }): {
  display: string;
  isCustomIcon: boolean;
} {
  if (workspace.icon) {
    return {
      display: workspace.icon,
      isCustomIcon: true,
    };
  }
  
  return {
    display: getInitials(workspace.name),
    isCustomIcon: false,
  };
}

export function getAgentIcon(agent: { name: string; icon?: string }): {
  display: string;
  isCustomIcon: boolean;
} {
  if (agent.icon) {
    return {
      display: agent.icon,
      isCustomIcon: true,
    };
  }
  
  return {
    display: getInitials(agent.name),
    isCustomIcon: false,
  };
}
