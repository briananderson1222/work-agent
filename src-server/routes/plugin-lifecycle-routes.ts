import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { copyPluginIntegrations } from '@stallion-ai/shared/parsers';
import { Hono } from 'hono';
import { getAgentRegistryProvider } from '../providers/registry.js';
import { isContextSafetyError } from '../services/context-safety.js';
import {
  readPluginManifestFile,
  readPluginManifestFileSync,
} from '../services/plugin-manifest-loader.js';
import { pluginUpdates } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import { uninstallInstalledPlugin } from './plugin-install-shared.js';
import { loadPluginProviders } from './plugin-loader.js';
import { errorMessage, param } from './schemas.js';

const execFile = promisify(execFileCb);

interface PluginLifecycleRouteDeps {
  agentsDir: string;
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
  logger: Logger;
  pluginsDir: string;
  projectHomeDir: string;
  buildPlugin: (pluginDir: string, name: string) => Promise<void>;
}

export function registerPluginLifecycleRoutes(
  app: Hono,
  deps: PluginLifecycleRouteDeps,
): void {
  const {
    agentsDir,
    buildPlugin,
    eventBus,
    logger,
    pluginsDir,
    projectHomeDir,
  } = deps;

  app.get('/check-updates', async (c) => {
    const updates: Array<{
      name: string;
      currentVersion: string;
      latestVersion: string;
      source: string;
    }> = [];

    try {
      if (existsSync(pluginsDir)) {
        const { readdirSync } = await import('node:fs');
        const entries = readdirSync(pluginsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dir = join(pluginsDir, entry.name);
          const gitDir = join(dir, '.git');
          const manifestPath = join(dir, 'plugin.json');
          if (!existsSync(gitDir) || !existsSync(manifestPath)) continue;

          try {
            await execFile('git', ['fetch', '--quiet'], {
              cwd: dir,
              timeout: 10000,
              windowsHide: true,
            });
            const { stdout: behind } = await execFile(
              'git',
              ['rev-list', '--count', 'HEAD..@{u}'],
              { cwd: dir, encoding: 'utf-8', windowsHide: true },
            );
            if (parseInt(behind.trim(), 10) > 0) {
              const manifest = readPluginManifestFileSync(manifestPath);
              const commitsBehind = behind.trim();
              updates.push({
                name: entry.name,
                currentVersion: manifest.version || 'unknown',
                latestVersion: `${commitsBehind} commit${commitsBehind === '1' ? '' : 's'} behind`,
                source: 'git',
              });
            }
          } catch (error) {
            logger.debug('Failed to check git updates for plugin', {
              plugin: entry.name,
              error,
            });
          }
        }
      }

      try {
        const registryProvider = getAgentRegistryProvider();
        const [available, installed] = await Promise.all([
          registryProvider.listAvailable(),
          registryProvider.listInstalled(),
        ]);
        for (const installedPlugin of installed) {
          if (updates.some((update) => update.name === installedPlugin.id)) {
            continue;
          }
          const availablePlugin = available.find(
            (plugin) => plugin.id === installedPlugin.id,
          );
          if (
            availablePlugin?.version &&
            availablePlugin.version !== installedPlugin.version
          ) {
            updates.push({
              name: installedPlugin.id,
              currentVersion: installedPlugin.version || 'unknown',
              latestVersion: availablePlugin.version,
              source: 'registry',
            });
          }
        }
      } catch (error) {
        logger.debug('Failed to check registry for plugin updates', { error });
      }

      return c.json({ updates });
    } catch (error: unknown) {
      logger.error('Failed to check for updates', {
        error: errorMessage(error),
      });
      return c.json({ updates: [] });
    }
  });

  app.post('/:name/update', async (c) => {
    const name = param(c, 'name');
    const pluginDir = join(pluginsDir, name);

    if (!existsSync(pluginDir)) {
      return c.json({ success: false, error: 'Plugin not found' }, 404);
    }

    try {
      const gitDir = join(pluginDir, '.git');
      if (existsSync(gitDir)) {
        await execFile('git', ['pull', '--ff-only'], {
          cwd: pluginDir,
          timeout: 30000,
          windowsHide: true,
        });
      } else {
        const registryProvider = getAgentRegistryProvider();
        const result = await registryProvider.install(name);
        if (!result.success) {
          return c.json({ success: false, error: result.message }, 400);
        }
      }

      const manifestPath = join(pluginDir, 'plugin.json');
      const manifest = await readPluginManifestFile(manifestPath);

      await buildPlugin(pluginDir, name);
      copyPluginIntegrations(pluginDir, join(projectHomeDir, 'integrations'));

      if (manifest.providers?.length) {
        await loadPluginProviders(
          pluginsDir,
          manifest.name || name,
          manifest,
          logger,
        );
      }

      eventBus?.emit('plugins:updated', { name, version: manifest.version });
      pluginUpdates.add(1, { plugin: name });

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          version: manifest.version,
        },
      });
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ success: false, error: error.message }, 400);
      }
      logger.error('Plugin update failed', {
        plugin: name,
        error: errorMessage(error),
      });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.delete('/:name', async (c) => {
    const name = param(c, 'name');
    const pluginDir = join(pluginsDir, name);

    if (!existsSync(pluginDir)) {
      return c.json({ success: false, error: 'Plugin not found' }, 404);
    }

    try {
      await uninstallInstalledPlugin(name, {
        agentsDir,
        buildPlugin,
        eventBus,
        logger,
        pluginsDir,
        projectHomeDir,
      });
      return c.json({ success: true });
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ success: false, error: error.message }, 400);
      }
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/reload', async (c) => {
    try {
      if (!existsSync(pluginsDir)) {
        return c.json({ success: true, loaded: 0 });
      }

      const { clearPluginProviders } = await import('../providers/registry.js');
      const { resolvePluginProviders } = await import(
        '../providers/resolver.js'
      );
      const { ConfigLoader } = await import('../domain/config-loader.js');

      const configLoader = new ConfigLoader({ projectHomeDir });
      const overrides = await configLoader.loadPluginOverrides();

      clearPluginProviders();
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
        loaded += await loadPluginProviders(
          pluginsDir,
          entry.pluginName,
          {
            providers: [{ type: entry.type, module: entry.module }],
            displayName: entry.pluginName,
          } as PluginManifest,
          logger,
        );
      }

      return c.json({ success: true, loaded });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });
}
