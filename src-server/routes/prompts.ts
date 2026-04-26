import type {
  GuidanceAssetSourceOwner,
  Playbook,
  PlaybookSourceContext,
} from '@stallion-ai/contracts/catalog';
import { Hono } from 'hono';
import type { PromptService } from '../services/prompt-service.js';
import type { SkillService } from '../services/skill-service.js';
import { promptOps } from '../telemetry/metrics.js';
import {
  INTERNAL_API_TOKEN_HEADER,
  isTrustedInternalApiToken,
} from '../utils/internal-api-token.js';
import type { Logger } from '../utils/logger.js';
import {
  errorMessage,
  getBody,
  guidanceConversionSchema,
  param,
  promptCreateSchema,
  promptOutcomeSchema,
  promptUpdateSchema,
  validate,
} from './schemas.js';

type PromptCreateBody = {
  name: string;
  content: string;
  storageMode?: 'json-inline' | 'markdown-file';
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  _sourceContext?: PlaybookSourceContext;
};

type PromptUpdateBody = Partial<PromptCreateBody>;

type ConversionBody = {
  name?: string;
};

function getPlaybookAssetOwner(playbook: Playbook): GuidanceAssetSourceOwner {
  return playbook.source?.startsWith('plugin:') ? 'plugin' : 'user';
}

function createPlaybookToSkillProvenance(playbook: Playbook) {
  const now = new Date().toISOString();
  const asset = {
    kind: 'playbook' as const,
    id: playbook.id,
    name: playbook.name,
    owner: getPlaybookAssetOwner(playbook),
  };
  return {
    createdFrom: {
      kind: 'asset' as const,
      action: 'playbook-to-skill' as const,
      convertedAt: now,
      asset,
    },
    updatedFrom: {
      kind: 'asset' as const,
      action: 'playbook-to-skill' as const,
      convertedAt: now,
      asset,
    },
  };
}

function assertSafeLocalSkillName(name: string) {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Skill name cannot contain path separators');
  }
}

function splitSourceContext<
  T extends { _sourceContext?: PlaybookSourceContext },
>(body: T, trustedInternalRequest: boolean) {
  const { _sourceContext, ...data } = body;
  return {
    data,
    sourceContext: trustedInternalRequest ? _sourceContext : undefined,
  };
}

export function createPromptRoutes(
  service: PromptService,
  logger: Logger,
  conversionDeps?: {
    skillService: SkillService;
    getProjectHomeDir: () => string;
  },
) {
  const app = new Hono();

  app.get('/providers', (c) => {
    return c.json({ success: true, data: service.listProviders() });
  });

  app.get('/', async (c) => {
    try {
      promptOps.add(1, { op: 'list' });
      const data = await service.listPrompts();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to list prompts', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:id', async (c) => {
    try {
      const id = param(c, 'id');
      const data = await service.getPrompt(id);
      if (!data)
        return c.json({ success: false, error: 'Prompt not found' }, 404);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to get prompt', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/', validate(promptCreateSchema), async (c) => {
    try {
      const body = getBody(c) as PromptCreateBody;
      const trustedInternalRequest = isTrustedInternalApiToken(
        c.req.header(INTERNAL_API_TOKEN_HEADER),
      );
      const { data, sourceContext } = splitSourceContext(
        body,
        trustedInternalRequest,
      );
      promptOps.add(1, { op: 'create' });
      const created = await service.addPrompt(data, sourceContext);
      return c.json({ success: true, data: created }, 201);
    } catch (error: unknown) {
      logger.error('Failed to create prompt', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post(
    '/:id/convert-to-skill',
    validate(guidanceConversionSchema),
    async (c) => {
      if (!conversionDeps) {
        return c.json(
          { success: false, error: 'Skill conversion is unavailable' },
          501,
        );
      }
      try {
        const id = param(c, 'id');
        const body = (getBody(c) ?? {}) as ConversionBody;
        const playbook = await service.getPrompt(id);
        if (!playbook) {
          return c.json({ success: false, error: 'Playbook not found' }, 404);
        }
        const name = body.name?.trim() || playbook.name;
        assertSafeLocalSkillName(name);
        const existingSkill = conversionDeps.skillService
          .listSkills()
          .some((skill) => skill.name === name);
        if (existingSkill) {
          return c.json(
            { success: false, error: `Skill '${name}' already exists` },
            409,
          );
        }
        const provenance: Playbook['provenance'] =
          createPlaybookToSkillProvenance(playbook);
        const result = await conversionDeps.skillService.createLocalSkill(
          {
            name,
            body: playbook.content,
            description: playbook.description,
            category: playbook.category,
            tags: playbook.tags,
            agent: playbook.agent,
            global: playbook.global,
            provenance,
          },
          conversionDeps.getProjectHomeDir(),
        );
        if (!result.success) {
          return c.json({ success: false, error: result.message }, 400);
        }
        promptOps.add(1, { op: 'convert-to-skill' });
        return c.json({ success: true, data: { name, provenance } }, 201);
      } catch (error: unknown) {
        logger.error('Failed to convert playbook to skill', { error });
        return c.json({ success: false, error: errorMessage(error) }, 400);
      }
    },
  );

  app.put('/:id', validate(promptUpdateSchema), async (c) => {
    try {
      const id = param(c, 'id');
      const body = getBody(c) as PromptUpdateBody;
      const trustedInternalRequest = isTrustedInternalApiToken(
        c.req.header(INTERNAL_API_TOKEN_HEADER),
      );
      const { data, sourceContext } = splitSourceContext(
        body,
        trustedInternalRequest,
      );
      promptOps.add(1, { op: 'update' });
      const updated = await service.updatePrompt(id, data, sourceContext);
      return c.json({ success: true, data: updated });
    } catch (error: unknown) {
      logger.error('Failed to update prompt', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/:id/run', async (c) => {
    try {
      const id = param(c, 'id');
      promptOps.add(1, { op: 'run' });
      const data = await service.trackPromptRun(id);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to track prompt run', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/:id/outcome', validate(promptOutcomeSchema), async (c) => {
    try {
      const id = param(c, 'id');
      const body = getBody(c);
      promptOps.add(1, { op: 'outcome', outcome: body.outcome });
      const data = await service.recordPromptOutcome(id, body.outcome);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to record prompt outcome', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.delete('/:id', async (c) => {
    try {
      const id = param(c, 'id');
      promptOps.add(1, { op: 'delete' });
      await service.deletePrompt(id);
      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Failed to delete prompt', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
