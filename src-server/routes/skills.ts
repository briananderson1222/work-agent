/**
 * Skill Routes — CRUD operations for installed skills
 */

import { Hono } from 'hono';
import type { SkillService } from '../services/skill-service.js';
import { skillOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  param,
  skillCreateSchema,
  validate,
} from './schemas.js';

export function createSkillRoutes(
  skillService: SkillService,
  getProjectHomeDir: () => string,
) {
  const app = new Hono();

  // List installed skills
  app.get('/', (c) => {
    skillOps.add(1, { operation: 'list' });
    return c.json({ success: true, data: skillService.listSkills() });
  });

  // Get skill detail
  app.get('/:name', async (c) => {
    try {
      const name = param(c, 'name');
      const skill = await skillService.getSkill(name);
      return c.json({ success: true, data: skill });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 404);
    }
  });

  // Install skill
  app.post('/', validate(skillCreateSchema), async (c) => {
    try {
      const body = getBody(c);
      const result = await skillService.installSkill(
        body.name,
        getProjectHomeDir(),
      );
      if (!result.success) {
        return c.json({ success: false, error: result.message }, 400);
      }
      return c.json({ success: true, data: result }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Remove skill
  app.delete('/:name', async (c) => {
    try {
      const name = param(c, 'name');
      const result = await skillService.removeSkill(name, getProjectHomeDir());
      if (!result.success) {
        return c.json({ success: false, error: result.message }, 404);
      }
      skillOps.add(1, { operation: 'delete' });
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}
