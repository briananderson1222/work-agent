import type { WorkspaceConfig } from './types';

// Internal workspace context (set by WorkspaceProvider)
let _currentWorkspace: WorkspaceConfig | undefined;

/**
 * Set current workspace context
 * @internal Called by WorkspaceProvider
 */
export function _setWorkspaceContext(workspace: WorkspaceConfig | undefined) {
  _currentWorkspace = workspace;
}

/**
 * Resolve agent name within workspace context
 * - If name contains ':', use as-is (explicit namespace)
 * - Otherwise, check current workspace's available agents for matching short name
 * - Falls back to global agent if not found in workspace
 */
export function resolveAgentName(
  agentName: string,
  workspace?: WorkspaceConfig,
): string {
  if (agentName.includes(':')) {
    return agentName;
  }

  // Use provided workspace or fall back to current context
  const activeWorkspace = workspace || _currentWorkspace;

  if (activeWorkspace?.availableAgents) {
    const match = activeWorkspace.availableAgents.find((a) =>
      a.endsWith(`:${agentName}`),
    );
    if (match) return match;
  }

  return agentName;
}

/**
 * Extract namespace and short name from agent slug
 */
export function parseAgentSlug(slug: string): {
  namespace?: string;
  name: string;
} {
  const parts = slug.split(':');
  if (parts.length === 2) {
    return { namespace: parts[0], name: parts[1] };
  }
  return { name: slug };
}

/**
 * Check if agent is workspace-scoped
 */
export function isWorkspaceAgent(slug: string): boolean {
  return slug.includes(':');
}
