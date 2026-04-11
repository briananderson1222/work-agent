import { Hono } from 'hono';
import { ACPStatus } from '@stallion-ai/contracts/acp';
import { listProviders } from '../providers/registry.js';
import type { RuntimeContext } from '../runtime/types.js';
import { acpOps } from '../telemetry/metrics.js';
import { acpConnectionSchema, getBody, param, validate } from './schemas.js';

export function createACPRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  app.get('/status', (c) => {
    return c.json({ success: true, data: ctx.acpBridge.getStatus() });
  });

  app.get('/commands/:slug', (c) => {
    const slug = param(c, 'slug');
    return c.json({
      success: true,
      data: ctx.acpBridge.getSlashCommands(slug),
    });
  });

  app.get('/commands/:slug/options', async (c) => {
    const slug = param(c, 'slug');
    const partial = c.req.query('q') || '';
    const options = await ctx.acpBridge.getCommandOptions(slug, partial);
    return c.json({ success: true, data: options });
  });

  app.get('/connections', async (c) => {
    const config = await ctx.configLoader.loadACPConfig();
    const providerConns = listProviders('acpConnections').flatMap((e: any) =>
      (e.provider.getConnections?.() || []).map((conn: any) => ({
        ...conn,
        source: 'plugin' as const,
      })),
    );
    const configIds = new Set(config.connections.map((c) => c.id));
    const allConnections = [
      ...config.connections,
      ...providerConns.filter((c: any) => !configIds.has(c.id)),
    ];
    const status = ctx.acpBridge.getStatus();
    const connections = allConnections.map((cfg) => ({
      ...cfg,
      ...(status.connections.find((s) => s.id === cfg.id) || {
        status: ACPStatus.UNAVAILABLE,
        modes: [],
        sessionId: null,
        mcpServers: [],
      }),
    }));
    return c.json({ success: true, data: connections });
  });

  app.post('/connections', validate(acpConnectionSchema), async (c) => {
    const body = getBody(c);
    if (!body.id || !body.command) {
      return c.json(
        { success: false, error: 'id and command are required' },
        400,
      );
    }
    const config = await ctx.configLoader.loadACPConfig();
    if (config.connections.some((conn) => conn.id === body.id)) {
      return c.json(
        { success: false, error: `Connection '${body.id}' already exists` },
        409,
      );
    }
    const newConn = {
      id: body.id,
      name: body.name || body.id,
      command: body.command,
      args: body.args || [],
      icon: body.icon || '🔌',
      cwd: body.cwd,
      enabled: body.enabled !== false,
    };
    config.connections.push(newConn);
    await ctx.configLoader.saveACPConfig(config);
    if (newConn.enabled) await ctx.acpBridge.addConnection(newConn);
    acpOps.add(1, { op: 'create' });
    return c.json({ success: true, data: newConn });
  });

  app.put(
    '/connections/:id',
    validate(acpConnectionSchema.partial()),
    async (c) => {
      const id = param(c, 'id');
      const body = getBody(c);
      const config = await ctx.configLoader.loadACPConfig();
      const idx = config.connections.findIndex((conn) => conn.id === id);
      if (idx === -1)
        return c.json({ success: false, error: 'Connection not found' }, 404);
      config.connections[idx] = { ...config.connections[idx], ...body, id };
      await ctx.configLoader.saveACPConfig(config);
      await ctx.acpBridge.removeConnection(id);
      if (config.connections[idx].enabled)
        await ctx.acpBridge.addConnection(config.connections[idx]);
      acpOps.add(1, { op: 'update' });
      return c.json({ success: true, data: config.connections[idx] });
    },
  );

  app.delete('/connections/:id', async (c) => {
    const id = param(c, 'id');
    const config = await ctx.configLoader.loadACPConfig();
    config.connections = config.connections.filter((conn) => conn.id !== id);
    await ctx.configLoader.saveACPConfig(config);
    await ctx.acpBridge.removeConnection(id);
    acpOps.add(1, { op: 'delete' });
    return c.json({ success: true });
  });

  app.post('/connections/:id/reconnect', async (c) => {
    const id = param(c, 'id');
    const result = await ctx.acpBridge.reconnect(id);
    return c.json({ success: result });
  });

  return app;
}
