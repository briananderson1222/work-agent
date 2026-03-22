import { Hono } from 'hono';
import type { PromptService } from '../services/prompt-service.js';
import { promptOps } from '../telemetry/metrics.js';

export function createPromptRoutes(service: PromptService, logger: any) {
  const app = new Hono();

  app.get('/providers', (c) => {
    return c.json({ success: true, data: service.listProviders() });
  });

  app.get('/', async (c) => {
    try {
      promptOps.add(1, { op: 'list' });
      const data = await service.listPrompts();
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to list prompts', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/:id', async (c) => {
    try {
      const data = await service.getPrompt(c.req.param('id'));
      if (!data)
        return c.json({ success: false, error: 'Prompt not found' }, 404);
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get prompt', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      promptOps.add(1, { op: 'create' });
      const data = await service.addPrompt(body);
      return c.json({ success: true, data }, 201);
    } catch (error: any) {
      logger.error('Failed to create prompt', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.put('/:id', async (c) => {
    try {
      const body = await c.req.json();
      promptOps.add(1, { op: 'update' });
      const data = await service.updatePrompt(c.req.param('id'), body);
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to update prompt', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.delete('/:id', async (c) => {
    try {
      promptOps.add(1, { op: 'delete' });
      await service.deletePrompt(c.req.param('id'));
      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to delete prompt', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
