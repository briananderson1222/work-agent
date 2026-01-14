/**
 * Workspace Routes - workspace and workflow management
 */

import { Hono } from 'hono';
import type { WorkspaceService } from '../services/workspace-service.js';

export function createWorkspaceRoutes(workspaceService: WorkspaceService) {
  const app = new Hono();

  // List all workspaces
  app.get('/', async (c) => {
    try {
      const workspaces = await workspaceService.listWorkspaces();
      return c.json({ success: true, data: workspaces });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get workspace config
  app.get('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workspace = await workspaceService.getWorkspace(slug);
      return c.json({ success: true, data: workspace });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Create new workspace
  app.post('/', async (c) => {
    try {
      const config = await c.req.json();
      const workspace = await workspaceService.createWorkspace(config);
      return c.json({ success: true, data: workspace }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Update workspace
  app.put('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const updates = await c.req.json();
      const updated = await workspaceService.updateWorkspace(slug, updates);
      return c.json({ success: true, data: updated });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete workspace
  app.delete('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      await workspaceService.deleteWorkspace(slug);
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}

export function createWorkflowRoutes(workspaceService: WorkspaceService) {
  const app = new Hono();

  // List workflow files for agent
  app.get('/:slug/workflows/files', async (c) => {
    try {
      const slug = c.req.param('slug');
      const workflows = await workspaceService.listAgentWorkflows(slug);
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
      const content = await workspaceService.getWorkflow(slug, workflowId);
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
      await workspaceService.createWorkflow(slug, filename, content);
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
      await workspaceService.updateWorkflow(slug, workflowId, content);
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
      await workspaceService.deleteWorkflow(slug, workflowId);
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
