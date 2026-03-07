import { Hono } from 'hono';
import type { TemplateService } from '../services/template-service.js';

export function createTemplateRoutes(service: TemplateService) {
  const app = new Hono();

  app.get('/', async (c) => {
    const type = c.req.query('type') as 'agent' | 'workspace' | undefined;
    const data = await service.listTemplates(type);
    return c.json({ success: true, data });
  });

  return app;
}
