import type { RunOutputRef } from '@stallion-ai/contracts/runs';
import { Hono } from 'hono';
import type { RunService } from '../services/run-service.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage } from './schemas.js';

export function createRunRoutes(runService: RunService, logger: Logger) {
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      const data = await runService.listRuns({
        source: c.req.query('source') as
          | 'orchestration'
          | 'schedule'
          | undefined,
        providerId: c.req.query('providerId'),
        sourceId: c.req.query('sourceId'),
      });
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to list runs', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/output', async (c) => {
    try {
      const ref = (await c.req.json()) as RunOutputRef;
      const content = await runService.readOutput(ref);
      return c.json({ success: true, data: { content } });
    } catch (error: unknown) {
      logger.error('Failed to read run output', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:runId', async (c) => {
    try {
      const data = await runService.readRun(c.req.param('runId'));
      if (!data) {
        return c.json({ success: false, error: 'Run not found' }, 404);
      }
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to read run', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
