import type { LayoutDefinition } from '@stallion-ai/contracts/layout';

// Internal layout context (set by LayoutProvider)
let _currentLayout: LayoutDefinition | undefined;

/**
 * Set current layout context
 * @internal Called by LayoutProvider
 */
export function _setLayoutContext(layout: LayoutDefinition | undefined) {
  _currentLayout = layout;
}

/**
 * Resolve agent name within layout context
 * - If name contains ':', use as-is (explicit namespace)
 * - Otherwise, check current layout's available agents for matching short name
 * - Falls back to global agent if not found in layout
 */
export function resolveAgentName(
  agentName: string,
  layout?: LayoutDefinition,
): string {
  if (agentName.includes(':')) {
    return agentName;
  }

  // Use provided layout or fall back to current context
  const activeLayout = layout || _currentLayout;

  if (activeLayout?.availableAgents) {
    const match = activeLayout.availableAgents.find((a) =>
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
 * Check if agent is layout-scoped
 */
export function isLayoutAgent(slug: string): boolean {
  return slug.includes(':');
}
