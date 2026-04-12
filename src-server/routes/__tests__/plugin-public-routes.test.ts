import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { registerPluginPublicRoutes } from '../plugin-public-routes.js';

vi.mock('../../telemetry/metrics.js', () => ({
  pluginServerRequestDuration: { record: vi.fn() },
  pluginServerRequests: { add: vi.fn() },
}));

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs
      .splice(0, cleanupDirs.length)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
  delete (globalThis as any).__pluginServerEvents;
});

function writePlugin(root: string, relativePath: string, content: string) {
  const fullPath = join(root, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

function createApp(projectHomeDir: string) {
  const app = new Hono();
  registerPluginPublicRoutes(app, {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as any,
    pluginsDir: join(projectHomeDir, 'plugins'),
    projectHomeDir,
  });
  return app;
}

describe('plugin-public-routes', () => {
  test('dispatches plugin serverModule routes with a correlation id and merged settings', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-plugin-public-'));
    cleanupDirs.push(root);
    const projectHomeDir = root;
    const pluginDir = join(projectHomeDir, 'plugins', 'demo-plugin');
    mkdirSync(pluginDir, { recursive: true });

    writePlugin(
      pluginDir,
      'plugin.json',
      JSON.stringify(
        {
          name: 'demo-plugin',
          version: '1.0.0',
          serverModule: 'plugin.mjs',
          settings: [
            {
              key: 'accentColor',
              label: 'Accent Color',
              type: 'string',
              default: '#1d4ed8',
            },
          ],
        },
        null,
        2,
      ),
    );
    writePlugin(
      pluginDir,
      'plugin.mjs',
      `globalThis.__pluginServerEvents = globalThis.__pluginServerEvents || [];
export const hooks = {
  onRequest(context) {
    globalThis.__pluginServerEvents.push(['request', context.correlationId]);
  },
  onResponse(context) {
    globalThis.__pluginServerEvents.push(['response', context.correlationId, context.status]);
  },
};

export default function register(app, { config }) {
  app.get('/ping', (c) =>
    c.json({
      ok: true,
      accentColor: config.get('accentColor'),
    }),
  );
}
`,
    );

    const app = createApp(projectHomeDir);
    const response = await app.request('/demo-plugin/ping');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-stallion-correlation-id')).toBeTruthy();
    expect(body).toEqual({ ok: true, accentColor: '#1d4ed8' });
    expect((globalThis as any).__pluginServerEvents).toHaveLength(2);
    expect((globalThis as any).__pluginServerEvents[0][0]).toBe('request');
    expect((globalThis as any).__pluginServerEvents[1][0]).toBe('response');
    expect((globalThis as any).__pluginServerEvents[0][1]).toBe(
      (globalThis as any).__pluginServerEvents[1][1],
    );
  });

  test('returns 404 when the plugin has no serverModule', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-plugin-public-'));
    cleanupDirs.push(root);
    const pluginDir = join(root, 'plugins', 'plain-plugin');
    mkdirSync(pluginDir, { recursive: true });

    writePlugin(
      pluginDir,
      'plugin.json',
      JSON.stringify(
        {
          name: 'plain-plugin',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );

    const app = createApp(root);
    const response = await app.request('/plain-plugin/ping');
    expect(response.status).toBe(404);
  });

  test('rejects plugin manifests that contain hidden unicode channels', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-plugin-public-'));
    cleanupDirs.push(root);
    const pluginDir = join(root, 'plugins', 'unsafe-plugin');
    mkdirSync(pluginDir, { recursive: true });

    writePlugin(
      pluginDir,
      'plugin.json',
      JSON.stringify(
        {
          name: 'unsafe-plugin',
          version: '1.0.0',
          description: 'safe\u200Btext',
        },
        null,
        2,
      ),
    );

    const app = createApp(root);
    const response = await app.request('/unsafe-plugin/permissions');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Blocked potentially unsafe context/);
  });
});
