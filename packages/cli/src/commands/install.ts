import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { buildPlugin } from '@stallion-ai/shared/build';
import { copyPluginIntegrations } from '@stallion-ai/shared/parsers';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import {
  AGENTS_DIR,
  extractPluginName,
  lookupDepInRegistries,
  PLUGINS_DIR,
  PROJECT_HOME,
  readManifest,
} from './helpers.js';
import { applyInstalledPluginLayout } from './install-layout.js';
import { previewPlugin } from './install-preview.js';
import {
  canonicalizePluginDirectory,
  installPluginPackageDependencies,
  preparePluginSource,
} from './install-source.js';
import { showOrSaveRegistry } from './install-registry.js';

export function preview(source: string): void {
  previewPlugin(source);
}

export async function install(
  source: string,
  skipList: string[] = [],
): Promise<void> {
  console.log(`📦 Installing plugin from ${source}...`);
  const skipSet = new Set(skipList);
  const pluginName = extractPluginName(source);
  const pluginDir = join(PLUGINS_DIR, pluginName);

  preparePluginSource(source, pluginDir, 'inherit');
  installPluginPackageDependencies(pluginDir);

  const manifest = readManifest(pluginDir);
  const finalDir = canonicalizePluginDirectory(
    pluginDir,
    join(PLUGINS_DIR, manifest.name),
  );

  if (manifest.dependencies?.length) {
    console.log('  Resolving dependencies...');
    for (const dependency of manifest.dependencies) {
      if (existsSync(join(PLUGINS_DIR, dependency.id, 'plugin.json'))) {
        console.log(`  ✓ Dep: ${dependency.id} (already installed)`);
        continue;
      }
      const dependencySource =
        dependency.source || lookupDepInRegistries(dependency.id);
      if (dependencySource) {
        try {
          await install(dependencySource, []);
          console.log(`  ✓ Dep: ${dependency.id}`);
        } catch (error: any) {
          console.error(`  ✗ Dep: ${dependency.id} — ${error.message}`);
        }
      } else {
        console.error(
          `  ✗ Dep: ${dependency.id} — no source found (not in any installed plugin registry)`,
        );
      }
    }
  }

  const buildResult = await buildPlugin(finalDir);
  if (buildResult.built) {
    console.log('  ✓ Plugin built');
  }

  const copied = copyPluginIntegrations(
    finalDir,
    join(PROJECT_HOME, 'integrations'),
  );
  for (const id of copied) {
    console.log(`  ✓ Tool: ${id}`);
  }

  if (manifest.agents) {
    mkdirSync(AGENTS_DIR, { recursive: true });
    for (const agent of manifest.agents) {
      const agentSlug = `${manifest.name}:${agent.slug}`;
      if (skipSet.has(`agent:${agentSlug}`)) {
        console.log(`  ⊘ Agent: ${agentSlug} (skipped)`);
        continue;
      }
      const sourceDir = join(finalDir, 'agents', agent.slug);
      const targetDir = join(AGENTS_DIR, agentSlug);
      if (existsSync(sourceDir)) {
        cpSync(sourceDir, targetDir, { recursive: true });
        console.log(`  ✓ Agent: ${agentSlug}`);
      }
    }
  }

  if (manifest.layout && !skipSet.has(`layout:${manifest.layout.slug}`)) {
    applyInstalledPluginLayout({
      finalDir,
      manifest,
      projectHome: PROJECT_HOME,
      skipSet,
    });
  }

  console.log(
    `\n✅ Installed ${manifest.displayName} (${manifest.name}@${manifest.version})`,
  );
  if (manifest.providers?.length) {
    console.log(
      `   Providers: ${manifest.providers.map((provider) => provider.type).join(', ')}`,
    );
  }
}

export function list(): void {
  if (!existsSync(PLUGINS_DIR)) {
    console.log('No plugins installed');
    return;
  }
  const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return readManifest(join(PLUGINS_DIR, entry.name));
      } catch {
        return null;
      }
    })
    .filter((manifest): manifest is PluginManifest => manifest !== null);

  if (!plugins.length) {
    console.log('No plugins installed');
    return;
  }

  const seen = new Set<string>();
  const unique = plugins.filter((manifest) => {
    if (seen.has(manifest.name)) return false;
    seen.add(manifest.name);
    return true;
  });

  console.log(`\nInstalled Plugins (${unique.length}):\n`);
  for (const manifest of unique) {
    console.log(
      `  ${manifest.displayName || manifest.name} (${manifest.name}@${manifest.version})`,
    );
    if (manifest.agents?.length) {
      console.log(
        `    Agents: ${manifest.agents.map((agent) => `${manifest.name}:${agent.slug}`).join(', ')}`,
      );
    }
    if (manifest.layout) {
      console.log(`    Layout: ${manifest.layout.slug}`);
    }
    if (manifest.providers?.length) {
      console.log(
        `    Providers: ${manifest.providers.map((provider) => provider.type).join(', ')}`,
      );
    }
    if (manifest.dependencies?.length) {
      console.log(
        `    Dependencies: ${manifest.dependencies.map((dependency) => dependency.id).join(', ')}`,
      );
    }
    if (manifest.tools?.required?.length) {
      console.log(`    Tools: ${manifest.tools.required.join(', ')}`);
    }
  }
}

export function remove(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  const manifest = readManifest(pluginDir);
  if (manifest.agents) {
    for (const agent of manifest.agents) {
      const agentJson = join(AGENTS_DIR, `${name}:${agent.slug}`, 'agent.json');
      if (existsSync(agentJson)) rmSync(agentJson);
    }
  }
  rmSync(pluginDir, { recursive: true });
  console.log(`✅ Removed ${manifest.displayName}`);
}

export function info(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  const manifest = readManifest(pluginDir);
  console.log(`\n${manifest.displayName} (${manifest.name}@${manifest.version})`);
  if (manifest.agents) {
    console.log(`Agents (${manifest.agents.length}):`);
    manifest.agents.forEach((agent) =>
      console.log(`  - ${manifest.name}:${agent.slug}`),
    );
  }
  if (manifest.layout) console.log(`Layout: ${manifest.layout.slug}`);
}

export function update(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  if (!existsSync(join(pluginDir, '.git'))) {
    console.error('Not a git install. Remove and re-install.');
    process.exit(1);
  }
  execSync('git pull --ff-only', { cwd: pluginDir, stdio: 'inherit' });
  console.log(`✅ Updated ${readManifest(pluginDir).displayName}`);
}

export function registry(registryUrl?: string): void {
  showOrSaveRegistry(registryUrl);
}
