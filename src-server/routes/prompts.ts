import type { PlaybookSourceContext } from '@stallion-ai/contracts/catalog';
import { Hono } from 'hono';
import type { PromptService } from '../services/prompt-service.js';
import { promptOps } from '../telemetry/metrics.js';
import {
  INTERNAL_API_TOKEN_HEADER,
  isTrustedInternalApiToken,
} from '../utils/internal-api-token.js';
import type { Logger } from '../utils/logger.js';
import {
  errorMessage,
  getBody,
  param,
  promptCreateSchema,
  promptOutcomeSchema,
  promptUpdateSchema,
  validate,
} from './schemas.js';

type PromptCreateBody = {
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  _sourceContext?: PlaybookSourceContext;
};

type PromptUpdateBody = Partial<PromptCreateBody>;

function splitSourceContext<
  T extends { _sourceContext?: PlaybookSourceContext },
>(body: T, trustedInternalRequest: boolean) {
  const { _sourceContext, ...data } = body;
  return {
    data,
    sourceContext: trustedInternalRequest ? _sourceContext : undefined,
  };
}

export function createPromptRoutes(service: PromptService, logger: Logger) {
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
