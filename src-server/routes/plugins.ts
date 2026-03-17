/**
 * Plugin Routes — list, serve, install, remove, and reload plugins
 */

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
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPlugin as buildPluginBundle,
  copyPluginIntegrations,
} from '@stallion-ai/shared';
import { Hono } from 'hono';
import {
  getAgentRegistryProvider,
  getIntegrationRegistryProvider,
} from '../providers/registry.js';
import type { EventBus } from '../services/event-bus.js';
import {
  getPermissionTier,
  getPluginGrants,
  grantPermissions,
  hasGrant,
  processInstallPermissions,
  revokeAllGrants,
} from '../services/plugin-permissions.js';
import {
  pluginInstalls,
  pluginUninstalls,
  pluginUpdates,
} from '../telemetry/metrics.js';

export function createPluginRoutes(
  projectHomeDir: string,
  logger: any,
  eventBus?: EventBus,
) {
  const app = new Hono();
  const pluginsDir = join(projectHomeDir, 'plugins');
  const agentsDir = join(projectHomeDir, 'agents');
  const layoutsDir = join(projectHomeDir, 'layouts');

  /** Resolve a plugin bundle file by manifest name (not folder name) */
  function resolvePluginBundle(name: string, file: string): string | null {
    // Try direct folder match first
    const direct = join(pluginsDir, name, 'dist', file);
    if (existsSync(direct)) return direct;
    // Scan folders for matching manifest name
    if (!existsSync(pluginsDir)) return null;
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(
          readFileSync(join(pluginsDir, entry.name, 'plugin.json'), 'utf-8'),
        );
        if (manifest.name === name) {
          const path = join(pluginsDir, entry.name, 'dist', file);
          return existsSync(path) ? path : null;
        }
      } catch {}
    }
    return null;
  }

  /** Run plugin build if build script or entrypoint exists */
  async function buildPlugin(pluginDir: string, name: string) {
    try {
      const result = await buildPluginBundle(pluginDir);
      if (result.built) {
        logger.info(`Plugin ${name}: build complete`);
      }
    } catch (e: any) {
      logger.error(`Plugin ${name}: build failed`, { error: e.message });
      throw new Error(`Build failed: ${e.message}`);
    }
  }

  // ── List installed plugins ───────────────────────────

  app.get('/', async (c) => {
    if (!existsSync(pluginsDir)) return c.json({ plugins: [] });

    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(pluginsDir, entry.name, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        const bundlePath = join(pluginsDir, entry.name, 'dist', 'bundle.js');

        const pluginDir = join(pluginsDir, entry.name);
        const isGit = existsSync(join(pluginDir, '.git'));
        let git: { hash: string; branch: string; remote?: string } | undefined;
        if (isGit) {
          try {
            const hash = execSync('git rev-parse --short HEAD', {
              cwd: pluginDir,
              encoding: 'utf-8',
            }).trim();
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd: pluginDir,
              encoding: 'utf-8',
            }).trim();
            let remote: string | undefined;
            try {
              remote = execSync('git remote get-url origin', {
                cwd: pluginDir,
                encoding: 'utf-8',
              }).trim();
            } catch {}
            git = { hash, branch, remote };
          } catch {}
        }

        const declared = manifest.permissions || [];
        const granted = getPluginGrants(projectHomeDir, manifest.name);
        const missing = declared
          .filter((p: string) => !granted.includes(p))
          .map((p: string) => ({ permission: p, tier: getPermissionTier(p) }));

        plugins.push({
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          description: manifest.description,
          hasBundle: existsSync(bundlePath),
          layout: manifest.layout,
          agents: manifest.agents,
          providers: manifest.providers,
          links: manifest.links,
          git,
          permissions: { declared, granted, missing },
        });
      } catch (e: any) {
        logger.error('Failed to read plugin manifest', {
          plugin: entry.name,
          error: e.message,
        });
      }
    }

    return c.json({ plugins });
  });

  // ── Fetch source to temp dir (shared by preview + install) ──

  async function fetchSource(
    source: string,
  ): Promise<{ tempDir: string; tempName: string } | { error: string }> {
    const isGit =
      source.startsWith('git@') ||
      source.endsWith('.git') ||
      (source.startsWith('https://') &&
        (source.includes('.git') ||
          source.includes('gitlab') ||
          source.includes('github')));

    const tempName = extractPluginName(source);
    const tempDir = join(pluginsDir, `.preview-${tempName}`);

    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
    mkdirSync(tempDir, { recursive: true });

    if (isGit) {
      const [url, branch] = source.split('#');
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) cloneArgs.push('--branch', branch);
      cloneArgs.push(url, tempDir);
      try {
        execSync(['git', ...cloneArgs].map((a) => `"${a}"`).join(' '), {
          timeout: 30000,
        });
      } catch {
        rmSync(tempDir, { recursive: true, force: true });
        mkdirSync(tempDir, { recursive: true });
        try {
          execSync(`git clone --depth 1 "${url}" "${tempDir}"`, {
            timeout: 30000,
          });
        } catch (e: any) {
          rmSync(tempDir, { recursive: true, force: true });
          return { error: `Failed to clone: ${e.message}` };
        }
      }
    } else {
      if (!existsSync(source)) {
        rmSync(tempDir, { recursive: true });
        return { error: `Source not found: ${source}` };
      }
      if (!existsSync(join(source, 'plugin.json'))) {
        rmSync(tempDir, { recursive: true });
        return { error: 'Not a valid plugin: plugin.json not found' };
      }
      cpSync(source, tempDir, { recursive: true });
    }

    if (!existsSync(join(tempDir, 'plugin.json'))) {
      rmSync(tempDir, { recursive: true, force: true });
      return { error: 'Not a valid plugin: plugin.json not found' };
    }

    return { tempDir, tempName };
  }

  /** Detect conflicts between a manifest and what's already installed */
  function detectConflicts(
    manifest: any,
  ): Array<{ type: string; id: string; existingSource?: string }> {
    const conflicts: Array<{
      type: string;
      id: string;
      existingSource?: string;
    }> = [];

    for (const agent of manifest.agents || []) {
      const slug = `${manifest.name}:${agent.slug}`;
      if (existsSync(join(agentsDir, slug, 'agent.json'))) {
        conflicts.push({
          type: 'agent',
          id: slug,
          existingSource: 'installed',
        });
      }
    }

    if (manifest.layout) {
      const layoutDir = join(layoutsDir, manifest.layout.slug, 'layout.json');
      if (existsSync(layoutDir)) {
        try {
          const existing = JSON.parse(readFileSync(layoutDir, 'utf-8'));
          if (existing.plugin && existing.plugin !== manifest.name) {
            conflicts.push({
              type: 'layout',
              id: manifest.layout.slug,
              existingSource: existing.plugin,
            });
          }
        } catch {
          conflicts.push({ type: 'layout', id: manifest.layout.slug });
        }
      }
    }

    return conflicts;
  }

  /** Resolve plugin dependencies recursively with cycle detection, including their components */
  async function resolveDependencies(
    manifest: any,
    seen: Set<string> = new Set(),
  ): Promise<
    Array<{
      id: string;
      source?: string;
      status: 'installed' | 'will-install' | 'missing';
      components?: Array<{ type: string; id: string }>;
      git?: { hash: string; branch: string; remote?: string };
    }>
  > {
    const deps: Array<{
      id: string;
      source?: string;
      status: 'installed' | 'will-install' | 'missing';
      components?: Array<{ type: string; id: string }>;
      git?: { hash: string; branch: string; remote?: string };
    }> = [];
    if (!manifest.dependencies?.length) return deps;

    for (const dep of manifest.dependencies) {
      if (seen.has(dep.id)) continue;
      seen.add(dep.id);

      // Read manifest from installed dir or fetched source
      let depManifest: any = null;
      let depGit: { hash: string; branch: string; remote?: string } | undefined;
      let status: 'installed' | 'will-install' | 'missing' = 'missing';

      const depDir = join(pluginsDir, dep.id);
      if (existsSync(join(depDir, 'plugin.json'))) {
        status = 'installed';
        try {
          depManifest = JSON.parse(
            readFileSync(join(depDir, 'plugin.json'), 'utf-8'),
          );
        } catch {}
        depGit = getGitInfo(depDir);
      } else if (dep.source) {
        status = 'will-install';
        const result = await fetchSource(dep.source);
        if (!('error' in result)) {
          try {
            depManifest = JSON.parse(
              readFileSync(join(result.tempDir, 'plugin.json'), 'utf-8'),
            );
          } catch {}
          depGit = getGitInfo(result.tempDir);
          rmSync(result.tempDir, { recursive: true, force: true });
        }
      } else {
        try {
          const available = await getAgentRegistryProvider().listAvailable();
          if (available.find((a) => a.id === dep.id)) status = 'will-install';
        } catch {}
      }

      // Extract components from the dependency manifest
      const components: Array<{ type: string; id: string }> = [];
      if (depManifest) {
        for (const a of depManifest.agents || [])
          components.push({
            type: 'agent',
            id: `${depManifest.name}:${a.slug}`,
          });
        if (depManifest.layout)
          components.push({ type: 'layout', id: depManifest.layout.slug });
        for (const p of depManifest.providers || [])
          components.push({ type: 'provider', id: p.type });
      }

      deps.push({
        id: dep.id,
        source: dep.source,
        status,
        components: components.length ? components : undefined,
        git: depGit,
      });

      // Recurse into transitive deps
      if (depManifest) {
        deps.push(...(await resolveDependencies(depManifest, seen)));
      }
    }

    return deps;
  }

  /** Install a single dependency by id/source */
  async function installDependency(dep: {
    id: string;
    source?: string;
  }): Promise<{ success: boolean; error?: string }> {
    // Already installed
    if (existsSync(join(pluginsDir, dep.id, 'plugin.json'))) {
      return { success: true };
    }

    if (dep.source) {
      const result = await fetchSource(dep.source);
      if ('error' in result) return { success: false, error: result.error };
      const { tempDir } = result;
      const targetDir = join(pluginsDir, dep.id);
      if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
      cpSync(tempDir, targetDir, { recursive: true });
      rmSync(tempDir, { recursive: true, force: true });
      await buildPlugin(targetDir, dep.id);
      // Recurse into transitive deps
      try {
        const depManifest = JSON.parse(
          readFileSync(join(targetDir, 'plugin.json'), 'utf-8'),
        );
        for (const transitive of depManifest.dependencies || []) {
          await installDependency(transitive);
        }
      } catch {}
      return { success: true };
    }

    // Try registry
    try {
      const registryResult = await getAgentRegistryProvider().install(dep.id);
      if (registryResult.success) {
        // Recurse into transitive deps
        const depDir = join(pluginsDir, dep.id);
        if (existsSync(join(depDir, 'plugin.json'))) {
          try {
            const depManifest = JSON.parse(
              readFileSync(join(depDir, 'plugin.json'), 'utf-8'),
            );
            for (const transitive of depManifest.dependencies || []) {
              await installDependency(transitive);
            }
          } catch {}
        }
        return { success: true };
      }
      return { success: false, error: registryResult.message };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /** Extract git info from a directory (if it's a git repo) */
  function getGitInfo(
    dir: string,
  ): { hash: string; branch: string; remote?: string } | undefined {
    if (!existsSync(join(dir, '.git'))) return undefined;
    try {
      const hash = execSync('git rev-parse --short HEAD', {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      let remote: string | undefined;
      try {
        remote = execSync('git remote get-url origin', {
          cwd: dir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {}
      return { hash, branch, remote };
    } catch {
      return undefined;
    }
  }

  // ── Preview / validate plugin before install ─────────

  app.post('/preview', async (c) => {
    try {
      const { source } = await c.req.json();
      if (!source)
        return c.json(
          {
            valid: false,
            error: 'source is required',
            components: [],
            conflicts: [],
          },
          400,
        );

      const result = await fetchSource(source);
      if ('error' in result)
        return c.json({
          valid: false,
          error: result.error,
          components: [],
          conflicts: [],
        });

      const { tempDir } = result;
      try {
        const manifest = JSON.parse(
          await readFile(join(tempDir, 'plugin.json'), 'utf-8'),
        );
        const conflicts = detectConflicts(manifest);
        const _conflictIds = new Set(conflicts.map((c) => `${c.type}:${c.id}`));

        const components: Array<{
          type: string;
          id: string;
          detail?: string;
          conflict?: (typeof conflicts)[0];
        }> = [];

        for (const agent of manifest.agents || []) {
          const slug = `${manifest.name}:${agent.slug}`;
          const conflict = conflicts.find(
            (c) => c.type === 'agent' && c.id === slug,
          );
          components.push({
            type: 'agent',
            id: slug,
            detail: agent.source,
            conflict,
          });
        }

        if (manifest.layout) {
          const conflict = conflicts.find(
            (c) => c.type === 'layout' && c.id === manifest.layout.slug,
          );
          components.push({
            type: 'layout',
            id: manifest.layout.slug,
            detail: manifest.layout.source,
            conflict,
          });
        }

        for (const p of manifest.providers || []) {
          components.push({ type: 'provider', id: p.type, detail: p.module });
        }

        for (const toolId of manifest.integrations?.required || []) {
          const installed = existsSync(
            join(projectHomeDir, 'integrations', toolId, 'integration.json'),
          );
          components.push({
            type: 'tool',
            id: toolId,
            detail: installed ? 'already installed' : 'will install',
          });
        }

        // Resolve dependencies
        const dependencies = await resolveDependencies(manifest);
        const git = getGitInfo(tempDir);

        return c.json({
          valid: true,
          manifest,
          components,
          conflicts,
          dependencies,
          git,
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e: any) {
      return c.json(
        { valid: false, error: e.message, components: [], conflicts: [] },
        500,
      );
    }
  });

  // ── Install plugin from git URL or local path ───────

  app.post('/install', async (c) => {
    try {
      const { source, skip } = await c.req.json();
      if (!source)
        return c.json({ success: false, error: 'source is required' }, 400);

      // skip: optional array of component ids to exclude, e.g. ["agent:myplugin:assistant", "workspace:my-ws"]
      const skipSet = new Set<string>(skip || []);

      const result = await fetchSource(source);
      if ('error' in result)
        return c.json({ success: false, error: result.error }, 400);

      const { tempDir, tempName } = result;

      const manifest = JSON.parse(
        await readFile(join(tempDir, 'plugin.json'), 'utf-8'),
      );
      const pluginName = manifest.name || tempName;
      const pluginDir = join(pluginsDir, pluginName);

      // Resolve dependencies first
      const depResults: Array<{ id: string; status: string; error?: string }> =
        [];
      for (const dep of manifest.dependencies || []) {
        const result = await installDependency(dep);
        depResults.push({
          id: dep.id,
          status: result.success ? 'installed' : 'failed',
          error: result.error,
        });
      }

      // Move to canonical directory (removes old version if exists)
      if (existsSync(pluginDir) && pluginDir !== tempDir)
        rmSync(pluginDir, { recursive: true });
      if (tempDir !== pluginDir) {
        cpSync(tempDir, pluginDir, { recursive: true });
        rmSync(tempDir, { recursive: true });
      }

      // Install agents (unless skipped)
      if (manifest.agents) {
        mkdirSync(agentsDir, { recursive: true });
        for (const agent of manifest.agents) {
          const slug = `${manifest.name}:${agent.slug}`;
          if (skipSet.has(`agent:${slug}`)) continue;
          const src = join(pluginDir, 'agents', agent.slug);
          if (existsSync(src)) {
            cpSync(src, join(agentsDir, slug), { recursive: true });
          }
        }
      }

      // Install layout config (unless skipped)
      let installedLayoutSlug: string | null = null;
      if (manifest.layout && !skipSet.has(`layout:${manifest.layout.slug}`)) {
        mkdirSync(layoutsDir, { recursive: true });
        const src = join(pluginDir, manifest.layout.source);
        if (existsSync(src)) {
          const layoutDir = join(layoutsDir, manifest.layout.slug);
          mkdirSync(layoutDir, { recursive: true });
          const layoutConfig = JSON.parse(readFileSync(src, 'utf-8'));
          layoutConfig.plugin = pluginName;
          writeFileSync(
            join(layoutDir, 'layout.json'),
            JSON.stringify(layoutConfig, null, 2),
          );
          installedLayoutSlug = manifest.layout.slug;
        }
      }

      // Scan and register plugin prompts
      if (manifest.prompts?.source) {
        const { scanPromptDir } = await import('../services/prompt-scanner.js');
        const promptsDir = join(pluginDir, manifest.prompts.source);
        const scanned = scanPromptDir(promptsDir, pluginName);
        if (scanned.length > 0) {
          const { PromptService } = await import(
            '../services/prompt-service.js'
          );
          new PromptService().registerPluginPrompts(scanned);
          logger.info(
            `Registered ${scanned.length} prompts from ${pluginName}`,
          );
        }
      }

      // Build plugin (if build script exists)
      await buildPlugin(pluginDir, pluginName);

      // Copy bundled tool configs from plugin
      const copied = copyPluginIntegrations(
        pluginDir,
        join(projectHomeDir, 'integrations'),
      );
      for (const id of copied) {
        logger.info(`Copied tool config: ${id}`);
      }

      // Auto-install missing command binaries for copied integrations
      for (const id of copied) {
        try {
          const defPath = join(
            projectHomeDir,
            'integrations',
            id,
            'integration.json',
          );
          if (!existsSync(defPath)) continue;
          const def = JSON.parse(readFileSync(defPath, 'utf-8'));
          if (!def.command) continue;
          try {
            execSync(`which ${def.command}`, { stdio: 'pipe' });
            continue;
          } catch {}
          const registry = getIntegrationRegistryProvider();
          if (registry.installByCommand) {
            const result = await registry.installByCommand(def.command);
            logger.info(
              `Auto-install ${def.command}: ${result.success ? 'ok' : result.message}`,
            );
          }
        } catch (e: any) {
          logger.warn(`Failed to auto-install command for ${id}`, {
            error: e.message,
          });
        }
      }

      // Load providers (unless skipped)
      if (manifest.providers) {
        const activeProviders = manifest.providers.filter(
          (p: any) => !skipSet.has(`provider:${p.type}`),
        );
        if (activeProviders.length > 0) {
          await loadProviders(
            pluginsDir,
            manifest.name,
            { ...manifest, providers: activeProviders },
            logger,
          );
        }
      }

      // Resolve required tools (unless skipped)
      const toolsDir = join(projectHomeDir, 'integrations');
      const requiredTools = (manifest.integrations?.required || []).filter(
        (id: string) => !skipSet.has(`tool:${id}`),
      );
      const toolResults: Array<{
        id: string;
        status: 'installed' | 'missing' | 'installed-now';
      }> = [];

      for (const toolId of requiredTools) {
        if (existsSync(join(toolsDir, toolId, 'integration.json'))) {
          toolResults.push({ id: toolId, status: 'installed' });
        } else {
          try {
            const registry = getIntegrationRegistryProvider();
            const result = await registry.install(toolId);
            const toolDef = result.success
              ? await registry.getToolDef(toolId)
              : null;
            if (toolDef) {
              const toolDir = join(toolsDir, toolId);
              mkdirSync(toolDir, { recursive: true });
              writeFileSync(
                join(toolDir, 'integration.json'),
                JSON.stringify(toolDef, null, 2),
              );
            }
            toolResults.push({
              id: toolId,
              status: result.success ? 'installed-now' : 'missing',
            });
          } catch {
            toolResults.push({ id: toolId, status: 'missing' });
          }
        }
      }

      // Process permissions
      const { autoGranted, pendingConsent } = processInstallPermissions(
        projectHomeDir,
        pluginName,
        manifest.permissions || [],
      );

      // Notify UI that a plugin was installed (triggers agent reload + plugin registry refresh)
      eventBus?.emit('plugins:installed', {
        name: pluginName,
        agents:
          manifest.agents?.map((a: any) => `${pluginName}:${a.slug}`) || [],
      });
      pluginInstalls.add(1, { plugin: pluginName });

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          hasBundle: existsSync(join(pluginDir, 'dist', 'bundle.js')),
          agents: (manifest.agents || []).map((a: any) => ({
            slug: `${manifest.name}:${a.slug}`,
          })),
        },
        layout: installedLayoutSlug ? { slug: installedLayoutSlug } : undefined,
        tools: toolResults,
        dependencies: depResults,
        permissions: { autoGranted, pendingConsent },
      });
    } catch (e: any) {
      logger.error('Plugin install failed', { error: e.message });
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Check for plugin updates ─────────────────────────

  app.get('/check-updates', async (c) => {
    const updates: Array<{
      name: string;
      currentVersion: string;
      latestVersion: string;
      source: string;
    }> = [];

    try {
      // 1. Check git-installed plugins by comparing local vs remote HEAD
      if (existsSync(pluginsDir)) {
        const entries = readdirSync(pluginsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dir = join(pluginsDir, entry.name);
          const gitDir = join(dir, '.git');
          const manifestPath = join(dir, 'plugin.json');
          if (!existsSync(gitDir) || !existsSync(manifestPath)) continue;

          try {
            execSync('git fetch --quiet', {
              cwd: dir,
              timeout: 10000,
              stdio: 'pipe',
            });
            const _local = execSync('git rev-parse HEAD', {
              cwd: dir,
              encoding: 'utf-8',
            }).trim();
            const behind = execSync('git rev-list --count HEAD..@{u}', {
              cwd: dir,
              encoding: 'utf-8',
            }).trim();
            if (parseInt(behind, 10) > 0) {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
              updates.push({
                name: entry.name,
                currentVersion: manifest.version || 'unknown',
                latestVersion: `${behind} commit${behind === '1' ? '' : 's'} behind`,
                source: 'git',
              });
            }
          } catch {
            /* no remote tracking, skip */
          }
        }
      }

      // 2. Check registry manifest for version-based updates (if configured)
      try {
        const registryProvider = getAgentRegistryProvider();
        const [available, installed] = await Promise.all([
          registryProvider.listAvailable(),
          registryProvider.listInstalled(),
        ]);
        for (const inst of installed) {
          if (updates.some((u) => u.name === inst.id)) continue; // already found via git
          const avail = available.find((p) => p.id === inst.id);
          if (avail?.version && avail.version !== inst.version) {
            updates.push({
              name: inst.id,
              currentVersion: inst.version || 'unknown',
              latestVersion: avail.version,
              source: 'registry',
            });
          }
        }
      } catch {
        /* no registry configured, that's fine */
      }

      return c.json({ updates });
    } catch (e: any) {
      logger.error('Failed to check for updates', { error: e.message });
      return c.json({ updates: [] });
    }
  });

  // ── Update specific plugin ───────────────────────────

  app.post('/:name/update', async (c) => {
    const name = c.req.param('name');
    const pluginDir = join(pluginsDir, name);

    if (!existsSync(pluginDir)) {
      return c.json({ success: false, error: 'Plugin not found' }, 404);
    }

    try {
      // Check if it's a git install (has .git directory)
      const gitDir = join(pluginDir, '.git');
      if (existsSync(gitDir)) {
        // Git update
        execSync('git pull --ff-only', { cwd: pluginDir, timeout: 30000 });
      } else {
        // Registry re-install
        const registryProvider = getAgentRegistryProvider();
        const result = await registryProvider.install(name);
        if (!result.success) {
          return c.json({ success: false, error: result.message }, 400);
        }
      }

      // Read updated manifest
      const manifestPath = join(pluginDir, 'plugin.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

      // Rebuild after update
      await buildPlugin(pluginDir, name);

      // Re-copy tool configs
      copyPluginIntegrations(pluginDir, join(projectHomeDir, 'integrations'));

      // Hot-reload providers (mirrors install route)
      if (manifest.providers?.length) {
        await loadProviders(
          pluginsDir,
          manifest.name || name,
          manifest,
          logger,
        );
      }

      // Emit SSE event
      eventBus?.emit('plugins:updated', { name, version: manifest.version });
      pluginUpdates.add(1, { plugin: name });

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          version: manifest.version,
        },
      });
    } catch (e: any) {
      logger.error('Plugin update failed', { plugin: name, error: e.message });
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Remove plugin ────────────────────────────────────

  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    const pluginDir = join(pluginsDir, name);

    if (!existsSync(pluginDir))
      return c.json({ success: false, error: 'Plugin not found' }, 404);

    try {
      const manifest = JSON.parse(
        await readFile(join(pluginDir, 'plugin.json'), 'utf-8'),
      );

      // Remove agents (preserve memory)
      if (manifest.agents) {
        for (const agent of manifest.agents) {
          const agentJson = join(
            agentsDir,
            `${name}:${agent.slug}`,
            'agent.json',
          );
          if (existsSync(agentJson)) rmSync(agentJson);
        }
      }

      // Remove layout
      if (manifest.layout) {
        const layoutDir = join(layoutsDir, manifest.layout.slug);
        if (existsSync(layoutDir)) rmSync(layoutDir, { recursive: true });
      }

      // Revoke permission grants
      revokeAllGrants(projectHomeDir, name);

      // Remove plugin
      rmSync(pluginDir, { recursive: true });
      pluginUninstalls.add(1, { plugin: name });

      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Serve plugin bundle JS ───────────────────────────

  app.get('/:name/bundle.js', async (c) => {
    const bundlePath = resolvePluginBundle(c.req.param('name'), 'bundle.js');
    if (!bundlePath) return c.text('Bundle not found', 404);
    c.header('Content-Type', 'application/javascript');
    c.header('Cache-Control', 'no-cache');
    return c.text(await readFile(bundlePath, 'utf-8'));
  });

  // ── Serve plugin bundle CSS ──────────────────────────

  app.get('/:name/bundle.css', async (c) => {
    const cssPath = resolvePluginBundle(c.req.param('name'), 'bundle.css');
    if (!cssPath) return c.text('', 200);
    c.header('Content-Type', 'text/css');
    c.header('Cache-Control', 'no-cache');
    c.header('Access-Control-Allow-Origin', '*');
    return c.text(await readFile(cssPath, 'utf-8'));
  });

  // ── Plugin permissions ────────────────────────────────

  app.get('/:name/permissions', async (c) => {
    const name = c.req.param('name');
    const manifestPath = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifestPath))
      return c.json({ success: false, error: 'Plugin not found' }, 404);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const declared = manifest.permissions || [];
    const granted = getPluginGrants(projectHomeDir, name);
    return c.json({ declared, granted });
  });

  app.post('/:name/grant', async (c) => {
    const name = c.req.param('name');
    const { permissions } = await c.req.json();
    if (!Array.isArray(permissions))
      return c.json(
        { success: false, error: 'permissions array required' },
        400,
      );
    grantPermissions(projectHomeDir, name, permissions);
    return c.json({ success: true, granted: permissions });
  });

  // ── Server-side fetch proxy for plugins ───────────────

  // Scoped route: checks permission grants
  app.post('/:name/fetch', async (c) => {
    const name = c.req.param('name');
    if (!hasGrant(projectHomeDir, name, 'network.fetch')) {
      return c.json(
        {
          success: false,
          error: `Plugin '${name}' does not have network.fetch permission`,
        },
        403,
      );
    }
    return proxyFetch(c);
  });

  // Legacy unscoped route (no permission check — backward compat during migration)
  app.post('/fetch', async (c) => proxyFetch(c));

  // ── Reload providers ─────────────────────────────────

  app.post('/reload', async (c) => {
    try {
      if (!existsSync(pluginsDir)) return c.json({ success: true, loaded: 0 });

      const { clearAll } = await import('../providers/registry.js');
      const { resolvePluginProviders } = await import(
        '../providers/resolver.js'
      );
      const { ConfigLoader } = await import('../domain/config-loader.js');

      const configLoader = new ConfigLoader({ projectHomeDir });
      const overrides = await configLoader.loadPluginOverrides();

      clearAll();
      const { resolved, conflicts } = resolvePluginProviders(
        pluginsDir,
        overrides,
      );

      for (const conflict of conflicts) {
        logger.warn('Provider conflict on reload', {
          type: conflict.type,
          candidates: conflict.candidates,
        });
      }

      let loaded = 0;
      for (const entry of resolved) {
        loaded += await loadProviders(
          pluginsDir,
          entry.pluginName,
          {
            providers: [{ type: entry.type, module: entry.module }],
            displayName: entry.pluginName,
          },
          logger,
        );
      }

      return c.json({ success: true, loaded });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Plugin Provider Overrides ─────────────────────────

  app.get('/:name/providers', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const pluginDir = join(pluginsDir, name);
    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath))
      return c.json({ error: 'Plugin not found' }, 404);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();
    const disabled = overrides[manifest.name || name]?.disabled ?? [];

    const providers = (manifest.providers || []).map((p: any) => ({
      type: p.type,
      module: p.module,
      layout: p.layout ?? null,
      enabled: !disabled.includes(p.type),
    }));

    return c.json({ providers });
  });

  app.get('/:name/overrides', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();
    return c.json(overrides[name] ?? {});
  });

  app.put('/:name/overrides', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const body = await c.req.json();
    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();
    overrides[name] = { disabled: body.disabled || [] };
    await configLoader.savePluginOverrides(overrides);
    return c.json({ success: true });
  });

  return app;
}

// ── Shared fetch proxy logic ───────────────────────────

async function proxyFetch(c: any) {
  try {
    const { url, method, headers, body } = await c.req.json();
    if (!url || typeof url !== 'string')
      return c.json({ success: false, error: 'url is required' }, 400);

    const resp = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      ...(body
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {}),
    });

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();

    return c.json({
      success: true,
      status: resp.status,
      contentType,
      body: text,
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 502);
  }
}

// ── Helpers ────────────────────────────────────────────

function extractPluginName(source: string): string {
  if (
    source.startsWith('git@') ||
    source.includes('.git') ||
    source.startsWith('https://')
  ) {
    const match = source.split('#')[0].match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  }
  return source.split('/').pop() || 'unknown';
}

async function loadProviders(
  pluginsDir: string,
  pluginName: string,
  manifest: any,
  logger: any,
): Promise<number> {
  if (!manifest.providers) return 0;

  const {
    registerProvider,
    registerBrandingProvider,
    registerSettingsProvider,
    registerAuthProvider,
    registerUserIdentityProvider,
    registerUserDirectoryProvider,
    registerAgentRegistryProvider,
    registerIntegrationRegistryProvider,
    registerOnboardingProvider,
  } = await import('../providers/registry.js');
  let loaded = 0;

  for (const p of manifest.providers) {
    const modulePath = join(pluginsDir, pluginName, p.module);
    if (!existsSync(modulePath)) continue;

    try {
      // JSON files for registry types → auto-wrap with JsonManifestRegistryProvider
      if (
        modulePath.endsWith('.json') &&
        (p.type === 'agentRegistry' || p.type === 'integrationRegistry')
      ) {
        const { JsonManifestRegistryProvider } = await import(
          '../providers/json-manifest-registry.js'
        );
        const { dirname } = await import('node:path');
        const instance = new JsonManifestRegistryProvider(
          modulePath,
          dirname(pluginsDir),
        );
        if (p.type === 'agentRegistry') registerAgentRegistryProvider(instance);
        else registerIntegrationRegistryProvider(instance);
        loaded++;
        continue;
      }

      const fileUrl = `file://${modulePath}?t=${Date.now()}`;
      const mod = await import(fileUrl);
      const factory = mod.default || mod;
      const instance = typeof factory === 'function' ? factory() : factory;

      if (p.type === 'auth') registerAuthProvider(instance);
      else if (p.type === 'userIdentity')
        registerUserIdentityProvider(instance);
      else if (p.type === 'userDirectory')
        registerUserDirectoryProvider(instance);
      else if (p.type === 'agentRegistry')
        registerAgentRegistryProvider(instance);
      else if (p.type === 'integrationRegistry')
        registerIntegrationRegistryProvider(instance);
      else if (p.type === 'onboarding')
        registerOnboardingProvider(
          instance,
          manifest.displayName || pluginName,
        );
      else if (p.type === 'branding') registerBrandingProvider(instance);
      else if (p.type === 'settings') registerSettingsProvider(instance);
      else
        registerProvider(p.type, instance, {
          layout: p.layout,
          source: pluginName,
        });

      loaded++;
    } catch (e: any) {
      logger.error('Failed to load provider', {
        plugin: pluginName,
        type: p.type,
        error: e.message,
      });
    }
  }

  return loaded;
}
