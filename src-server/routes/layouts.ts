/**
 * Layout Routes - layout and workflow management
 */

import { Hono } from 'hono';
import type { LayoutService } from '../services/layout-service.js';
import { layoutOps } from '../telemetry/metrics.js';

export function createLayoutRoutes(layoutService: LayoutService) {
  const app = new Hono();

  // List all layouts
  app.get('/', async (c) => {
    try {
      const layouts = await layoutService.listLayouts();
      return c.json({ success: true, data: layouts });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get layout config
  app.get('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const layout = await layoutService.getLayout(slug);
      return c.json({ success: true, data: layout });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Create new layout
  app.post('/', async (c) => {
    try {
      const config = await c.req.json();
      const layout = await layoutService.createLayout(config);
      layoutOps.add(1, { op: 'create' });
      return c.json({ success: true, data: layout }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update layout
  app.put('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const updates = await c.req.json();
      const updated = await layoutService.updateLayout(slug, updates);
      layoutOps.add(1, { op: 'update' });
      return c.json({ success: true, data: updated });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete layout
  app.delete('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      await layoutService.deleteLayout(slug);
      layoutOps.add(1, { op: 'delete' });
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}

export function createWorkflowRoutes(layoutService: LayoutService) {
  const app = new Hono();

  // List workflow files for agent
  app.get('/:slug/workflows/files', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workflows = await layoutService.listAgentWorkflows(slug);
      return c.json({ success: true, data: workflows });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get workflow file content
  app.get('/:slug/workflows/:workflowId', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workflowId = c.req.param('workflowId');
      const content = await layoutService.getWorkflow(slug, workflowId);
      return c.json({ success: true, data: { content } });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Create workflow file
  app.post('/:slug/workflows', async (c) => {
    try {
      const slug = c.req.param('slug');
      const { filename, content } = await c.req.json();
      await layoutService.createWorkflow(slug, filename, content);
      return c.json({ success: true, data: { filename } }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update workflow file
  app.put('/:slug/workflows/:workflowId', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workflowId = c.req.param('workflowId');
      const { content } = await c.req.json();
      await layoutService.updateWorkflow(slug, workflowId, content);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete workflow file
  app.delete('/:slug/workflows/:workflowId', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workflowId = c.req.param('workflowId');
      await layoutService.deleteWorkflow(slug, workflowId);
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
