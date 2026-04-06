/**
 * Agent Routes - CRUD operations for agents
 */

import { Hono } from 'hono';
import type { AgentService } from '../services/agent-service.js';
import type { SkillService } from '../services/skill-service.js';
import { agentOps } from '../telemetry/metrics.js';
import {
  agentCreateSchema,
  agentUpdateSchema,
  errorMessage,
  getBody,
  param,
  validate,
} from './schemas.js';

function validateSkills(
  skills: string[] | undefined,
  skillService: SkillService,
): string | null {
  if (!skills || skills.length === 0) return null;
  const installed = new Set(skillService.listSkills().map((s) => s.name));
  const unknown = skills.filter((s) => !installed.has(s));
  if (unknown.length > 0) {
    return `Unknown skills: ${unknown.join(', ')}`;
  }
  return null;
}

export function createAgentRoutes(
  agentService: AgentService,
  skillService: SkillService,
  reinitialize: () => Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getVoltAgent: () => { getAgents(): any[] | Promise<any[]> } | undefined,
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
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Create new agent
  app.post('/', validate(agentCreateSchema), async (c) => {
    try {
      const body = getBody(c);
      const skillError = validateSkills(body.skills, skillService);
      if (skillError) {
        return c.json({ success: false, error: skillError }, 400);
      }
      const { slug, spec: created } = await agentService.createAgent(body);
      agentOps.add(1, { op: 'create' });
      await reinitialize();
      return c.json({ success: true, data: { slug, ...created } }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Update existing agent
  app.put('/:slug', validate(agentUpdateSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const updates = getBody(c);
      const skillError = validateSkills(updates.skills, skillService);
      if (skillError) {
        return c.json({ success: false, error: skillError }, 400);
      }
      const updated = await agentService.updateAgent(slug, updates);
      agentOps.add(1, { op: 'update' });
      await reinitialize();
      return c.json({ success: true, data: updated });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Delete agent
  app.delete('/:slug', async (c) => {
    try {
      const slug = param(c, 'slug');
      const result = await agentService.deleteAgent(slug);
      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }
      agentOps.add(1, { op: 'delete' });
      await reinitialize();
      return c.json({ success: true }, 200);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}
