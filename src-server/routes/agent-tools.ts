import { Hono } from 'hono';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RuntimeContext } from '../runtime/types.js';
import { addToolSchema, updateAllowedSchema, updateAliasesSchema, validate } from './schemas.js';

type ToolWithDescription = { description?: string; [key: string]: any };

export function createAgentToolRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  // GET /:slug/tools
  app.get('/:slug/tools', async (c) => {
    try {
      const slug = c.req.param('slug');
      if (!ctx.activeAgents.get(slug)) {
        return c.json({ success: false, error: 'Agent not found or not active' }, 404);
      }

      const tools = ctx.agentTools.get(slug) || [];
      const data = tools.map((tool: any) => {
        const mapping = ctx.toolNameMapping.get(tool.name);
        let parameters = tool.parameters;
        if (parameters && typeof parameters === 'object' && '_def' in parameters) {
          try { parameters = zodToJsonSchema(parameters); } catch (e) { console.debug('Failed to convert Zod schema:', e); }
        }
        return {
          id: tool.id || tool.name,
          name: tool.name,
          originalName: mapping?.original || tool.name,
          server: mapping?.server || null,
          toolName: mapping?.tool || tool.name,
          description: tool.description,
          parameters,
        };
      });

      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // POST /:slug/tools
  app.post('/:slug/tools', validate(addToolSchema), async (c) => {
    try {
      const slug = c.req.param('slug');
      const { toolId } = c.get('body');
      const agent = await ctx.configLoader.loadAgent(slug);
      const tools = agent.tools || { mcpServers: [], available: ['*'] };
      if (!tools.mcpServers.includes(toolId)) tools.mcpServers.push(toolId);
      await ctx.configLoader.updateAgent(slug, { tools });
      await ctx.initialize();
      return c.json({ success: true, data: tools.mcpServers });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // DELETE /:slug/tools/:toolId
  app.delete('/:slug/tools/:toolId', async (c) => {
    try {
      const slug = c.req.param('slug');
      const toolId = c.req.param('toolId');
      const agent = await ctx.configLoader.loadAgent(slug);
      const tools = agent.tools || { mcpServers: [] };
      tools.mcpServers = tools.mcpServers.filter((id: string) => id !== toolId);
      await ctx.configLoader.updateAgent(slug, { tools });
      await ctx.initialize();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // PUT /:slug/tools/allowed
  app.put('/:slug/tools/allowed', validate(updateAllowedSchema), async (c) => {
    try {
      const slug = c.req.param('slug');
      const { allowed } = c.get('body');
      const agent = await ctx.configLoader.loadAgent(slug);
      const tools = agent.tools || { mcpServers: [] };
      tools.available = allowed;
      await ctx.configLoader.updateAgent(slug, { tools });
      await ctx.initialize();
      return c.json({ success: true, data: tools });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // PUT /:slug/tools/aliases
  app.put('/:slug/tools/aliases', validate(updateAliasesSchema), async (c) => {
    try {
      const slug = c.req.param('slug');
      const { aliases } = c.get('body');
      const agent = await ctx.configLoader.loadAgent(slug);
      const tools = agent.tools || { mcpServers: [] };
      tools.aliases = aliases;
      await ctx.configLoader.updateAgent(slug, { tools });
      await ctx.initialize();
      return c.json({ success: true, data: tools });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // GET /:slug/health
  app.get('/:slug/health', async (c) => {
    const slug = c.req.param('slug');
    const agent = ctx.activeAgents.get(slug);

    if (!agent) {
      return c.json({ success: false, healthy: false, error: 'Agent not found', checks: { loaded: false } }, 404);
    }

    const checks: Record<string, boolean> = {
      loaded: true,
      hasModel: !!agent.model,
      hasMemory: ctx.memoryAdapters.has(slug),
    };

    const spec = ctx.agentSpecs.get(slug);
    const integrations: Array<{ id: string; type: string; connected: boolean; error?: string; metadata?: any }> = [];

    if (spec?.tools?.mcpServers?.length) {
      checks.integrationsConfigured = true;

      for (const id of spec.tools.mcpServers) {
        const key = `${slug}:${id}`;
        const status = ctx.mcpConnectionStatus.get(key);
        const metadata = ctx.integrationMetadata.get(key);
        const agentTools = ctx.agentTools.get(slug) || [];
        const serverTools = agentTools
          .filter((t) => t.name.startsWith(id.replace(/-/g, '')))
          .map((t) => {
            const mapping = ctx.toolNameMapping.get(t.name);
            return {
              name: t.name,
              originalName: mapping?.original || t.name,
              server: mapping?.server || null,
              toolName: mapping?.tool || t.name,
              description: (t as ToolWithDescription).description,
            };
          });

        integrations.push({
          id,
          type: metadata?.type || 'mcp',
          connected: status?.connected === true,
          error: status?.error,
          metadata: metadata ? { transport: metadata.transport, toolCount: metadata.toolCount, tools: serverTools } : undefined,
        });
      }

      checks.integrationsConnected = integrations.every((i) => i.connected);
    }

    return c.json({
      success: true,
      healthy: Object.values(checks).every((v) => v),
      checks,
      integrations,
      status: ctx.agentStatus.get(slug) || 'idle',
    });
  });

  return app;
}
