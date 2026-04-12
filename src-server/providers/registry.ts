/**
 * Provider registry — generic workspace-scoped store with backward-compat wrappers
 */

import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type { ProviderAdapterShape } from './adapter-shape.js';
import {
  DefaultAgentRegistryProvider,
  DefaultAuthProvider,
  DefaultBrandingProvider,
  DefaultIntegrationRegistryProvider,
  DefaultSettingsProvider,
  DefaultUserDirectoryProvider,
  DefaultUserIdentityProvider,
} from './defaults.js';
import { createIntegrationRegistryProvider } from './integration-registry-provider.js';
import type {
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  IIntegrationRegistryProvider,
  INotificationProvider,
  IPluginRegistryProvider,
  IProviderAdapterRegistry,
  ISettingsProvider,
  ISkillRegistryProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
} from './provider-interfaces.js';

// ── Generic Store ──────────────────────────────────────

interface ProviderEntry {
  provider: any;
  source: string;
  builtin: boolean;
}

// type -> workspace -> entry  (workspace '*' = global)
const store = new Map<string, Map<string, ProviderEntry>>();

// additive types store arrays
const additiveStore = new Map<string, ProviderEntry[]>();

export function registerProvider(
  type: string,
  provider: any,
  opts?: { layout?: string; source?: string; builtin?: boolean },
): void {
  const ws = opts?.layout ?? '*';
  const source = opts?.source ?? 'unknown';
  const builtin = opts?.builtin ?? false;
  // For additive types, push to array
  if (
    type === 'pluginRegistry' ||
    type === 'agentRegistry' ||
    type === 'integrationRegistry' ||
    type === 'notification' ||
    type === 'skillRegistry' ||
    type === 'providerAdapter'
  ) {
    if (!additiveStore.has(type)) additiveStore.set(type, []);
    additiveStore.get(type)!.push({ provider, source, builtin });
    return;
  }
  // Singleton types
  if (!store.has(type)) store.set(type, new Map());
  store.get(type)!.set(ws, { provider, source, builtin });
}

