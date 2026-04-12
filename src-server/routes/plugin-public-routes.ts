import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type { Context, Hono as HonoType } from 'hono';
import { Hono } from 'hono';
import { isContextSafetyError } from '../services/context-safety.js';
import { readPluginManifestFile } from '../services/plugin-manifest-loader.js';
import {
  getPluginGrants,
  grantPermissions,
  hasGrant,
} from '../services/plugin-permissions.js';
import {
  pluginServerRequestDuration,
  pluginServerRequests,
} from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import { resolvePluginBundle } from './plugin-bundles.js';
import {
  errorMessage,
  getBody,
  param,
  pluginFetchSchema,
  pluginGrantSchema,
  validate,
} from './schemas.js';

interface PluginPublicRouteDeps {
  pluginsDir: string;
  projectHomeDir: string;
  logger: Logger;
}

interface PluginServerRequestContext {
  correlationId: string;
  method: string;
  path: string;
  pluginName: string;
  startedAt: number;
}

interface PluginServerHooks {
  onError?: (
    context: PluginServerRequestContext & { error: unknown },
  ) => void | Promise<void>;
  onRequest?: (context: PluginServerRequestContext) => void | Promise<void>;
  onResponse?: (
    context: PluginServerRequestContext & { status: number },
  ) => void | Promise<void>;
}

interface PluginServerModuleContext {
  config: {
    all: () => Record<string, unknown>;
    get: (key: string) => unknown;
  };
  logger: Logger;
  pluginName: string;
  projectHomeDir: string;
}

interface LoadedPluginServerModule {
  hooks?: PluginServerHooks;
  register: (
    app: HonoType,
    context: PluginServerModuleContext,
  ) => void | Promise<void>;
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
    try {
      const manifest = await readPluginManifestFile(manifestPath);
      const declared = manifest.permissions || [];
      const granted = getPluginGrants(projectHomeDir, name);
      return c.json({ declared, granted });
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ success: false, error: error.message }, 400);
      }
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
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

  app.all('/:name/*', async (c) => {
    const name = param(c, 'name');
    let manifest: PluginManifest | null;
    try {
      manifest = await readPluginManifest(pluginsDir, name);
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json({ success: false, error: error.message }, 400);
      }
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
    if (!manifest?.serverModule) {
      return c.json({ success: false, error: 'Plugin route not found' }, 404);
    }

    const loaded = await loadPluginServerModule(
      pluginsDir,
      name,
      manifest,
      logger,
    );
    if (!loaded) {
      return c.json({ success: false, error: 'Plugin route not found' }, 404);
    }

    const configValues = await readPluginSettings(
      projectHomeDir,
      name,
      manifest,
    );
    const routeApp = new Hono();
    const requestContext = buildRequestContext(c, name);
    const moduleContext: PluginServerModuleContext = {
      config: {
        all: () => ({ ...configValues }),
        get: (key: string) => configValues[key],
      },
      logger,
      pluginName: name,
      projectHomeDir,
    };

    routeApp.use('*', async (subc, next) => {
      await loaded.hooks?.onRequest?.(requestContext);
      await next();
      await loaded.hooks?.onResponse?.({
        ...requestContext,
        status: subc.res.status,
      });
    });

    try {
      await loaded.register(routeApp, moduleContext);
      const routed = await routeApp.fetch(createScopedRequest(c, name));
      const headers = new Headers(routed.headers);
      headers.set('x-stallion-correlation-id', requestContext.correlationId);
      pluginServerRequests.add(1, {
        method: requestContext.method,
        plugin: name,
        status: String(routed.status),
      });
      pluginServerRequestDuration.record(
        Date.now() - requestContext.startedAt,
        {
          method: requestContext.method,
          plugin: name,
        },
      );
      return new Response(routed.body, {
        headers,
        status: routed.status,
        statusText: routed.statusText,
      });
    } catch (error: unknown) {
      await loaded.hooks?.onError?.({ ...requestContext, error });
      pluginServerRequests.add(1, {
        method: requestContext.method,
        plugin: name,
        status: '500',
      });
      pluginServerRequestDuration.record(
        Date.now() - requestContext.startedAt,
        {
          method: requestContext.method,
          plugin: name,
        },
      );
      logger.error('Plugin server route failed', {
        correlationId: requestContext.correlationId,
        error: errorMessage(error),
        path: requestContext.path,
        plugin: name,
      });
      return c.json(
        {
          correlationId: requestContext.correlationId,
          error: errorMessage(error),
          success: false,
        },
        500,
      );
    }
  });
}

function buildRequestContext(
  c: Context,
  pluginName: string,
): PluginServerRequestContext {
  return {
    correlationId:
      c.req.header('x-stallion-correlation-id') ||
      c.req.header('x-request-id') ||
      randomUUID(),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    pluginName,
    startedAt: Date.now(),
  };
}

function createScopedRequest(c: Context, pluginName: string): Request {
  const url = new URL(c.req.url);
  const prefixes = [
    `/api/plugins/${encodeURIComponent(pluginName)}`,
    `/${encodeURIComponent(pluginName)}`,
  ];
  const matchedPrefix = prefixes.find((prefix) =>
    url.pathname.startsWith(prefix),
  );
  url.pathname = matchedPrefix
    ? url.pathname.slice(matchedPrefix.length) || '/'
    : '/';
  return new Request(url, c.req.raw.clone());
}

async function readPluginManifest(
  pluginsDir: string,
  pluginName: string,
): Promise<PluginManifest | null> {
  const manifestPath = join(pluginsDir, pluginName, 'plugin.json');
  if (!existsSync(manifestPath)) return null;
  return readPluginManifestFile(manifestPath);
}

async function readPluginSettings(
  projectHomeDir: string,
  pluginName: string,
  manifest: PluginManifest,
): Promise<Record<string, unknown>> {
  const { ConfigLoader } = await import('../domain/config-loader.js');
  const configLoader = new ConfigLoader({ projectHomeDir });
  const overrides = await configLoader.loadPluginOverrides();
  const values = overrides[pluginName]?.settings || {};
  const merged: Record<string, unknown> = {};
  for (const field of manifest.settings || []) {
    merged[field.key] = values[field.key] ?? field.default ?? null;
  }
  for (const [key, value] of Object.entries(values)) {
    merged[key] = value;
  }
  return merged;
}

async function loadPluginServerModule(
  pluginsDir: string,
  pluginName: string,
  manifest: PluginManifest,
  logger: Logger,
): Promise<LoadedPluginServerModule | null> {
  if (!manifest.serverModule) return null;
  const modulePath = join(pluginsDir, pluginName, manifest.serverModule);
  if (!existsSync(modulePath)) {
    logger.warn('Plugin serverModule missing', {
      modulePath,
      plugin: pluginName,
    });
    return null;
  }

  const moduleUrl = `file://${modulePath}?mtime=${statSync(modulePath).mtimeMs}`;
  const loaded = await import(moduleUrl);
  const candidate = loaded.default || loaded;
  const hooks = (candidate?.hooks || loaded.hooks) as
    | PluginServerHooks
    | undefined;
  const register =
    typeof candidate === 'function'
      ? candidate
      : typeof candidate?.register === 'function'
        ? candidate.register.bind(candidate)
        : typeof loaded.register === 'function'
          ? loaded.register.bind(loaded)
          : null;

  if (!register) {
    logger.warn('Plugin serverModule missing register function', {
      modulePath,
      plugin: pluginName,
    });
    return null;
  }

  return { hooks, register };
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
