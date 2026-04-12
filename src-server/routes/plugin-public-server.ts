import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type { Context, Hono as HonoType } from 'hono';
import { ConfigLoader } from '../domain/config-loader.js';
import { readPluginManifestFile } from '../services/plugin-manifest-loader.js';
import type { Logger } from '../utils/logger.js';

export interface PluginServerRequestContext {
  correlationId: string;
  method: string;
  path: string;
  pluginName: string;
  startedAt: number;
}

export interface PluginServerHooks {
  onError?: (
    context: PluginServerRequestContext & { error: unknown },
  ) => void | Promise<void>;
  onRequest?: (context: PluginServerRequestContext) => void | Promise<void>;
  onResponse?: (
    context: PluginServerRequestContext & { status: number },
  ) => void | Promise<void>;
}

export interface PluginServerModuleContext {
  config: {
    all: () => Record<string, unknown>;
    get: (key: string) => unknown;
  };
  logger: Logger;
  pluginName: string;
  projectHomeDir: string;
}

export interface LoadedPluginServerModule {
  hooks?: PluginServerHooks;
  register: (
    app: HonoType,
    context: PluginServerModuleContext,
  ) => void | Promise<void>;
}

export function buildPluginRequestContext(
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

export function createScopedPluginRequest(
  c: Context,
  pluginName: string,
): Request {
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

export async function readPluginPublicManifest(
  pluginsDir: string,
  pluginName: string,
): Promise<PluginManifest | null> {
  const manifestPath = join(pluginsDir, pluginName, 'plugin.json');
  if (!existsSync(manifestPath)) return null;
  return readPluginManifestFile(manifestPath);
}

export async function readPluginServerSettings(
  projectHomeDir: string,
  pluginName: string,
  manifest: PluginManifest,
): Promise<Record<string, unknown>> {
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

export async function loadPluginPublicServerModule(
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
