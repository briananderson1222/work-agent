import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  getPluginGrants,
  grantPermissions,
  hasGrant,
} from '../services/plugin-permissions.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage, getBody, param, pluginFetchSchema, pluginGrantSchema, validate } from './schemas.js';
import { resolvePluginBundle } from './plugin-bundles.js';

interface PluginPublicRouteDeps {
  pluginsDir: string;
  projectHomeDir: string;
  logger: Logger;
}

export function registerPluginPublicRoutes(
  app: Hono,
  deps: PluginPublicRouteDeps,
): void {
  const { logger, pluginsDir, projectHomeDir } = deps;

  app.get('/:name/bundle.js', async (c) => {
    const bundlePath = resolvePluginBundle(
      pluginsDir,
      param(c, 'name'),
      'bundle.js',
      logger,
    );
    if (!bundlePath) return c.text('Bundle not found', 404);
    c.header('Content-Type', 'application/javascript');
    c.header('Cache-Control', 'no-cache');
    return c.text(await readFile(bundlePath, 'utf-8'));
  });

  app.get('/:name/bundle.css', async (c) => {
    const cssPath = resolvePluginBundle(
      pluginsDir,
      param(c, 'name'),
      'bundle.css',
      logger,
    );
    if (!cssPath) return c.text('', 200);
    c.header('Content-Type', 'text/css');
    c.header('Cache-Control', 'no-cache');
    c.header('Access-Control-Allow-Origin', '*');
    return c.text(await readFile(cssPath, 'utf-8'));
  });

  app.get('/:name/permissions', async (c) => {
    const name = param(c, 'name');
    const manifestPath = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifestPath)) {
      return c.json({ success: false, error: 'Plugin not found' }, 404);
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const declared = manifest.permissions || [];
    const granted = getPluginGrants(projectHomeDir, name);
    return c.json({ declared, granted });
  });

  app.post('/:name/grant', validate(pluginGrantSchema), async (c) => {
    const name = param(c, 'name');
    const { permissions } = getBody(c);
    if (!Array.isArray(permissions)) {
      return c.json(
        { success: false, error: 'permissions array required' },
        400,
      );
    }
    grantPermissions(projectHomeDir, name, permissions);
    return c.json({ success: true, granted: permissions });
  });

  app.post('/:name/fetch', validate(pluginFetchSchema), async (c) => {
    const name = param(c, 'name');
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

  app.post('/fetch', validate(pluginFetchSchema), async (c) => proxyFetch(c));
}

async function proxyFetch(c: Context) {
  try {
    const { url, method, headers, body } = getBody(c);
    if (!url || typeof url !== 'string') {
      return c.json({ success: false, error: 'url is required' }, 400);
    }

    const response = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      ...(body
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {}),
    });

    return c.json({
      success: true,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      body: await response.text(),
    });
  } catch (error: unknown) {
    return c.json({ success: false, error: errorMessage(error) }, 502);
  }
}
