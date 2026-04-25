import {
  type ACPConnectionConfig,
  type ACPConnectionRegistryEntry,
  ACPStatus,
} from '@stallion-ai/contracts/acp';
import { Hono } from 'hono';
import { listProviders } from '../providers/registry.js';
import type { RuntimeContext } from '../runtime/types.js';
import { acpOps } from '../telemetry/metrics.js';
import { acpConnectionSchema, getBody, param, validate } from './schemas.js';

function getProviderConnections(): ACPConnectionConfig[] {
  return listProviders('acpConnections').flatMap((entry: any) =>
    (entry.provider.getConnections?.() || []).map((conn: any) => ({
      ...conn,
      source: 'plugin' as const,
    })),
  );
}

function mergeACPConnections(
  configConnections: ACPConnectionConfig[],
  providerConnections: ACPConnectionConfig[],
): ACPConnectionConfig[] {
  const configIds = new Set(
    configConnections.map((connection) => connection.id),
  );
  return [
    ...configConnections,
    ...providerConnections.filter(
      (connection) => !configIds.has(connection.id),
    ),
  ];
}

function getRegistryEntries(
  installedConnections: ACPConnectionConfig[],
): ACPConnectionRegistryEntry[] {
  const installedSources = new Map<string, 'user' | 'plugin'>();
  for (const connection of installedConnections) {
    if (!installedSources.has(connection.id)) {
      installedSources.set(
        connection.id,
        connection.source === 'plugin' ? 'plugin' : 'user',
      );
    }
  }

  const entriesById = new Map<string, ACPConnectionRegistryEntry>();
  for (const entry of listProviders('acpConnectionRegistry')) {
    const source = entry.builtin ? 'core' : 'plugin';
    const available = entry.provider.listAvailable?.() || [];
    for (const registryEntry of available) {
      entriesById.set(registryEntry.id, {
        ...registryEntry,
        source,
        sourceName: registryEntry.sourceName ?? entry.source,
        installed: installedSources.has(registryEntry.id),
        installedSource: installedSources.get(registryEntry.id),
      });
    }
  }
  return Array.from(entriesById.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function findRegistryEntry(
  id: string,
  installedConnections: ACPConnectionConfig[],
): ACPConnectionRegistryEntry | null {
  return (
    getRegistryEntries(installedConnections).find((entry) => entry.id === id) ??
    null
  );
}

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
    const providerConns = getProviderConnections();
    const allConnections = mergeACPConnections(
      config.connections,
      providerConns,
    );
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

  app.get('/registry', async (c) => {
    const config = await ctx.configLoader.loadACPConfig();
    const entries = getRegistryEntries(
      mergeACPConnections(config.connections, getProviderConnections()),
    );
    return c.json({ success: true, data: entries });
  });

  app.post('/registry/:id/install', async (c) => {
    const id = param(c, 'id');
    const config = await ctx.configLoader.loadACPConfig();
    const providerConns = getProviderConnections();
    if (
      config.connections.some((conn) => conn.id === id) ||
      providerConns.some((conn) => conn.id === id)
    ) {
      return c.json(
        { success: false, error: `Connection '${id}' already exists` },
        409,
      );
    }

    const entry = findRegistryEntry(id, [
      ...config.connections,
      ...providerConns,
    ]);
    if (!entry) {
      return c.json(
        { success: false, error: `ACP registry entry '${id}' not found` },
        404,
      );
    }

    const newConn = {
      id: entry.id,
      name: entry.name,
      command: entry.command,
      args: entry.args || [],
      icon: entry.icon || '🔌',
      cwd: entry.cwd,
      enabled: true,
      interactive: entry.interactive,
    };
    config.connections.push(newConn);
    await ctx.configLoader.saveACPConfig(config);
    await ctx.acpBridge.addConnection(newConn);
    acpOps.add(1, { op: 'create' });
    return c.json({ success: true, data: newConn });
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
