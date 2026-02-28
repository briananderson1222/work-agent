/**
 * Registry Routes — browse, install, and uninstall agents and tools
 * from pluggable registry providers.
 */

import { Hono } from 'hono';
import { getAgentRegistryProvider, getToolRegistryProvider } from '../providers/registry.js';
import type { ConfigLoader } from '../domain/config-loader.js';

export function createRegistryRoutes(
  configLoader: ConfigLoader,
  refreshACPModes: () => Promise<void>,
) {
  const app = new Hono();

  // ── Agent Registry ─────────────────────────────────────

  app.get('/agents', async (c) => {
    const items = await getAgentRegistryProvider().listAvailable();
    return c.json({ success: true, data: items });
  });

  app.get('/agents/installed', async (c) => {
    const items = await getAgentRegistryProvider().listInstalled();
    return c.json({ success: true, data: items });
  });

  app.post('/agents/install', async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);

    const result = await getAgentRegistryProvider().install(id);
    if (result.success) {
      // Refresh ACP modes so the new agent appears
      await refreshACPModes().catch(() => {});
    }
    return c.json(result, result.success ? 200 : 500);
  });

  app.delete('/agents/:id', async (c) => {
    const result = await getAgentRegistryProvider().uninstall(c.req.param('id'));
    if (result.success) {
      await refreshACPModes().catch(() => {});
    }
    return c.json(result, result.success ? 200 : 500);
  });

  // ── Tool Registry ──────────────────────────────────────

  app.get('/tools', async (c) => {
    const items = await getToolRegistryProvider().listAvailable();
    return c.json({ success: true, data: items });
  });

  app.get('/tools/installed', async (c) => {
    const items = await getToolRegistryProvider().listInstalled();
    return c.json({ success: true, data: items });
  });

  app.post('/tools/install', async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);

    const result = await getToolRegistryProvider().install(id);
    if (!result.success) return c.json(result, 500);

    // Auto-generate tool.json from provider metadata
    const toolDef = await getToolRegistryProvider().getToolDef(id);
    if (toolDef) {
      await configLoader.saveTool(toolDef.id, toolDef);
    }

    return c.json(result);
  });

  app.delete('/tools/:id', async (c) => {
    const id = c.req.param('id');
    const result = await getToolRegistryProvider().uninstall(id);
    return c.json(result, result.success ? 200 : 500);
  });

  app.post('/tools/sync', async (c) => {
    await getToolRegistryProvider().sync();
    return c.json({ success: true });
  });

  return app;
}
