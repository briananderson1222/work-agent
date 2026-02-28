/**
 * Workspace Provider System
 *
 * Manages provider registration and resolution for workspaces.
 * Providers are resolved workspace-first, then global fallback.
 */

// Provider metadata (from package.json stallionProvider field)
export interface ProviderMetadata {
  workspace: string; // workspace slug, or '*' for global
  type: string; // provider type (e.g., 'calendar', 'crm')
}

interface ProviderEntry {
  id: string;
  metadata: ProviderMetadata;
  factory: () => any;
}

// Registry: workspace -> type -> providers
const registry = new Map<string, Map<string, Map<string, ProviderEntry>>>();

// Active providers: workspace -> type -> { id, instance }
const active = new Map<string, Map<string, { id: string; instance: any }>>();

// User config: workspace -> type -> providerId
const config = new Map<string, Map<string, string>>();

/** Register a provider */
export function registerProvider(
  id: string,
  metadata: ProviderMetadata,
  factory: () => any,
) {
  const { workspace, type } = metadata;

  if (!registry.has(workspace)) {
    registry.set(workspace, new Map());
  }
  const wsRegistry = registry.get(workspace)!;

  if (!wsRegistry.has(type)) {
    wsRegistry.set(type, new Map());
  }
  wsRegistry.get(type)!.set(id, { id, metadata, factory });
}

/** Configure which provider to use for a workspace + type */
export function configureProvider(
  workspace: string,
  type: string,
  providerId: string,
) {
  if (!config.has(workspace)) {
    config.set(workspace, new Map());
  }
  config.get(workspace)!.set(type, providerId);

  // Clear active instance so it gets re-resolved
  active.get(workspace)?.delete(type);
}

/** Get provider configuration for a workspace */
export function getProviderConfig(workspace: string): Record<string, string> {
  const wsConfig = config.get(workspace);
  if (!wsConfig) return {};
  return Object.fromEntries(wsConfig.entries());
}

/** Set provider configuration for a workspace (bulk) */
export function setProviderConfig(
  workspace: string,
  cfg: Record<string, string>,
) {
  config.set(workspace, new Map(Object.entries(cfg)));
  // Clear active instances
  active.delete(workspace);
}

/** Find provider entry - workspace first, then global */
function findProvider(
  workspace: string,
  type: string,
  providerId: string,
): ProviderEntry | null {
  // Check workspace-specific
  const wsEntry = registry.get(workspace)?.get(type)?.get(providerId);
  if (wsEntry) return wsEntry;

  // Check global (workspace: '*')
  const globalEntry = registry.get('*')?.get(type)?.get(providerId);
  if (globalEntry) return globalEntry;

  return null;
}

/** Get active provider instance for a workspace + type */
export function getProvider<T = any>(workspace: string, type: string): T {
  // Check if already instantiated
  const wsActive = active.get(workspace);
  if (wsActive?.has(type)) {
    return wsActive.get(type)!.instance as T;
  }

  // Get configured provider ID
  const providerId = config.get(workspace)?.get(type);
  if (!providerId) {
    throw new Error(
      `No provider configured for workspace '${workspace}' type '${type}'`,
    );
  }

  // Find and instantiate
  const entry = findProvider(workspace, type, providerId);
  if (!entry) {
    throw new Error(
      `Provider '${providerId}' not found for workspace '${workspace}' type '${type}'`,
    );
  }

  const instance = entry.factory();

  // Cache instance
  if (!active.has(workspace)) {
    active.set(workspace, new Map());
  }
  active.get(workspace)!.set(type, { id: providerId, instance });

  return instance as T;
}

/** Check if provider is configured and available */
export function hasProvider(workspace: string, type: string): boolean {
  const providerId = config.get(workspace)?.get(type);
  if (!providerId) return false;
  return !!findProvider(workspace, type, providerId);
}

/** List available providers for a workspace + type (workspace-specific + global) */
export function getAvailableProviders(
  workspace: string,
  type: string,
): string[] {
  const ids = new Set<string>();

  // Workspace-specific
  registry
    .get(workspace)
    ?.get(type)
    ?.forEach((_, id) => ids.add(id));

  // Global
  registry
    .get('*')
    ?.get(type)
    ?.forEach((_, id) => ids.add(id));

  return Array.from(ids);
}

/** Get active provider ID for a workspace + type */
export function getActiveProviderId(
  workspace: string,
  type: string,
): string | null {
  return active.get(workspace)?.get(type)?.id ?? null;
}
