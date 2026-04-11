import type { LayoutDefinition } from '@stallion-ai/contracts/layout';

/**
 * Resolve agent name within workspace context
 * - If name contains ':', use as-is (explicit namespace)
 * - Otherwise, check workspace's available agents for matching short name
 * - Falls back to global agent if not found in workspace
 */
export function resolveAgentName(
  agentName: string,
  layout?: LayoutDefinition,
): string {
  // Already fully qualified
  if (agentName.includes(':')) {
    return agentName;
  }

  // Try to find in workspace's available agents
  if (layout?.availableAgents) {
    const match = (layout.availableAgents as string[]).find((a: string) =>
      a.endsWith(`:${agentName}`),
    );
    if (match) return match;
  }

  // Return as-is (global agent)
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
export function isLayoutAgent(slug: string): boolean {
  return slug.includes(':');
}

/**
 * Check if an agent slug belongs to an ACP connection.
 * Uses the agents list (which has `source` field) when available,
 * falls back to checking if slug contains a known ACP prefix pattern.
 */
export function isAcpAgent(
  slug: string,
  agents?: Array<{ slug: string; source?: string }>,
): boolean {
  if (agents) {
    const agent = agents.find((a) => a.slug === slug);
    if (agent) return agent.source === 'acp';
  }
  // No agents list — can't determine
  return false;
}

/**
 * Get the short display name for an ACP agent by stripping the connection prefix.
 * e.g., "kiro-dev" with prefix "kiro" → "dev"
 */
export function getAcpDisplayName(
  slug: string,
  agents?: Array<{ slug: string; source?: string; name?: string }>,
): string {
  const agent = agents?.find((a) => a.slug === slug);
  if (agent?.name) return agent.name;
  // Strip first segment (connection prefix) from slug
  const dash = slug.indexOf('-');
  return dash > 0 ? slug.substring(dash + 1) : slug;
}

/**
 * Get a short agent display name regardless of type.
 */
export function getAgentDisplayName(
  slug: string,
  agents?: Array<{ slug: string; source?: string; name?: string }>,
): string {
  const agent = agents?.find((a) => a.slug === slug);
  if (agent?.source === 'acp') return getAcpDisplayName(slug, agents);
  if (agent?.name) return agent.name;
  return slug.split(':').pop() || slug;
}
