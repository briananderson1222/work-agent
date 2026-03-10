import { Hono } from 'hono';
import type { LayoutTemplate } from '@stallion-ai/shared';
import type { IStorageAdapter } from '../domain/storage-adapter.js';

export function createTemplateRoutes(storageAdapter: IStorageAdapter) {
  const app = new Hono();

  app.get('/', (c) => {
    try {
      return c.json({ success: true, data: storageAdapter.listTemplates() });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.get('/:id', (c) => {
    try {
      const t = storageAdapter.getTemplate(c.req.param('id'));
      if (!t) return c.json({ success: false, error: 'Not found' }, 404);
      return c.json({ success: true, data: t });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const template: LayoutTemplate = {
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description,
        icon: body.icon,
        type: body.type,
        config: body.config ?? {},
        createdAt: new Date().toISOString(),
      };
      storageAdapter.saveTemplate(template);
      return c.json({ success: true, data: template }, 201);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.delete('/:id', (c) => {
    try {
      storageAdapter.deleteTemplate(c.req.param('id'));
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  return app;
}
