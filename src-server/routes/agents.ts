/**
 * Agent Routes - CRUD operations for agents
 */

import { Hono } from 'hono';
import type { AgentService } from '../services/agent-service.js';

export function createAgentRoutes(
  agentService: AgentService,
  reinitialize: () => Promise<void>,
  getVoltAgent: () => any,
) {
  const app = new Hono();

  // List all agents (enriched)
  app.get('/', async (c) => {
    try {
      const voltAgent = getVoltAgent();
      if (!voltAgent) {
        return c.json(
          { success: false, error: 'VoltAgent not initialized' },
          500,
        );
      }
      const coreAgents = await voltAgent.getAgents();
      const enrichedAgents = await agentService.getEnrichedAgents(coreAgents);
      return c.json({ success: true, data: enrichedAgents });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Create new agent
  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const { slug, spec } = await agentService.createAgent(body);
      await reinitialize();
      return c.json({ success: true, data: { slug, ...spec } }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update existing agent
  app.put('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const updates = await c.req.json();
      const updated = await agentService.updateAgent(slug, updates);
      await reinitialize();
      return c.json({ success: true, data: updated });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete agent
  app.delete('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const result = await agentService.deleteAgent(slug);
      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }
      await reinitialize();
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
