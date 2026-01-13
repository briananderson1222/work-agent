/**
 * Workspace Provider Hook - Thin wrapper for plugins to access providers
 * 
 * The actual provider registry lives in core app. This just exposes
 * the interface plugins need.
 */

// These will be injected by core app via _setProviderFunctions
let _getProvider: <T>(workspace: string, type: string) => T;
let _hasProvider: (workspace: string, type: string) => boolean;
let _getActiveProviderId: (workspace: string, type: string) => string | null;
let _registerProvider: (id: string, metadata: ProviderMetadata, factory: () => any) => void;
let _configureProvider: (workspace: string, type: string, providerId: string) => void;

export interface ProviderMetadata {
  workspace: string;
  type: string;
}

/** @internal Called by core app to inject provider functions */
export function _setProviderFunctions(fns: {
  getProvider: <T>(workspace: string, type: string) => T;
  hasProvider: (workspace: string, type: string) => boolean;
  getActiveProviderId: (workspace: string, type: string) => string | null;
  registerProvider: (id: string, metadata: ProviderMetadata, factory: () => any) => void;
  configureProvider: (workspace: string, type: string, providerId: string) => void;
}) {
  _getProvider = fns.getProvider;
  _hasProvider = fns.hasProvider;
  _getActiveProviderId = fns.getActiveProviderId;
  _registerProvider = fns.registerProvider;
  _configureProvider = fns.configureProvider;
}

/** Get a provider instance for a workspace */
export function getProvider<T = any>(workspace: string, type: string): T {
  if (!_getProvider) throw new Error('Provider system not initialized');
  return _getProvider<T>(workspace, type);
}

/** Check if a provider is configured */
export function hasProvider(workspace: string, type: string): boolean {
  if (!_hasProvider) return false;
  return _hasProvider(workspace, type);
}

/** Get the active provider ID */
export function getActiveProviderId(workspace: string, type: string): string | null {
  if (!_getActiveProviderId) return null;
  return _getActiveProviderId(workspace, type);
}

/** Register a provider (called by workspace plugins) */
export function registerProvider(id: string, metadata: ProviderMetadata, factory: () => any) {
  if (!_registerProvider) throw new Error('Provider system not initialized');
  _registerProvider(id, metadata, factory);
}

/** Configure which provider to use (called by workspace plugins for defaults) */
export function configureProvider(workspace: string, type: string, providerId: string) {
  if (!_configureProvider) throw new Error('Provider system not initialized');
  _configureProvider(workspace, type, providerId);
}
