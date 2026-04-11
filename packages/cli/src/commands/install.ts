import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPlugin } from '@stallion-ai/shared/build';
import { copyPluginIntegrations } from '@stallion-ai/shared/parsers';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import {
  AGENTS_DIR,
  extractPluginName,
  isGitUrl,
  lookupDepInRegistries,
  PLUGINS_DIR,
  PROJECT_HOME,
  parseGitSource,
  readManifest,
} from './helpers.js';
import { applyInstalledPluginLayout } from './install-layout.js';

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

export function preview(source: string): void {
  console.log(`🔍 Previewing plugin from ${source}...`);

  const pluginName = extractPluginName(source);
  const tempDir = join(PLUGINS_DIR, `.preview-${pluginName}`);

  try {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
    mkdirSync(tempDir, { recursive: true });

    if (isGitUrl(source)) {
      const { url, branch } = parseGitSource(source);
      try {
        execSync(`git clone --depth 1 --branch ${branch} ${url} ${tempDir}`, {
          stdio: 'pipe',
        });
      } catch {
        rmSync(tempDir, { recursive: true, force: true });
        mkdirSync(tempDir, { recursive: true });
        execSync(`git clone --depth 1 ${url} ${tempDir}`, { stdio: 'pipe' });
      }
    } else {
      const sourcePath = resolve(source);
      if (!existsSync(sourcePath))
        throw new Error(`Source not found: ${sourcePath}`);
      cpSync(sourcePath, tempDir, { recursive: true });
    }

    if (!existsSync(join(tempDir, 'plugin.json'))) {
      throw new Error('Not a valid plugin: plugin.json not found');
    }

    const manifest = readManifest(tempDir);

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
      for (const a of manifest.agents) {
        const slug = `${manifest.name}:${a.slug}`;
        const conflict = conflicts.find(
          (c) => c.type === 'agent' && c.id === slug,
        );
        console.log(
          `    agent:${slug}${conflict ? ' ⚠ CONFLICT (already installed)' : ''}`,
        );
      }
    }
    if (manifest.layout) {
      const conflict = conflicts.find(
        (c) => c.type === 'layout' && c.id === manifest.layout!.slug,
      );
      console.log(
        `    layout:${manifest.layout.slug}${conflict ? ' ⚠ CONFLICT (already installed)' : ''}`,
      );
    }
    for (const p of manifest.providers || []) {
      console.log(`    provider:${p.type}`);
    }
    for (const t of manifest.tools?.required || []) {
      console.log(`    tool:${t}`);
    }
    if (manifest.permissions?.length) {
      console.log(`\n  Permissions: ${manifest.permissions.join(', ')}`);
    }
    if (manifest.dependencies?.length) {
      console.log(`\n  Dependencies:`);
      for (const dep of manifest.dependencies) {
        const installed = existsSync(join(PLUGINS_DIR, dep.id, 'plugin.json'));
        const source = dep.source || lookupDepInRegistries(dep.id);
        console.log(
          `    ${dep.id}${installed ? ' ✓ installed' : source ? ` → ${source}` : ' ⚠ no source found'}`,
        );
      }
    }
    if (conflicts.length) {
      console.log(
        `\n  ⚠ ${conflicts.length} conflict(s) detected — use --skip to exclude`,
      );
    }
    console.log(`\n  Install with: stallion install ${source}`);
    if (conflicts.length) {
      const skipArgs = conflicts.map((c) => `${c.type}:${c.id}`).join(',');
      console.log(
        `  Skip conflicts: stallion install ${source} --skip=${skipArgs}`,
      );
    }
  } finally {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function install(
  source: string,
  skipList: string[] = [],
): Promise<void> {
  console.log(`📦 Installing plugin from ${source}...`);
  const skipSet = new Set(skipList);
  const pluginName = extractPluginName(source);
  const pluginDir = join(PLUGINS_DIR, pluginName);

  if (existsSync(pluginDir)) rmSync(pluginDir, { recursive: true });

  if (isGitUrl(source)) {
    const { url, branch } = parseGitSource(source);
    mkdirSync(pluginDir, { recursive: true });
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${url} ${pluginDir}`, {
        stdio: 'inherit',
      });
    } catch {
      rmSync(pluginDir, { recursive: true, force: true });
      mkdirSync(pluginDir, { recursive: true });
      execSync(`git clone --depth 1 ${url} ${pluginDir}`, { stdio: 'inherit' });
    }
  } else {
    const sourcePath = resolve(source);
    if (!existsSync(sourcePath))
      throw new Error(`Source path does not exist: ${sourcePath}`);
    mkdirSync(pluginDir, { recursive: true });
    cpSync(sourcePath, pluginDir, { recursive: true });
  }

  if (existsSync(join(pluginDir, 'package.json'))) {
    try {
      execSync('npm install --production --ignore-scripts', {
        cwd: pluginDir,
        stdio: 'pipe',
      });
    } catch {}
  }

  const manifest = readManifest(pluginDir);

  // Rename folder to match manifest name (git repos may have different names)
  const canonicalDir = join(PLUGINS_DIR, manifest.name);
  if (pluginDir !== canonicalDir) {
    if (existsSync(canonicalDir)) rmSync(canonicalDir, { recursive: true });
    cpSync(pluginDir, canonicalDir, { recursive: true });
    rmSync(pluginDir, { recursive: true });
  }
  const finalDir = canonicalDir;

  if (manifest.dependencies?.length) {
    console.log('  Resolving dependencies...');
    for (const dep of manifest.dependencies) {
      if (existsSync(join(PLUGINS_DIR, dep.id, 'plugin.json'))) {
        console.log(`  ✓ Dep: ${dep.id} (already installed)`);
        continue;
      }
      const depSource = dep.source || lookupDepInRegistries(dep.id);
      if (depSource) {
        try {
          await install(depSource, []);
          console.log(`  ✓ Dep: ${dep.id}`);
        } catch (e: any) {
          console.error(`  ✗ Dep: ${dep.id} — ${e.message}`);
        }
      } else {
        console.error(
          `  ✗ Dep: ${dep.id} — no source found (not in any installed plugin registry)`,
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
      `   Providers: ${manifest.providers.map((p) => p.type).join(', ')}`,
    );
  }
}

export function list(): void {
  if (!existsSync(PLUGINS_DIR)) {
    console.log('No plugins installed');
    return;
  }
  const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      try {
        return readManifest(join(PLUGINS_DIR, d.name));
      } catch {
        return null;
      }
    })
    .filter((m): m is PluginManifest => m !== null);

  if (!plugins.length) {
    console.log('No plugins installed');
    return;
  }

  // Dedup by manifest name (in case folder name differs)
  const seen = new Set<string>();
  const unique = plugins.filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });

  console.log(`\nInstalled Plugins (${unique.length}):\n`);
  for (const m of unique) {
    console.log(`  ${m.displayName || m.name} (${m.name}@${m.version})`);
    if (m.agents?.length) {
      console.log(
        `    Agents: ${m.agents.map((a) => `${m.name}:${a.slug}`).join(', ')}`,
      );
    }
    if (m.layout) {
      console.log(`    Layout: ${m.layout.slug}`);
    }
    if (m.providers?.length) {
      console.log(
        `    Providers: ${m.providers.map((p) => p.type).join(', ')}`,
      );
    }
    if (m.dependencies?.length) {
      console.log(
        `    Dependencies: ${m.dependencies.map((d) => d.id).join(', ')}`,
      );
    }
    if (m.tools?.required?.length) {
      console.log(`    Tools: ${m.tools.required.join(', ')}`);
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
  const m = readManifest(pluginDir);
  console.log(`\n${m.displayName} (${m.name}@${m.version})`);
  if (m.agents) {
    console.log(`Agents (${m.agents.length}):`);
    m.agents.forEach((a) => console.log(`  - ${m.name}:${a.slug}`));
  }
  if (m.layout) console.log(`Layout: ${m.layout.slug}`);
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
  const configPath = join(PROJECT_HOME, 'config.json');
  let url = registryUrl;

  if (!url && existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      url = config.registryUrl;
    } catch {}
  }

  if (!url) {
    console.error('No registry URL configured.');
    console.log('  Set one: stallion registry <url>');
    console.log('  Or add "registryUrl" to ~/.stallion-ai/config.json');
    process.exit(1);
  }

  if (registryUrl) {
    mkdirSync(PROJECT_HOME, { recursive: true });
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {}
    }
    config.registryUrl = registryUrl;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`  ✓ Registry URL saved: ${registryUrl}`);
    return;
  }

  console.log(`📋 Fetching registry from ${url}...\n`);
  try {
    const result = execSync(`curl -sf "${url}"`, {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const manifest = JSON.parse(result);
    const plugins = manifest.plugins || [];

    if (!plugins.length) {
      console.log('Registry is empty.');
      return;
    }

    const installed = new Set<string>();
    if (existsSync(PLUGINS_DIR)) {
      for (const d of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (d.isDirectory()) installed.add(d.name);
      }
    }

    console.log('Available Plugins:\n');
    for (const p of plugins) {
      const status = installed.has(p.id) ? ' [installed]' : '';
      console.log(
        `  ${p.displayName || p.id} (${p.id}@${p.version || '?'})${status}`,
      );
      if (p.description) console.log(`    ${p.description}`);
    }
    console.log(`\n  Install with: stallion install <source>`);
  } catch (e: any) {
    console.error(`Failed to fetch registry: ${e.message}`);
    process.exit(1);
  }
}