export function getProvider<T>(type: string, layout?: string): T | null {
  const typeMap = store.get(type);
  if (!typeMap) return null;
  if (layout) {
    const wsEntry = typeMap.get(layout);
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

/**
 * Clear plugin-provided entries only, preserving built-in registrations
 * (e.g. provider adapters registered during core initialization).
 */
export function clearPluginProviders(): void {
  store.clear();
  for (const [type, entries] of additiveStore) {
    const builtIn = entries.filter((entry) => entry.builtin);
    if (builtIn.length > 0) additiveStore.set(type, builtIn);
    else additiveStore.delete(type);
  }
}

// ── Provider Adapters ──────────────────────────────────

export function registerProviderAdapter(adapter: ProviderAdapterShape): void {
  const existing = additiveStore.get('providerAdapter') ?? [];
  additiveStore.set(
    'providerAdapter',
    existing.filter(
      (entry) =>
        (entry.provider as ProviderAdapterShape).provider !== adapter.provider,
    ),
  );
  registerProvider('providerAdapter', adapter, {
    source: adapter.provider,
    builtin: adapter.metadata.builtin ?? false,
  });
}

export function registerProviderAdapters(
  adapters: ProviderAdapterShape[],
): void {
  for (const adapter of adapters) {
    registerProviderAdapter(adapter);
  }
}

export function getProviderAdapters(): ProviderAdapterShape[] {
  return listProviders('providerAdapter').map(
    (entry) => entry.provider as ProviderAdapterShape,
  );
}

export function getProviderAdapter(
  provider: ProviderKind,
): ProviderAdapterShape | undefined {
  return getProviderAdapters().find((adapter) => adapter.provider === provider);
}

export function createProviderAdapterRegistry(): IProviderAdapterRegistry {
  return {
    register(adapter) {
      registerProviderAdapter(adapter);
    },
    get(provider) {
      return getProviderAdapter(provider);
    },
    list() {
      return getProviderAdapters();
    },
  };
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
  return (
    getProvider<IUserIdentityProvider>('userIdentity') ??
    new DefaultUserIdentityProvider()
  );
}

// ── User Directory ─────────────────────────────────────

export function registerUserDirectoryProvider(
  provider: IUserDirectoryProvider,
) {
  registerProvider('userDirectory', provider);
}

export function getUserDirectoryProvider(): IUserDirectoryProvider {
  return (
    getProvider<IUserDirectoryProvider>('userDirectory') ??
    new DefaultUserDirectoryProvider()
  );
}

// ── Agent Registry ─────────────────────────────────────

export function registerAgentRegistryProvider(
  provider: IAgentRegistryProvider,
) {
  registerProvider('agentRegistry', provider);
}

export function getAgentRegistryProvider(): IAgentRegistryProvider {
  const entries = listProviders('agentRegistry');
  return entries.length > 0
    ? (entries[0].provider as IAgentRegistryProvider)
    : new DefaultAgentRegistryProvider();
}

// ── Tool Registry ──────────────────────────────────────

export function registerIntegrationRegistryProvider(
  provider: IIntegrationRegistryProvider,
) {
  registerProvider('integrationRegistry', provider);
}

export function getIntegrationRegistryProvider(): IIntegrationRegistryProvider {
  const entries = listProviders('integrationRegistry');
  if (entries.length === 0) return new DefaultIntegrationRegistryProvider();
  const providers = entries.map(
    (entry) => entry.provider as IIntegrationRegistryProvider,
  );
  return createIntegrationRegistryProvider(providers);
}

// ── Skill Registry ─────────────────────────────────────

export function registerSkillRegistryProvider(
  provider: ISkillRegistryProvider,
) {
  registerProvider('skillRegistry', provider);
}

export function getSkillRegistryProvider(): ISkillRegistryProvider | null {
  const entries = listProviders('skillRegistry');
  return entries.length > 0
    ? (entries[0].provider as ISkillRegistryProvider)
    : null;
}

export function getSkillRegistryProviders(): {
  provider: ISkillRegistryProvider;
  source: string;
}[] {
  return listProviders('skillRegistry') as {
    provider: ISkillRegistryProvider;
    source: string;
  }[];
}

// ── Plugin Registry ────────────────────────────────────

export function registerPluginRegistryProvider(
  provider: IPluginRegistryProvider,
  source = 'Core',
): void {
  registerProvider('pluginRegistry', provider, { source });
}

export function getPluginRegistryProviders(): {
  provider: IPluginRegistryProvider;
  source: string;
}[] {
  return listProviders('pluginRegistry') as {
    provider: IPluginRegistryProvider;
    source: string;
  }[];
}

// ── Cross-Provider Prerequisites ───────────────────────

export async function getAllPrerequisites(): Promise<
  Array<import('@stallion-ai/contracts/tool').Prerequisite & { source: string }>
> {
  const results: Array<
    import('@stallion-ai/contracts/tool').Prerequisite & { source: string }
  > = [];

  // Walk singleton providers
  for (const [, wsMap] of store) {
    for (const [, entry] of wsMap) {
      if (typeof entry.provider?.getPrerequisites === 'function') {
        try {
          const items = await entry.provider.getPrerequisites();
          results.push(
            ...items.map((p: any) => ({ ...p, source: entry.source })),
          );
        } catch {}
      }
    }
  }

  // Walk additive providers
  for (const [, entries] of additiveStore) {
    for (const entry of entries) {
      if (typeof entry.provider?.getPrerequisites === 'function') {
        try {
          const items = await entry.provider.getPrerequisites();
          results.push(
            ...items.map((p: any) => ({ ...p, source: entry.source })),
          );
        } catch {}
      }
    }
  }

  return results;
}

// ── Branding ───────────────────────────────────────────

export function registerBrandingProvider(provider: IBrandingProvider) {
  registerProvider('branding', provider);
}

export function getBrandingProvider(): IBrandingProvider {
  return (
    getProvider<IBrandingProvider>('branding') ?? new DefaultBrandingProvider()
  );
}

// ── Settings ───────────────────────────────────────────

export function registerSettingsProvider(provider: ISettingsProvider) {
  registerProvider('settings', provider);
}

export function getSettingsProvider(): ISettingsProvider {
  return (
    getProvider<ISettingsProvider>('settings') ?? new DefaultSettingsProvider()
  );
}

// ── Notification ────────────────────────────────────────

export function registerNotificationProvider(
  provider: INotificationProvider,
  source = 'Core',
): void {
  registerProvider('notification', provider, { source });
}

export function getNotificationProviders(): {
  provider: INotificationProvider;
  source: string;
}[] {
  return listProviders('notification') as {
    provider: INotificationProvider;
    source: string;
  }[];
}
