/**
 * Skill Routes — CRUD operations for installed skills
 */

import { Hono } from 'hono';
import type { PromptService } from '../services/prompt-service.js';
import type { SkillService } from '../services/skill-service.js';
import { skillOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  guidanceConversionSchema,
  localSkillCreateSchema,
  localSkillUpdateSchema,
  param,
  skillCreateSchema,
  validate,
} from './schemas.js';

export function createSkillRoutes(
  skillService: SkillService,
  getProjectHomeDir: () => string,
  conversionDeps?: {
    promptService: PromptService;
  },
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

  // Create local packaged skill
  app.post('/local', validate(localSkillCreateSchema), async (c) => {
    try {
      const body = getBody(c);
      const result = await skillService.createLocalSkill(
        body,
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

  app.put('/:name', validate(localSkillUpdateSchema), async (c) => {
    try {
      const name = param(c, 'name');
      const body = getBody(c);
      const result = await skillService.updateLocalSkill(
        name,
        body,
        getProjectHomeDir(),
      );
      if (!result.success) {
        return c.json({ success: false, error: result.message }, 400);
      }
      return c.json({ success: true, data: result });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.post(
    '/:name/convert-to-playbook',
    validate(guidanceConversionSchema),
    async (c) => {
      if (!conversionDeps) {
        return c.json(
          { success: false, error: 'Playbook conversion is unavailable' },
          501,
        );
      }
      try {
        const skillName = param(c, 'name');
        const body = (getBody(c) ?? {}) as { name?: string };
        const skill = await skillService.getSkill(skillName);
        const content = skill.body?.trim();
        if (!content) {
          return c.json(
            { success: false, error: `Skill '${skillName}' has no body` },
            400,
          );
        }
        const name = body.name?.trim() || skill.name;
        const existingPlaybook = (
          await conversionDeps.promptService.listPrompts()
        ).some((playbook) => playbook.name === name);
        if (existingPlaybook) {
          return c.json(
            { success: false, error: `Playbook '${name}' already exists` },
            409,
          );
        }
        const source =
          skill.source === 'registry'
            ? 'registry'
            : skill.source === 'plugin'
              ? 'plugin'
              : 'user';
        const now = new Date().toISOString();
        const created = await conversionDeps.promptService.addPrompt(
          {
            name,
            content,
            description: skill.description,
            category: skill.category,
            tags: skill.tags,
            agent: skill.agent,
            global: skill.global,
          },
          {
            kind: 'asset',
            action: 'skill-to-playbook',
            convertedAt: now,
            asset: {
              kind: 'skill',
              id: skill.name,
              name: skill.name,
              owner: source,
            },
          },
        );
        skillOps.add(1, { operation: 'convert-to-playbook' });
        return c.json({ success: true, data: created }, 201);
      } catch (error: unknown) {
        return c.json({ success: false, error: errorMessage(error) }, 400);
      }
    },
  );

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
