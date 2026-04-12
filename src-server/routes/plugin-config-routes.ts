import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { isContextSafetyError } from '../services/context-safety.js';
import { readPluginManifestFileSync } from '../services/plugin-manifest-loader.js';
import { pluginSettingsUpdates } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  param,
  pluginOverridesSchema,
  pluginSettingsSchema,
  validate,
} from './schemas.js';

const execFile = promisify(execFileCb);

interface PluginConfigRouteDeps {
  pluginsDir: string;
  projectHomeDir: string;
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
}

export function registerPluginConfigRoutes(
  app: Hono,
  deps: PluginConfigRouteDeps,
): void {
  const { eventBus, pluginsDir, projectHomeDir } = deps;

  app.get('/:name/settings', async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const manifestPath = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifestPath)) {
      return c.json({ error: 'Plugin not found' }, 404);
    }

    try {
      const manifest = readPluginManifestFileSync(manifestPath);
      const schema = manifest.settings || [];

      const { ConfigLoader } = await import('../domain/config-loader.js');
      const configLoader = new ConfigLoader({ projectHomeDir });
      const overrides = await configLoader.loadPluginOverrides();
      const values = overrides[manifest.name || name]?.settings || {};

      const merged: Record<string, unknown> = {};
      for (const field of schema) {
        merged[field.key] = values[field.key] ?? field.default ?? null;
      }

      return c.json({ schema, values: merged });
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: errorMessage(error) }, 500);
    }
  });

  app.put('/:name/settings', validate(pluginSettingsSchema), async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const body = getBody(c);

    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();

    if (!overrides[name]) {
      overrides[name] = {};
    }
    overrides[name].settings = body.settings || {};
    await configLoader.savePluginOverrides(overrides);
    pluginSettingsUpdates.add(1, { plugin: name });
    eventBus?.emit('plugins:settings-changed', {
      name,
      settings: body.settings,
    });

    return c.json({ success: true });
  });

  app.get('/:name/changelog', async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const pluginDir = join(pluginsDir, name);
    if (!existsSync(pluginDir)) {
      return c.json({ error: 'Plugin not found' }, 404);
    }

    const isGit = existsSync(join(pluginDir, '.git'));
    if (!isGit) {
      return c.json({ entries: [], source: 'local' });
    }

    try {
      const { stdout } = await execFile(
        'git',
        [
          'log',
          '--oneline',
          '--no-decorate',
          '-20',
          '--format=%H|%h|%s|%an|%aI',
        ],
        { cwd: pluginDir, encoding: 'utf-8', windowsHide: true },
      );

      const entries = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, short, subject, author, date] = line.split('|');
          return { hash, short, subject, author, date };
        });

      const changelogPath = join(pluginDir, 'CHANGELOG.md');
      const changelog = existsSync(changelogPath)
        ? await readFile(changelogPath, 'utf-8')
        : null;

      return c.json({ entries, source: 'git', changelog });
    } catch (error: unknown) {
      return c.json({ entries: [], source: 'git', error: errorMessage(error) });
    }
  });

  app.get('/:name/providers', async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const pluginDir = join(pluginsDir, name);
    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      return c.json({ error: 'Plugin not found' }, 404);
    }

    try {
      const manifest = readPluginManifestFileSync(manifestPath);
      const { ConfigLoader } = await import('../domain/config-loader.js');
      const configLoader = new ConfigLoader({ projectHomeDir });
      const overrides = await configLoader.loadPluginOverrides();
      const disabled = overrides[manifest.name || name]?.disabled ?? [];

      const providers = (manifest.providers || []).map((provider) => ({
        type: provider.type,
        module: provider.module,
        layout: provider.layout ?? null,
        enabled: !disabled.includes(provider.type),
      }));

      return c.json({ providers });
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: errorMessage(error) }, 500);
    }
  });

  app.get('/:name/overrides', async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();
    return c.json(overrides[name] ?? {});
  });

  app.put('/:name/overrides', validate(pluginOverridesSchema), async (c) => {
    const name = decodeURIComponent(param(c, 'name'));
    const body = getBody(c);
    const { ConfigLoader } = await import('../domain/config-loader.js');
    const configLoader = new ConfigLoader({ projectHomeDir });
    const overrides = await configLoader.loadPluginOverrides();
    overrides[name] = { disabled: body.disabled || [] };
    await configLoader.savePluginOverrides(overrides);
    return c.json({ success: true });
  });
}
