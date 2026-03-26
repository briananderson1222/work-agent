/**
 * Tool Routes - MCP tool management
 */

import { Hono } from 'hono';
import type { MCPService } from '../services/mcp-service.js';
import { toolCalls } from '../telemetry/metrics.js';
import { integrationSchema, validate, getBody, param } from './schemas.js';

export function createToolRoutes(
  mcpService: MCPService,
  _reinitialize: () => Promise<void>,
) {
  const app = new Hono();

  // List all available tools (GET /tools)
  app.get('/', async (c) => {
    try {
      toolCalls.add(1, { op: 'list' });
      const [tools, agentMap] = await Promise.all([
        mcpService.listIntegrations(),
        mcpService.getToolAgentMap(),
      ]);
      const data = tools.map((t) => ({
        ...t,
        usedBy: agentMap[t.id] || [],
        connected: mcpService.getConnectionStatus('default', t.id)?.connected ?? false,
      }));
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Create/update an integration (POST /integrations)
  app.post('/', validate(integrationSchema), async (c) => {
    try {
      await mcpService.saveIntegration(getBody(c));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Get single integration (GET /integrations/:id)
  app.get('/:id', async (c) => {
    try {
      const def = await mcpService.getIntegration(param(c, 'id'));
      return c.json({ success: true, data: def });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Update integration (PUT /integrations/:id)
  app.put('/:id', validate(integrationSchema.partial()), async (c) => {
    try {
      await mcpService.saveIntegration({ ...getBody(c), id: param(c, 'id') });
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete integration (DELETE /integrations/:id)
  app.delete('/:id', async (c) => {
    try {
      await mcpService.deleteIntegration(param(c, 'id'));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}

/**
 * Agent tool routes - mounted at /agents/:slug/tools
 * Note: These routes expect :slug to be available from parent route
 */
export function createAgentToolRoutes(
  mcpService: MCPService,
  getActiveAgent: (slug: string) => any,
  reinitialize: () => Promise<void>,
) {
  const app = new Hono<{ Variables: { slug: string } }>();

  // Get agent tools with full schemas (GET /agents/:slug/tools)
  app.get('/', async (c) => {
    try {
      const slug = c.req.param('slug')!;
      const agent = getActiveAgent(slug);

      if (!agent) {
        return c.json(
          { success: false, error: 'Agent not found or not active' },
          404,
        );
      }

      const toolsData = mcpService.getAgentTools(slug);
      return c.json({ success: true, data: toolsData });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Add tool to agent (POST /agents/:slug/tools)
  app.post('/', async (c) => {
    try {
      const slug = c.req.param('slug')!;
      const { toolId } = await c.req.json();
      const tools = await mcpService.addToolToAgent(slug, toolId);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Remove tool from agent (DELETE /agents/:slug/tools/:toolId)
  app.delete('/:toolId', async (c) => {
    try {
      const slug = c.req.param('slug')!;
      const toolId = c.req.param('toolId')!;
      toolCalls.add(1, { op: 'remove_tool' });
      await mcpService.removeToolFromAgent(slug, toolId);
      await reinitialize();
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update tool allow-list (PUT /agents/:slug/tools/allowed)
  app.put('/allowed', async (c) => {
    try {
      const slug = c.req.param('slug')!;
      const { allowed } = await c.req.json();
      const tools = await mcpService.updateAllowedTools(slug, allowed);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update tool aliases (PUT /agents/:slug/tools/aliases)
  app.put('/aliases', async (c) => {
    try {
      const slug = c.req.param('slug')!;
      const { aliases } = await c.req.json();
      const tools = await mcpService.updateToolAliases(slug, aliases);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
