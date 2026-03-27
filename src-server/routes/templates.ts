import type { LayoutTemplate } from '@stallion-ai/shared';
import { Hono } from 'hono';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import { templateOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  param,
  templateCreateSchema,
  validate,
} from './schemas.js';

export function createTemplateRoutes(storageAdapter: IStorageAdapter) {
  const app = new Hono();

  app.get('/', (c) => {
    try {
      templateOps.add(1, { op: 'list' });
      return c.json({ success: true, data: storageAdapter.listTemplates() });
    } catch (e: unknown) {
      return c.json({ success: false, error: errorMessage(e) }, 500);
    }
  });

  app.get('/:id', (c) => {
    try {
      const t = storageAdapter.getTemplate(param(c, 'id'));
      if (!t) return c.json({ success: false, error: 'Not found' }, 404);
      return c.json({ success: true, data: t });
    } catch (e: unknown) {
      return c.json({ success: false, error: errorMessage(e) }, 500);
    }
  });

  app.post('/', validate(templateCreateSchema), async (c) => {
    try {
      const body = getBody(c);
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
      templateOps.add(1, { op: 'apply' });
      return c.json({ success: true, data: template }, 201);
    } catch (e: unknown) {
      return c.json({ success: false, error: errorMessage(e) }, 400);
    }
  });

  app.delete('/:id', (c) => {
    try {
      storageAdapter.deleteTemplate(param(c, 'id'));
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ success: false, error: errorMessage(e) }, 400);
    }
  });

  return app;
}
