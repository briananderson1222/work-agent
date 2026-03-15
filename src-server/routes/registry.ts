/**
 * Registry Routes — browse, install, and uninstall agents and tools
 * from pluggable registry providers.
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import type { ConfigLoader } from '../domain/config-loader.js';
import {
  getAgentRegistryProvider,
  getIntegrationRegistryProvider,
  getSkillRegistryProvider,
} from '../providers/registry.js';
import { registryOps } from '../telemetry/metrics.js';

export function createRegistryRoutes(
  configLoader: ConfigLoader,
  refreshACPModes: () => Promise<void>,
) {
  const app = new Hono();

  // ── Agent Registry ─────────────────────────────────────

  app.get('/agents', async (c) => {
    registryOps.add(1, { operation: 'list-agents' });
    const items = await getAgentRegistryProvider().listAvailable();
    return c.json({ success: true, data: items });
  });

  app.get('/agents/installed', async (c) => {
    registryOps.add(1, { operation: 'list-agents-installed' });
    const items = await getAgentRegistryProvider().listInstalled();
    return c.json({ success: true, data: items });
  });

  app.post('/agents/install', async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);
    registryOps.add(1, { operation: 'install-agent', item: id });

    const result = await getAgentRegistryProvider().install(id);
    if (result.success) {
      // Refresh ACP modes so the new agent appears
      await refreshACPModes().catch(() => {});
    }
    return c.json(result, result.success ? 200 : 500);
  });

  app.delete('/agents/:id', async (c) => {
    registryOps.add(1, { operation: 'uninstall-agent', item: c.req.param('id') });
    const result = await getAgentRegistryProvider().uninstall(
      c.req.param('id'),
    );
    if (result.success) {
      await refreshACPModes().catch(() => {});
    }
    return c.json(result, result.success ? 200 : 500);
  });

  // ── Integration Registry ──────────────────────────────────────

  app.get('/integrations', async (c) => {
    registryOps.add(1, { operation: 'list-integrations' });
    const raw = await getIntegrationRegistryProvider().listAvailable();
    // Filter malformed entries, deduplicate, clean names
    const seen = new Set<string>();
    const items = raw
      .filter((i: any) => i.id && i.id.length > 2 && /^[a-z0-9]/.test(i.id))
      .filter((i: any) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .map((i: any) => ({
        ...i,
        displayName: (i.displayName || i.id)
          .replace(/\s*\[.*?\]\s*/g, '')
          .trim(),
        description:
          (i.description || '')
            .replace(/^#\s.*\n?/, '')
            .replace(/\\n/g, ' ')
            .trim() || undefined,
        source: i.source || 'AIM',
      }));
    return c.json({ success: true, data: items });
  });

  app.get('/integrations/installed', async (c) => {
    registryOps.add(1, { operation: 'list-integrations-installed' });
    const items = await getIntegrationRegistryProvider().listInstalled();
    return c.json({ success: true, data: items });
  });

  app.post('/integrations/install', async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);
    registryOps.add(1, { operation: 'install-integration', item: id });

    const result = await getIntegrationRegistryProvider().install(id);
    if (!result.success) return c.json(result, 500);

    // Auto-generate integration.json from provider metadata
    const toolDef = await getIntegrationRegistryProvider().getToolDef(id);
    if (toolDef) {
      await configLoader.saveIntegration(toolDef.id, toolDef);
    }

    return c.json(result);
  });

  app.delete('/integrations/:id', async (c) => {
    registryOps.add(1, { operation: 'uninstall-integration', item: c.req.param('id') });
    const id = c.req.param('id');
    const result = await getIntegrationRegistryProvider().uninstall(id);
    return c.json(result, result.success ? 200 : 500);
  });

  app.post('/integrations/sync', async (c) => {
    await getIntegrationRegistryProvider().sync();
    return c.json({ success: true });
  });

  // ── Skill Registry ──────────────────────────────────────

  app.get('/skills', async (c) => {
    registryOps.add(1, { operation: 'list-skills' });
    const provider = getSkillRegistryProvider();
    if (!provider) return c.json({ success: true, data: [] });
    const items = await provider.listAvailable();
    return c.json({ success: true, data: items });
  });

  app.post('/skills/install', async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);
    registryOps.add(1, { operation: 'install-skill', item: id });
    const { installSkill } = await import('../services/skill-service.js');
    const result = await installSkill(id, configLoader.getProjectHomeDir());
    return c.json(result, result.success ? 200 : 500);
  });

  app.delete('/skills/:id', async (c) => {
    const id = c.req.param('id');
    registryOps.add(1, { operation: 'uninstall-skill', item: id });
    const { uninstallSkill } = await import('../services/skill-service.js');
    const result = await uninstallSkill(id, configLoader.getProjectHomeDir());
    return c.json(result, result.success ? 200 : 500);
  });

  return app;
}
