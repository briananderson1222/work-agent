/**
 * Tool Routes - MCP tool management
 */

import { Hono } from 'hono';
import type { MCPService } from '../services/mcp-service.js';
import { toolCalls } from '../telemetry/metrics.js';
import {
  addToolSchema,
  errorMessage,
  getBody,
  integrationSchema,
  param,
  updateAliasesSchema,
  updateAllowedSchema,
  validate,
} from './schemas.js';

export function createToolRoutes(
  mcpService: MCPService,
  reinitialize: () => Promise<void>,
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
        connected:
          mcpService.getConnectionStatus('default', t.id)?.connected ?? false,
      }));
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Create/update an integration (POST /integrations)
  app.post('/', validate(integrationSchema), async (c) => {
    try {
      await mcpService.saveIntegration(getBody(c));
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Get single integration (GET /integrations/:id)
  app.get('/:id', async (c) => {
    try {
      const def = await mcpService.getIntegration(param(c, 'id'));
      return c.json({ success: true, data: def });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 404);
    }
  });

  // Update integration (PUT /integrations/:id)
  app.put('/:id', validate(integrationSchema.partial()), async (c) => {
    try {
      await mcpService.saveIntegration({ ...getBody(c), id: param(c, 'id') });
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Delete integration (DELETE /integrations/:id)
  app.delete('/:id', async (c) => {
    try {
      await mcpService.deleteIntegration(param(c, 'id'));
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Reconnect integration (POST /integrations/:id/reconnect)
  app.post('/:id/reconnect', async (c) => {
    try {
      toolCalls.add(1, { op: 'reconnect' });
      await reinitialize();
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
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
  getActiveAgent: (slug: string) => unknown,
  reinitialize: () => Promise<void>,
) {
  const app = new Hono<{ Variables: { slug: string } }>();

  // Get agent tools with full schemas (GET /agents/:slug/tools)
  app.get('/', async (c) => {
    try {
      const slug = param(c, 'slug');
      const agent = getActiveAgent(slug);

      if (!agent) {
        return c.json(
          { success: false, error: 'Agent not found or not active' },
          404,
        );
      }

      const toolsData = mcpService.getAgentTools(slug);
      return c.json({ success: true, data: toolsData });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Add tool to agent (POST /agents/:slug/tools)
  app.post('/', validate(addToolSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const { toolId } = getBody(c);
      const tools = await mcpService.addToolToAgent(slug, toolId);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Remove tool from agent (DELETE /agents/:slug/tools/:toolId)
  app.delete('/:toolId', async (c) => {
    try {
      const slug = param(c, 'slug');
      const toolId = param(c, 'toolId');
      toolCalls.add(1, { op: 'remove_tool' });
      await mcpService.removeToolFromAgent(slug, toolId);
      await reinitialize();
      return c.json({ success: true }, 200);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Update tool allow-list (PUT /agents/:slug/tools/allowed)
  app.put('/allowed', validate(updateAllowedSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const { allowed } = getBody(c);
      const tools = await mcpService.updateAllowedTools(slug, allowed);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Update tool aliases (PUT /agents/:slug/tools/aliases)
  app.put('/aliases', validate(updateAliasesSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const { aliases } = getBody(c);
      const tools = await mcpService.updateToolAliases(slug, aliases);
      await reinitialize();
      return c.json({ success: true, data: tools });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}
