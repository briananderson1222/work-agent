/**
 * Provider Registry - Type-safe provider registration and resolution
 */

import type { ProviderTypeMap, ProviderType } from './providerTypes';

type ProviderEntry<K extends ProviderType> = {
  id: string;
  factory: () => ProviderTypeMap[K];
};

const registry: { [K in ProviderType]?: Map<string, ProviderEntry<K>> } = {};
const active: { [K in ProviderType]?: { id: string; instance: ProviderTypeMap[K] } } = {};

/** Register a provider implementation */
export function registerProvider<K extends ProviderType>(
  type: K,
  id: string,
  factory: () => ProviderTypeMap[K]
) {
  if (!registry[type]) {
    registry[type] = new Map();
  }
  registry[type]!.set(id, { id, factory });
}

/** Set the active provider for a type */
export function setActiveProvider<K extends ProviderType>(type: K, id: string) {
  const entries = registry[type];
  if (!entries) throw new Error(`No providers registered for type '${type}'`);
  
  const entry = entries.get(id);
  if (!entry) throw new Error(`Provider '${id}' not found for type '${type}'`);
  
  active[type] = { id, instance: entry.factory() };
}

/** Get the active provider instance */
export function getProvider<K extends ProviderType>(type: K): ProviderTypeMap[K] {
  const a = active[type];
  if (!a) throw new Error(`No active provider for type '${type}'`);
  return a.instance as ProviderTypeMap[K];
}

/** Get active provider ID (for admin UI) */
export function getActiveProviderId<K extends ProviderType>(type: K): string | null {
  return active[type]?.id ?? null;
}

/** List registered provider IDs for a type (for admin UI) */
export function getRegisteredProviderIds<K extends ProviderType>(type: K): string[] {
  return Array.from(registry[type]?.keys() ?? []);
}

/** Check if a provider type has an active instance */
export function hasProvider<K extends ProviderType>(type: K): boolean {
  return !!active[type];
}
