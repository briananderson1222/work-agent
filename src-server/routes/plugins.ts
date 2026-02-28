/**
 * Plugin Routes — list, serve, install, remove, and reload plugins
 */

import { Hono } from 'hono';
import { readFile, readdir, mkdir, rm, cp, writeFile } from 'fs/promises';
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { EventBus } from '../services/event-bus.js';
import { getAgentRegistryProvider, getToolRegistryProvider } from '../providers/registry.js';
import { processInstallPermissions, grantPermissions, revokeAllGrants, hasGrant, getPluginGrants, getPermissionTier } from '../services/plugin-permissions.js';

export function createPluginRoutes(workAgentDir: string, logger: any, eventBus?: EventBus) {
  const app = new Hono();
  const pluginsDir = join(workAgentDir, 'plugins');
  const agentsDir = join(workAgentDir, 'agents');
  const workspacesDir = join(workAgentDir, 'workspaces');

  /** Run plugin build if build.mjs or build.sh exists */
  function buildPlugin(pluginDir: string, name: string) {
    const hasBuildMjs = existsSync(join(pluginDir, 'build.mjs'));
    const hasBuildSh = existsSync(join(pluginDir, 'build.sh'));
    if (!hasBuildMjs && !hasBuildSh) return;
    try {
      if (existsSync(join(pluginDir, 'package.json'))) {
        execSync('npm install --omit=dev --no-package-lock --legacy-peer-deps', { cwd: pluginDir, timeout: 60000, stdio: 'pipe' });
      }
      const cmd = hasBuildMjs ? 'node build.mjs' : 'bash build.sh';
      execSync(cmd, { cwd: pluginDir, timeout: 30000, stdio: 'pipe' });
      logger.info(`Plugin ${name}: build complete`);
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
            const hash = execSync('git rev-parse --short HEAD', { cwd: pluginDir, encoding: 'utf-8' }).trim();
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: pluginDir, encoding: 'utf-8' }).trim();
            let remote: string | undefined;
            try { remote = execSync('git remote get-url origin', { cwd: pluginDir, encoding: 'utf-8' }).trim(); } catch {}
            git = { hash, branch, remote };
          } catch {}
        }

        const declared = manifest.permissions || [];
        const granted = getPluginGrants(workAgentDir, manifest.name);
        const missing = declared
          .filter((p: string) => !granted.includes(p))
          .map((p: string) => ({ permission: p, tier: getPermissionTier(p) }));

        plugins.push({
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          description: manifest.description,
          hasBundle: existsSync(bundlePath),
          workspace: manifest.workspace,
          agents: manifest.agents,
          providers: manifest.providers,
          git,
          permissions: { declared, granted, missing },
        });
      } catch (e: any) {
        logger.error('Failed to read plugin manifest', { plugin: entry.name, error: e.message });
      }
    }

    return c.json({ plugins });
  });

  // ── Install plugin from git URL or local path ───────

  app.post('/install', async (c) => {
    try {
      const { source } = await c.req.json();
      if (!source) return c.json({ success: false, error: 'source is required' }, 400);

      const isGit = source.startsWith('git@') || source.endsWith('.git') ||
        (source.startsWith('https://') && (source.includes('.git') || source.includes('gitlab') || source.includes('github')));

      // Clone/copy to temp dir first, read manifest, then move to canonical name
      const tempName = extractPluginName(source);
      const tempDir = join(pluginsDir, '.installing-' + tempName);

      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      mkdirSync(tempDir, { recursive: true });

      // Clone or copy
      if (isGit) {
        const [url, branch] = source.split('#');
        const cloneArgs = ['clone', '--depth', '1'];
        if (branch) cloneArgs.push('--branch', branch);
        cloneArgs.push(url, tempDir);
        try {
          execSync(['git', ...cloneArgs].map(a => `"${a}"`).join(' '), { timeout: 30000 });
        } catch {
          rmSync(tempDir, { recursive: true, force: true });
          mkdirSync(tempDir, { recursive: true });
          execSync(`git clone --depth 1 "${url}" "${tempDir}"`, { timeout: 30000 });
        }
      } else {
        if (!existsSync(source)) { rmSync(tempDir, { recursive: true }); return c.json({ success: false, error: `Source not found: ${source}` }, 400); }
        cpSync(source, tempDir, { recursive: true });
      }

      const manifest = JSON.parse(await readFile(join(tempDir, 'plugin.json'), 'utf-8'));
      const pluginName = manifest.name || tempName;
      const pluginDir = join(pluginsDir, pluginName);

      // Move to canonical directory (removes old version if exists)
      if (existsSync(pluginDir) && pluginDir !== tempDir) rmSync(pluginDir, { recursive: true });
      if (tempDir !== pluginDir) {
        cpSync(tempDir, pluginDir, { recursive: true });
        rmSync(tempDir, { recursive: true });
      }

      // Install agents
      if (manifest.agents) {
        mkdirSync(agentsDir, { recursive: true });
        for (const agent of manifest.agents) {
          const slug = `${manifest.name}:${agent.slug}`;
          const src = join(pluginDir, 'agents', agent.slug);
          if (existsSync(src)) {
            cpSync(src, join(agentsDir, slug), { recursive: true });
          }
        }
      }

      // Install workspace config
      if (manifest.workspace) {
        mkdirSync(workspacesDir, { recursive: true });
        const src = join(pluginDir, manifest.workspace.source);
        if (existsSync(src)) {
          const wsDir = join(workspacesDir, manifest.workspace.slug);
          mkdirSync(wsDir, { recursive: true });
          cpSync(src, join(wsDir, 'workspace.json'));
        }
      }

      // Build plugin (if build script exists)
      buildPlugin(pluginDir, pluginName);

      // Load providers
      await loadProviders(pluginsDir, manifest.name, manifest, logger);

      // Resolve required tools
      const toolsDir = join(workAgentDir, 'tools');
      const requiredTools = manifest.tools?.required || [];
      const toolResults: Array<{ id: string; status: 'installed' | 'missing' | 'installed-now' }> = [];

      for (const toolId of requiredTools) {
        if (existsSync(join(toolsDir, toolId, 'tool.json'))) {
          toolResults.push({ id: toolId, status: 'installed' });
        } else {
          // Try to install from registry
          try {
            const registry = getToolRegistryProvider();
            const result = await registry.install(toolId);
            const toolDef = result.success ? await registry.getToolDef(toolId) : null;
            if (toolDef) {
              const toolDir = join(toolsDir, toolId);
              mkdirSync(toolDir, { recursive: true });
              writeFileSync(join(toolDir, 'tool.json'), JSON.stringify(toolDef, null, 2));
            }
            toolResults.push({ id: toolId, status: result.success ? 'installed-now' : 'missing' });
          } catch {
            toolResults.push({ id: toolId, status: 'missing' });
          }
        }
      }

      // Process permissions
      const { autoGranted, pendingConsent } = processInstallPermissions(
        workAgentDir, pluginName, manifest.permissions || [],
      );

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          hasBundle: existsSync(join(pluginDir, 'dist', 'bundle.js')),
        },
        tools: toolResults,
        permissions: { autoGranted, pendingConsent },
      });
    } catch (e: any) {
      logger.error('Plugin install failed', { error: e.message });
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Check for plugin updates ─────────────────────────

  app.get('/check-updates', async (c) => {
    const updates: Array<{ name: string; currentVersion: string; latestVersion: string; source: string }> = [];

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
            execSync('git fetch --quiet', { cwd: dir, timeout: 10000, stdio: 'pipe' });
            const local = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
            const remote = execSync('git rev-parse @{u}', { cwd: dir, encoding: 'utf-8' }).trim();
            if (local !== remote) {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
              updates.push({
                name: entry.name,
                currentVersion: manifest.version || 'unknown',
                latestVersion: 'newer commit available',
                source: 'git',
              });
            }
          } catch { /* no remote tracking, skip */ }
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
          if (updates.some(u => u.name === inst.id)) continue; // already found via git
          const avail = available.find(p => p.id === inst.id);
          if (avail && avail.version && avail.version !== inst.version) {
            updates.push({
              name: inst.id,
              currentVersion: inst.version || 'unknown',
              latestVersion: avail.version,
              source: 'registry',
            });
          }
        }
      } catch { /* no registry configured, that's fine */ }

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
      buildPlugin(pluginDir, name);

      // Emit SSE event
      eventBus?.emit('plugins:updated', { name, version: manifest.version });

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          version: manifest.version
        }
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

    if (!existsSync(pluginDir)) return c.json({ success: false, error: 'Plugin not found' }, 404);

    try {
      const manifest = JSON.parse(await readFile(join(pluginDir, 'plugin.json'), 'utf-8'));

      // Remove agents (preserve memory)
      if (manifest.agents) {
        for (const agent of manifest.agents) {
          const agentJson = join(agentsDir, `${name}:${agent.slug}`, 'agent.json');
          if (existsSync(agentJson)) rmSync(agentJson);
        }
      }

      // Remove workspace
      if (manifest.workspace) {
        const wsDir = join(workspacesDir, manifest.workspace.slug);
        if (existsSync(wsDir)) rmSync(wsDir, { recursive: true });
      }

      // Revoke permission grants
      revokeAllGrants(workAgentDir, name);

      // Remove plugin
      rmSync(pluginDir, { recursive: true });

      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Serve plugin bundle JS ───────────────────────────

  app.get('/:name/bundle.js', async (c) => {
    const bundlePath = join(pluginsDir, c.req.param('name'), 'dist', 'bundle.js');
    if (!existsSync(bundlePath)) return c.text('Bundle not found', 404);
    c.header('Content-Type', 'application/javascript');
    c.header('Cache-Control', 'no-cache');
    return c.text(await readFile(bundlePath, 'utf-8'));
  });

  // ── Serve plugin bundle CSS ──────────────────────────

  app.get('/:name/bundle.css', async (c) => {
    const cssPath = join(pluginsDir, c.req.param('name'), 'dist', 'bundle.css');
    if (!existsSync(cssPath)) return c.text('', 200);
    c.header('Content-Type', 'text/css');
    c.header('Cache-Control', 'no-cache');
    c.header('Access-Control-Allow-Origin', '*');
    return c.text(await readFile(cssPath, 'utf-8'));
  });

  // ── Plugin permissions ────────────────────────────────

  app.get('/:name/permissions', async (c) => {
    const name = c.req.param('name');
    const manifestPath = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifestPath)) return c.json({ success: false, error: 'Plugin not found' }, 404);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const declared = manifest.permissions || [];
    const granted = getPluginGrants(workAgentDir, name);
    return c.json({ declared, granted });
  });

  app.post('/:name/grant', async (c) => {
    const name = c.req.param('name');
    const { permissions } = await c.req.json();
    if (!Array.isArray(permissions)) return c.json({ success: false, error: 'permissions array required' }, 400);
    grantPermissions(workAgentDir, name, permissions);
    return c.json({ success: true, granted: permissions });
  });

  // ── Server-side fetch proxy for plugins ───────────────

  // Scoped route: checks permission grants
  app.post('/:name/fetch', async (c) => {
    const name = c.req.param('name');
    if (!hasGrant(workAgentDir, name, 'network.fetch')) {
      return c.json({ success: false, error: `Plugin '${name}' does not have network.fetch permission` }, 403);
    }
    return proxyFetch(c);
  });

  // Legacy unscoped route (no permission check — backward compat during migration)
  app.post('/fetch', async (c) => proxyFetch(c));

  // ── Reload providers ─────────────────────────────────

  app.post('/reload', async (c) => {
    try {
      if (!existsSync(pluginsDir)) return c.json({ success: true, loaded: 0 });

      let loaded = 0;
      const entries = await readdir(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(pluginsDir, entry.name, 'plugin.json');
        if (!existsSync(manifestPath)) continue;

        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        loaded += await loadProviders(pluginsDir, entry.name, manifest, logger);
      }

      return c.json({ success: true, loaded });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  return app;
}

// ── Shared fetch proxy logic ───────────────────────────

async function proxyFetch(c: any) {
  try {
    const { url, method, headers, body } = await c.req.json();
    if (!url || typeof url !== 'string') return c.json({ success: false, error: 'url is required' }, 400);

    const resp = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();

    return c.json({ success: true, status: resp.status, contentType, body: text });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 502);
  }
}

// ── Helpers ────────────────────────────────────────────

function extractPluginName(source: string): string {
  if (source.startsWith('git@') || source.includes('.git') || source.startsWith('https://')) {
    const match = source.split('#')[0].match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  }
  return source.split('/').pop() || 'unknown';
}

async function loadProviders(pluginsDir: string, pluginName: string, manifest: any, logger: any): Promise<number> {
  if (!manifest.providers) return 0;

  const { registerAuthProvider, registerUserIdentityProvider, registerUserDirectoryProvider, registerAgentRegistryProvider, registerToolRegistryProvider, registerOnboardingProvider } = await import('../providers/registry.js');
  let loaded = 0;

  for (const p of manifest.providers) {
    const modulePath = join(pluginsDir, pluginName, p.module);
    if (!existsSync(modulePath)) continue;

    try {
      const fileUrl = 'file://' + modulePath + '?t=' + Date.now();
      const mod = await import(fileUrl);
      const factory = mod.default || mod;
      const instance = typeof factory === 'function' ? factory() : factory;

      if (p.type === 'auth') registerAuthProvider(instance);
      else if (p.type === 'userIdentity') registerUserIdentityProvider(instance);
      else if (p.type === 'userDirectory') registerUserDirectoryProvider(instance);
      else if (p.type === 'agentRegistry') registerAgentRegistryProvider(instance);
      else if (p.type === 'toolRegistry') registerToolRegistryProvider(instance);
      else if (p.type === 'onboarding') registerOnboardingProvider(instance);

      loaded++;
    } catch (e: any) {
      logger.error('Failed to load provider', { plugin: pluginName, type: p.type, error: e.message });
    }
  }

  return loaded;
}
