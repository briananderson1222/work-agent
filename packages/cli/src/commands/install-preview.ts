import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import {
  AGENTS_DIR,
  extractPluginName,
  lookupDepInRegistries,
  PLUGINS_DIR,
  readManifest,
} from './helpers.js';
import { preparePluginSource } from './install-source.js';

function findInstalledLayoutProvider(layoutSlug: string, pluginName: string) {
  if (!existsSync(PLUGINS_DIR)) return null;

  for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const installed = readManifest(join(PLUGINS_DIR, entry.name));
      if (
        installed.name !== pluginName &&
        installed.layout?.slug === layoutSlug
      ) {
        return installed.name;
      }
    } catch {}
  }

  return null;
}

function getPluginConflicts(manifest: PluginManifest) {
  const conflicts: Array<{ type: string; id: string }> = [];

  for (const agent of manifest.agents || []) {
    const slug = `${manifest.name}:${agent.slug}`;
    if (existsSync(join(AGENTS_DIR, slug, 'agent.json'))) {
      conflicts.push({ type: 'agent', id: slug });
    }
  }

  if (manifest.layout) {
    const existingPlugin = findInstalledLayoutProvider(
      manifest.layout.slug,
      manifest.name,
    );
    if (existingPlugin) {
      conflicts.push({ type: 'layout', id: manifest.layout.slug });
    }
  }

  return conflicts;
}

export function previewPlugin(source: string): void {
  console.log(`🔍 Previewing plugin from ${source}...`);

  const pluginName = extractPluginName(source);
  const tempDir = join(PLUGINS_DIR, `.preview-${pluginName}`);

  try {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
    preparePluginSource(source, tempDir, 'pipe');

    if (!existsSync(join(tempDir, 'plugin.json'))) {
      throw new Error('Not a valid plugin: plugin.json not found');
    }

    const manifest = readManifest(tempDir);
    const conflicts = getPluginConflicts(manifest);

    console.log(`\n✅ Valid plugin\n`);
    console.log(`  Name:    ${manifest.displayName || manifest.name}`);
    console.log(`  Package: ${manifest.name}@${manifest.version}`);
    if (manifest.description) console.log(`  Desc:    ${manifest.description}`);
    const provides = [
      manifest.entrypoint && 'ui',
      manifest.agents?.length && 'agents',
      manifest.layout && 'layout',
      manifest.providers?.length && 'providers',
    ].filter(Boolean);
    if (provides.length) console.log(`  Provides: ${provides.join(', ')}`);

    console.log(`\n  Components:`);
    if (manifest.agents?.length) {
      for (const agent of manifest.agents) {
        const slug = `${manifest.name}:${agent.slug}`;
        const conflict = conflicts.find(
          (entry) => entry.type === 'agent' && entry.id === slug,
        );
        console.log(
          `    agent:${slug}${conflict ? ' ⚠ CONFLICT (already installed)' : ''}`,
        );
      }
    }
    if (manifest.layout) {
      const conflict = conflicts.find(
        (entry) =>
          entry.type === 'layout' && entry.id === manifest.layout!.slug,
      );
      console.log(
        `    layout:${manifest.layout.slug}${conflict ? ' ⚠ CONFLICT (already installed)' : ''}`,
      );
    }
    for (const provider of manifest.providers || []) {
      console.log(`    provider:${provider.type}`);
    }
    for (const tool of manifest.tools?.required || []) {
      console.log(`    tool:${tool}`);
    }
    if (manifest.permissions?.length) {
      console.log(`\n  Permissions: ${manifest.permissions.join(', ')}`);
    }
    if (manifest.dependencies?.length) {
      console.log(`\n  Dependencies:`);
      for (const dependency of manifest.dependencies) {
        const installed = existsSync(
          join(PLUGINS_DIR, dependency.id, 'plugin.json'),
        );
        const dependencySource =
          dependency.source || lookupDepInRegistries(dependency.id);
        console.log(
          `    ${dependency.id}${installed ? ' ✓ installed' : dependencySource ? ` → ${dependencySource}` : ' ⚠ no source found'}`,
        );
      }
    }
    if (conflicts.length) {
      console.log(
        `\n  ⚠ ${conflicts.length} conflict(s) detected — use --skip to exclude`,
      );
    }
    console.log(`\n  Install with: stallion plugin install ${source}`);
    if (conflicts.length) {
      const skipArgs = conflicts
        .map((entry) => `${entry.type}:${entry.id}`)
        .join(',');
      console.log(
        `  Skip conflicts: stallion plugin install ${source} --skip=${skipArgs}`,
      );
    }
  } finally {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  }
}
