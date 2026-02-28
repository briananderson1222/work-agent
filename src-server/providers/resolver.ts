/**
 * Plugin provider resolution engine
 * Reads plugin manifests, applies user overrides, detects singleton conflicts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest, PluginOverrides } from '@work-agent/shared';
import { PROVIDER_TYPE_META } from './types.js';

export interface ResolvedEntry {
  pluginName: string;
  type: string;
  module: string;
  workspace?: string;
}

export interface ProviderConflict {
  type: string;
  workspace: string;
  candidates: string[];
}

export interface ResolvedProviders {
  resolved: ResolvedEntry[];
  conflicts: ProviderConflict[];
}

export function resolvePluginProviders(
  pluginsDir: string,
  overrides: PluginOverrides,
): ResolvedProviders {
  const resolved: ResolvedEntry[] = [];
  const conflicts: ProviderConflict[] = [];

  // Collect all provider entries from all plugins
  const byType = new Map<string, Map<string, ResolvedEntry[]>>(); // type -> workspace -> entries

  if (!existsSync(pluginsDir)) return { resolved, conflicts };

  const dirs = readdirSync(pluginsDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const manifestPath = join(pluginsDir, dir.name, 'plugin.json');
    if (!existsSync(manifestPath)) continue;

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      continue;
    }

    if (!manifest.providers?.length) continue;

    const pluginName = manifest.name || dir.name;
    const disabled = overrides[pluginName]?.disabled ?? [];

    for (const p of manifest.providers) {
      if (disabled.includes(p.type)) continue;

      const ws = p.workspace ?? '*';
      const entry: ResolvedEntry = {
        pluginName,
        type: p.type,
        module: p.module,
        workspace: p.workspace,
      };

      if (!byType.has(p.type)) byType.set(p.type, new Map());
      const wsMap = byType.get(p.type)!;
      if (!wsMap.has(ws)) wsMap.set(ws, []);
      wsMap.get(ws)!.push(entry);
    }
  }

  // Resolve: singletons with >1 candidate = conflict
  for (const [type, wsMap] of byType) {
    const cardinality = PROVIDER_TYPE_META[type] ?? 'singleton';

    for (const [ws, entries] of wsMap) {
      if (cardinality === 'additive') {
        resolved.push(...entries);
      } else if (entries.length === 1) {
        resolved.push(entries[0]);
      } else {
        conflicts.push({
          type,
          workspace: ws,
          candidates: entries.map((e) => e.pluginName),
        });
      }
    }
  }

  return { resolved, conflicts };
}