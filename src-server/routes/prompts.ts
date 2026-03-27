import { Hono } from 'hono';
import type { PromptService } from '../services/prompt-service.js';
import { promptOps } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import {
  errorMessage,
  getBody,
  param,
  promptCreateSchema,
  promptUpdateSchema,
  validate,
} from './schemas.js';

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
      const body = getBody(c);
      promptOps.add(1, { op: 'create' });
      const data = await service.addPrompt(body);
      return c.json({ success: true, data }, 201);
    } catch (error: unknown) {
      logger.error('Failed to create prompt', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.put('/:id', validate(promptUpdateSchema), async (c) => {
    try {
      const id = param(c, 'id');
      const body = getBody(c);
      promptOps.add(1, { op: 'update' });
      const data = await service.updatePrompt(id, body);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to update prompt', { error });
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
