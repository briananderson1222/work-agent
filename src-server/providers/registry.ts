/**
 * Provider registry — generic workspace-scoped store with backward-compat wrappers
 */

import {
  DefaultAgentRegistryProvider,
  DefaultAuthProvider,
  DefaultBrandingProvider,
  DefaultSettingsProvider,
  DefaultIntegrationRegistryProvider,
  DefaultUserDirectoryProvider,
  DefaultUserIdentityProvider,
} from './defaults.js';
import type {
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  IOnboardingProvider,
  ISettingsProvider,
  IIntegrationRegistryProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
} from './types.js';

// ── Generic Store ──────────────────────────────────────

interface ProviderEntry {
  provider: any;
  source: string;
}

// type -> workspace -> entry  (workspace '*' = global)
const store = new Map<string, Map<string, ProviderEntry>>();

// additive types store arrays
const additiveStore = new Map<string, ProviderEntry[]>();

export function registerProvider(
  type: string,
  provider: any,
  opts?: { layout?: string; source?: string },
): void {
  const ws = opts?.layout ?? '*';
  const source = opts?.source ?? 'unknown';
  // For additive types, push to array
  if (type === 'onboarding' || type === 'agentRegistry' || type === 'integrationRegistry') {
    if (!additiveStore.has(type)) additiveStore.set(type, []);
    additiveStore.get(type)!.push({ provider, source });
    return;
  }
  // Singleton types
  if (!store.has(type)) store.set(type, new Map());
  store.get(type)!.set(ws, { provider, source });
}

export function getProvider<T>(type: string, workspace?: string): T | null {
  const typeMap = store.get(type);
  if (!typeMap) return null;
  if (workspace) {
    const wsEntry = typeMap.get(workspace);
    if (wsEntry) return wsEntry.provider as T;
  }
  const globalEntry = typeMap.get('*');
  return globalEntry ? (globalEntry.provider as T) : null;
}

export function listProviders(type: string): ProviderEntry[] {
  // Check additive store first
  const additive = additiveStore.get(type);
  if (additive) return additive;
  // Singleton: collect all workspace entries
  const typeMap = store.get(type);
  if (!typeMap) return [];
  return Array.from(typeMap.values());
}

export function clearAll(): void {
  store.clear();
  additiveStore.clear();
}

// ── Auth ───────────────────────────────────────────────

export function registerAuthProvider(provider: IAuthProvider) {
  registerProvider('auth', provider);
}

export function getAuthProvider(): IAuthProvider {
  return getProvider<IAuthProvider>('auth') ?? new DefaultAuthProvider();
}

// ── User Identity ──────────────────────────────────────

export function registerUserIdentityProvider(provider: IUserIdentityProvider) {
  registerProvider('userIdentity', provider);
}

export function getUserIdentityProvider(): IUserIdentityProvider {
  return getProvider<IUserIdentityProvider>('userIdentity') ?? new DefaultUserIdentityProvider();
}

// ── User Directory ─────────────────────────────────────

export function registerUserDirectoryProvider(provider: IUserDirectoryProvider) {
  registerProvider('userDirectory', provider);
}

export function getUserDirectoryProvider(): IUserDirectoryProvider {
  return getProvider<IUserDirectoryProvider>('userDirectory') ?? new DefaultUserDirectoryProvider();
}

// ── Agent Registry ─────────────────────────────────────

export function registerAgentRegistryProvider(provider: IAgentRegistryProvider) {
  registerProvider('agentRegistry', provider);
}

export function getAgentRegistryProvider(): IAgentRegistryProvider {
  const entries = listProviders('agentRegistry');
  return entries.length > 0 ? (entries[0].provider as IAgentRegistryProvider) : new DefaultAgentRegistryProvider();
}

// ── Tool Registry ──────────────────────────────────────

export function registerIntegrationRegistryProvider(provider: IIntegrationRegistryProvider) {
  registerProvider('integrationRegistry', provider);
}

export function getIntegrationRegistryProvider(): IIntegrationRegistryProvider {
  const entries = listProviders('integrationRegistry');
  return entries.length > 0 ? (entries[0].provider as IIntegrationRegistryProvider) : new DefaultIntegrationRegistryProvider();
}

// ── Onboarding ─────────────────────────────────────────

export function registerOnboardingProvider(
  provider: IOnboardingProvider,
  source = 'Core',
): void {
  registerProvider('onboarding', provider, { source });
}

export function getOnboardingProviders(): { provider: IOnboardingProvider; source: string }[] {
  return listProviders('onboarding') as { provider: IOnboardingProvider; source: string }[];
}

// ── Branding ───────────────────────────────────────────

export function registerBrandingProvider(provider: IBrandingProvider) {
  registerProvider('branding', provider);
}

export function getBrandingProvider(): IBrandingProvider {
  return getProvider<IBrandingProvider>('branding') ?? new DefaultBrandingProvider();
}

// ── Settings ───────────────────────────────────────────

export function registerSettingsProvider(provider: ISettingsProvider) {
  registerProvider('settings', provider);
}

export function getSettingsProvider(): ISettingsProvider {
  return getProvider<ISettingsProvider>('settings') ?? new DefaultSettingsProvider();
}