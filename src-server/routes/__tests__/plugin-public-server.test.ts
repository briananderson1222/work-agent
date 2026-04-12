import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import {
  buildPluginRequestContext,
  createScopedPluginRequest,
} from '../plugin-public-server.js';

describe('plugin-public-server helpers', () => {
  test('createScopedPluginRequest strips the plugin prefix', async () => {
    const app = new Hono();
    app.get('/api/plugins/demo-plugin/ping', (c) => {
      const request = createScopedPluginRequest(c, 'demo-plugin');
      return c.json({ pathname: new URL(request.url).pathname });
    });

    const response = await app.request('/api/plugins/demo-plugin/ping');
    expect(await response.json()).toEqual({ pathname: '/ping' });
  });

  test('buildPluginRequestContext prefers incoming correlation ids', async () => {
    const app = new Hono();
    app.get('/demo-plugin/ping', (c) =>
      c.json(buildPluginRequestContext(c, 'demo-plugin')),
    );

    const response = await app.request('/demo-plugin/ping', {
      headers: { 'x-request-id': 'req-123' },
    });
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        correlationId: 'req-123',
        method: 'GET',
        pluginName: 'demo-plugin',
        path: '/demo-plugin/ping',
      }),
    );
  });
});
