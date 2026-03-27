/**
 * Layout Routes - layout and workflow management
 */

import { Hono } from 'hono';
import type { LayoutService } from '../services/layout-service.js';
import { layoutOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  layoutCreateSchema,
  layoutUpdateSchema,
  param,
  validate,
  workflowCreateSchema,
  workflowUpdateSchema,
} from './schemas.js';

export function createLayoutRoutes(layoutService: LayoutService) {
  const app = new Hono();

  // List all layouts
  app.get('/', async (c) => {
    try {
      const layouts = await layoutService.listLayouts();
      return c.json({ success: true, data: layouts });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get layout config
  app.get('/:slug', async (c) => {
    try {
      const slug = param(c, 'slug');
      const layout = await layoutService.getLayout(slug);
      return c.json({ success: true, data: layout });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 404);
    }
  });

  // Create new layout
  app.post('/', validate(layoutCreateSchema), async (c) => {
    try {
      const config = getBody(c);
      const layout = await layoutService.createLayout(config);
      layoutOps.add(1, { op: 'create' });
      return c.json({ success: true, data: layout }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Update layout
  app.put('/:slug', validate(layoutUpdateSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const updates = getBody(c);
      const updated = await layoutService.updateLayout(slug, updates);
      layoutOps.add(1, { op: 'update' });
      return c.json({ success: true, data: updated });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Delete layout
  app.delete('/:slug', async (c) => {
    try {
      const slug = param(c, 'slug');
      await layoutService.deleteLayout(slug);
      layoutOps.add(1, { op: 'delete' });
      return c.json({ success: true }, 200);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}

export function createWorkflowRoutes(layoutService: LayoutService) {
  const app = new Hono();

  // List workflow files for agent
  app.get('/:slug/workflows/files', async (c) => {
    try {
      const slug = param(c, 'slug');
      const workflows = await layoutService.listAgentWorkflows(slug);
      return c.json({ success: true, data: workflows });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get workflow file content
  app.get('/:slug/workflows/:workflowId', async (c) => {
    try {
      const slug = param(c, 'slug');
      const workflowId = param(c, 'workflowId');
      const content = await layoutService.getWorkflow(slug, workflowId);
      return c.json({ success: true, data: { content } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 404);
    }
  });

  // Create workflow file
  app.post('/:slug/workflows', validate(workflowCreateSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const { filename, content } = getBody(c);
      await layoutService.createWorkflow(slug, filename, content);
      return c.json({ success: true, data: { filename } }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  // Update workflow file
  app.put(
    '/:slug/workflows/:workflowId',
    validate(workflowUpdateSchema),
    async (c) => {
      try {
        const slug = param(c, 'slug');
        const workflowId = param(c, 'workflowId');
        const { content } = getBody(c);
        await layoutService.updateWorkflow(slug, workflowId, content);
        return c.json({ success: true });
      } catch (error: unknown) {
        return c.json({ success: false, error: errorMessage(error) }, 400);
      }
    },
  );

  // Delete workflow file
  app.delete('/:slug/workflows/:workflowId', async (c) => {
    try {
      const slug = param(c, 'slug');
      const workflowId = param(c, 'workflowId');
      await layoutService.deleteWorkflow(slug, workflowId);
      return c.json({ success: true }, 200);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}
