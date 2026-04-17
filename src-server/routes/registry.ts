/**
 * Registry Routes — browse, install, and uninstall agents and tools
 * from pluggable registry providers.
 */

import { Hono } from 'hono';
import type { ConfigLoader } from '../domain/config-loader.js';
import {
  getAgentRegistryProvider,
  getIntegrationRegistryProvider,
  getPluginRegistryProviders,
  getSkillRegistryProviders,
} from '../providers/registry.js';
import type { SkillService } from '../services/skill-service.js';
import { registryOps } from '../telemetry/metrics.js';
import {
  getBody,
  param,
  registryInstallSchema,
  skillInstallSchema,
  validate,
} from './schemas.js';

export function createRegistryRoutes(
  configLoader: ConfigLoader,
  refreshACPModes: () => Promise<void>,
  reloadSkills?: () => Promise<void>,
  skillService?: SkillService,
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

  app.post('/agents/install', validate(registryInstallSchema), async (c) => {
    const { id } = getBody(c);
    registryOps.add(1, { operation: 'install-agent', item: id });

    const result = await getAgentRegistryProvider().install(id);
    if (result.success) {
      // Refresh ACP modes so the new agent appears
      await refreshACPModes().catch(() => {});
    }
    return c.json(result, result.success ? 200 : 500);
  });

  app.delete('/agents/:id', async (c) => {
    const id = param(c, 'id');
    registryOps.add(1, { operation: 'uninstall-agent', item: id });
    const result = await getAgentRegistryProvider().uninstall(id);
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

  app.post(
    '/integrations/install',
    validate(registryInstallSchema),
    async (c) => {
      const { id } = getBody(c);
      registryOps.add(1, { operation: 'install-integration', item: id });

      const result = await getIntegrationRegistryProvider().install(id);
      if (!result.success) return c.json(result, 500);

      // Auto-generate integration.json from provider metadata
      const toolDef = await getIntegrationRegistryProvider().getToolDef(id);
      if (toolDef) {
        await configLoader.saveIntegration(toolDef.id, toolDef);
      }

      return c.json(result);
    },
  );

  app.delete('/integrations/:id', async (c) => {
    const id = param(c, 'id');
    registryOps.add(1, { operation: 'uninstall-integration', item: id });
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
    const entries = getSkillRegistryProviders();
    if (entries.length === 0) return c.json({ success: true, data: [] });
    const results = await Promise.all(
      entries.map(async (e) => e.provider.listAvailable()),
    );
    const seen = new Set<string>();
    const data = results.flat().filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return c.json({ success: true, data });
  });

  app.get('/skills/installed', async (c) => {
    registryOps.add(1, { operation: 'list-skills-installed' });
    const data = skillService ? skillService.listSkills() : [];
    return c.json({ success: true, data });
  });

  app.post('/skills/install', validate(skillInstallSchema), async (c) => {
    const { id } = getBody(c);
    registryOps.add(1, { operation: 'install-skill', item: id });
    if (!skillService)
      return c.json(
        { success: false, message: 'SkillService not available' },
        500,
      );
    const result = await skillService.installSkill(
      id,
      configLoader.getProjectHomeDir(),
    );
    if (result.success && reloadSkills) await reloadSkills().catch(() => {});
    return c.json(result, result.success ? 200 : 500);
  });

  app.delete('/skills/:id', async (c) => {
    const id = param(c, 'id');
    registryOps.add(1, { operation: 'uninstall-skill', item: id });
    if (!skillService)
      return c.json(
        { success: false, message: 'SkillService not available' },
        500,
      );
    const result = await skillService.removeSkill(
      id,
      configLoader.getProjectHomeDir(),
    );
    if (result.success && reloadSkills) await reloadSkills().catch(() => {});
    return c.json(result, result.success ? 200 : 500);
  });

  app.post('/skills/:id/update', async (c) => {
    const id = param(c, 'id');
    registryOps.add(1, { operation: 'update-skill', item: id });
    if (!skillService)
      return c.json(
        { success: false, message: 'SkillService not available' },
        500,
      );
    const unresult = await skillService.removeSkill(
      id,
      configLoader.getProjectHomeDir(),
    );
    if (!unresult.success) return c.json(unresult, 500);
    const result = await skillService.installSkill(
      id,
      configLoader.getProjectHomeDir(),
    );
    if (result.success && reloadSkills) await reloadSkills().catch(() => {});
    return c.json(result, result.success ? 200 : 500);
  });

  app.get('/skills/:id/content', async (c) => {
    const id = param(c, 'id');
    for (const { provider } of getSkillRegistryProviders()) {
      if (!provider.getContent) continue;
      const body = await provider.getContent(id);
      if (body) return c.json({ success: true, data: body });
    }
    return c.json({ success: false, error: 'Skill not found' }, 404);
  });

  // ── Plugin Registry ──────────────────────────────────────

  app.get('/plugins', async (c) => {
    registryOps.add(1, { operation: 'list-plugins' });
    const entries = getPluginRegistryProviders();
    if (entries.length === 0) return c.json({ success: true, data: [] });
    const results = await Promise.all(
      entries.map(async (e) => {
        const items = await e.provider.listAvailable();
        return items.map((item) => ({ ...item, source: e.source }));
      }),
    );
    return c.json({ success: true, data: results.flat() });
  });

  app.get('/plugins/installed', async (c) => {
    registryOps.add(1, { operation: 'list-plugins-installed' });
    const entries = getPluginRegistryProviders();
    if (entries.length === 0) return c.json({ success: true, data: [] });
    const results = await Promise.all(
      entries.map(async (e) => e.provider.listInstalled()),
    );
    return c.json({ success: true, data: results.flat() });
  });

  app.post('/plugins/install', validate(registryInstallSchema), async (c) => {
    const { id } = getBody(c);
    registryOps.add(1, { operation: 'install-plugin', item: id });
    const entries = getPluginRegistryProviders();
    for (const e of entries) {
      const result = await e.provider.install(id);
      if (result.success) return c.json(result);
    }
    return c.json(
      { success: false, message: `No provider could install ${id}` },
      500,
    );
  });

  app.delete('/plugins/:id', async (c) => {
    const id = param(c, 'id');
    registryOps.add(1, { operation: 'uninstall-plugin', item: id });
    const entries = getPluginRegistryProviders();
    for (const e of entries) {
      const result = await e.provider.uninstall(id);
      if (result.success) return c.json(result);
    }
    return c.json(
      { success: false, message: `No provider could uninstall ${id}` },
      500,
    );
  });

  return app;
}
