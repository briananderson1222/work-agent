/**
 * Provider registry — generic workspace-scoped store with backward-compat wrappers
 */

import {
  DefaultAgentRegistryProvider,
  DefaultAuthProvider,
  DefaultBrandingProvider,
  DefaultIntegrationRegistryProvider,
  DefaultSettingsProvider,
  DefaultUserDirectoryProvider,
  DefaultUserIdentityProvider,
} from './defaults.js';
import type {
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  IIntegrationRegistryProvider,
  IOnboardingProvider,
  ISettingsProvider,
  ISkillRegistryProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
} from './types.js';
import { resolveHomeDir } from '../utils/paths.js';

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
  if (
    type === 'onboarding' ||
    type === 'agentRegistry' ||
    type === 'integrationRegistry' ||
    type === 'notification' ||
    type === 'skillRegistry'
  ) {
    if (!additiveStore.has(type)) additiveStore.set(type, []);
    additiveStore.get(type)!.push({ provider, source });
    return;
  }
  // Singleton types
  if (!store.has(type)) store.set(type, new Map());
  store.get(type)!.set(ws, { provider, source });
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
    (e) => e.provider as IIntegrationRegistryProvider,
  );

  // Scan on-disk integrations (plugin-bundled + manually added)
  function readDiskIntegrations(): import('@stallion-ai/shared').RegistryItem[] {
    const { existsSync, readdirSync, readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const dir = join(
      resolveHomeDir(),
      'integrations',
    );
    if (!existsSync(dir)) return [];
    const items: import('@stallion-ai/shared').RegistryItem[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const defPath = join(dir, entry.name, 'integration.json');
      if (!existsSync(defPath)) continue;
      try {
        const def = JSON.parse(readFileSync(defPath, 'utf-8'));
        let commandExists = false;
        if (def.command) {
          try {
            require('node:child_process').execSync(`which ${def.command}`, { stdio: 'pipe' });
            commandExists = true;
          } catch {}
        }
        items.push({
          id: def.id || entry.name,
          displayName: def.displayName || entry.name,
          description: def.description || '',
          installed: true,
          status: commandExists ? 'connected' : 'missing binary',
        });
      } catch {}
    }
    return items;
  }

  return {
    async listAvailable() {
      const results = await Promise.all(
        entries.map(async (e) => {
          const items = await (
            e.provider as IIntegrationRegistryProvider
          ).listAvailable();
          return items.map((item) => ({ ...item, source: e.source }));
        }),
      );
      // Merge disk integrations first (they take priority as "installed")
      const diskItems = readDiskIntegrations();
      const seen = new Set<string>();
      const merged: import('@stallion-ai/shared').RegistryItem[] = [];
      for (const item of diskItems) {
        if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
      }
      for (const item of results.flat()) {
        if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
      }
      return merged;
    },
    async listInstalled() {
      const results = await Promise.all(
        providers.map((p) => p.listInstalled()),
      );
      const diskItems = readDiskIntegrations();
      const seen = new Set<string>();
      const merged: import('@stallion-ai/shared').RegistryItem[] = [];
      for (const item of diskItems) {
        if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
      }
      for (const item of results.flat()) {
        if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
      }
      return merged;
    },
    async install(id) {
      for (const p of providers) {
        const result = await p.install(id);
        if (result.success) return result;
      }
      return { success: false, message: `No provider could install ${id}` };
    },
    async uninstall(id) {
      for (const p of providers) {
        const result = await p.uninstall(id);
        if (result.success) return result;
      }
      return { success: false, message: `No provider could uninstall ${id}` };
    },
    async getToolDef(id) {
      for (const p of providers) {
        const def = await p.getToolDef(id);
        if (def) return def;
      }
      return null;
    },
    async sync() {
      await Promise.all(providers.map((p) => p.sync()));
    },
    async installByCommand(command) {
      for (const p of providers) {
        if (p.installByCommand) {
          const result = await p.installByCommand(command);
          if (result.success) return result;
        }
      }
      return {
        success: false,
        message: `No provider could install command ${command}`,
      };
    },
  };
}

// ── Skill Registry ─────────────────────────────────────

export function registerSkillRegistryProvider(
  provider: ISkillRegistryProvider,
) {
  registerProvider('skillRegistry', provider);
}

export function getSkillRegistryProvider(): ISkillRegistryProvider | null {
  const entries = listProviders('skillRegistry');
  return entries.length > 0 ? (entries[0].provider as ISkillRegistryProvider) : null;
}

// ── Onboarding ─────────────────────────────────────────

export function registerOnboardingProvider(
  provider: IOnboardingProvider,
  source = 'Core',
): void {
  registerProvider('onboarding', provider, { source });
}

export function getOnboardingProviders(): {
  provider: IOnboardingProvider;
  source: string;
}[] {
  return listProviders('onboarding') as {
    provider: IOnboardingProvider;
    source: string;
  }[];
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

import type { INotificationProvider } from './types.js';

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
