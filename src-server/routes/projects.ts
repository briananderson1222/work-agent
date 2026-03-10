/**
 * Project Routes - project and layout management
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type { ProjectService } from '../services/project-service.js';

/** Scan installed plugins for available layout sources */
function getAvailableLayouts(projectHomeDir: string) {
  const results: Array<{ source: 'plugin' | 'builtin'; plugin?: string; name: string; slug: string; icon?: string; description?: string; type: string; tabCount?: number }> = [];

  // Built-in types
  results.push({ source: 'builtin', name: 'Chat', slug: 'chat', icon: '💬', description: 'Chat layout with tabs and prompts', type: 'chat' });
  results.push({ source: 'builtin', name: 'Coding', slug: 'coding', icon: '🔧', description: 'File tree, diff viewer, terminal, and chat', type: 'coding' });

  // Scan plugins for workspaces
  const pluginsDir = join(projectHomeDir, 'plugins');
  if (!existsSync(pluginsDir)) return results;
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginFile = join(pluginsDir, entry.name, 'plugin.json');
    if (!existsSync(pluginFile)) continue;
    try {
      const plugin = JSON.parse(readFileSync(pluginFile, 'utf-8'));
      if (!plugin.workspace) continue;
      const wsFile = join(pluginsDir, entry.name, plugin.workspace.source || 'workspace.json');
      // Also check the workspaces dir (where install copies it)
      const wsDir = join(projectHomeDir, 'workspaces', plugin.workspace.slug, 'workspace.json');
      const wsPath = existsSync(wsFile) ? wsFile : existsSync(wsDir) ? wsDir : null;
      if (!wsPath) continue;
      const ws = JSON.parse(readFileSync(wsPath, 'utf-8'));
      results.push({
        source: 'plugin',
        plugin: plugin.name,
        name: ws.name || plugin.displayName || plugin.name,
        slug: ws.slug || plugin.workspace.slug,
        icon: ws.icon,
        description: ws.description || plugin.description,
        type: 'chat',
        tabCount: ws.tabs?.length,
      });
    } catch { /* skip broken plugins */ }
  }
  return results;
}

/** Read a plugin's workspace.json to create a layout reference */
function readPluginWorkspace(projectHomeDir: string, pluginName: string) {
  // Check workspaces dir first (where install copies it), then plugin source
  const pluginFile = join(projectHomeDir, 'plugins', pluginName, 'plugin.json');
  if (!existsSync(pluginFile)) return null;
  const plugin = JSON.parse(readFileSync(pluginFile, 'utf-8'));
  if (!plugin.workspace) return null;

  const wsDir = join(projectHomeDir, 'workspaces', plugin.workspace.slug, 'workspace.json');
  const wsFile = join(projectHomeDir, 'plugins', pluginName, plugin.workspace.source || 'workspace.json');
  const wsPath = existsSync(wsDir) ? wsDir : existsSync(wsFile) ? wsFile : null;
  if (!wsPath) return null;
  return JSON.parse(readFileSync(wsPath, 'utf-8'));
}

export function createProjectRoutes(projectService: ProjectService, storageAdapter: IStorageAdapter, projectHomeDir?: string) {
  const app = new Hono();

  // List all projects
  app.get('/', async (c) => {
    try {
      const projects = await projectService.listProjects();
      return c.json({ success: true, data: projects });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Create project
  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const project = await projectService.createProject(body);
      return c.json({ success: true, data: project }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Get project
  app.get('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const project = await projectService.getProject(slug);
      return c.json({ success: true, data: project });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Update project
  app.put('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const body = await c.req.json();
      const updated = await projectService.updateProject(slug, body);
      return c.json({ success: true, data: updated });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete project
  app.delete('/:slug', async (c) => {
    try {
      const slug = c.req.param('slug');
      await projectService.deleteProject(slug);
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // List layouts
  app.get('/:slug/layouts', async (c) => {
    try {
      const slug = c.req.param('slug');
      const layouts = storageAdapter.listLayouts(slug);
      return c.json({ success: true, data: layouts });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Create layout
  app.post('/:slug/layouts', async (c) => {
    try {
      const slug = c.req.param('slug');
      const body = await c.req.json();

      // Auto-resolve workingDirectory for coding layouts from project's primary directory
      if (body.type === 'coding' && !body.config?.workingDirectory) {
        const project = storageAdapter.getProject(slug);
        const primary = project.directories?.find((d: any) => d.role === 'primary');
        if (primary) {
          body.config = { ...body.config, workingDirectory: primary.path };
        }
      }

      storageAdapter.saveLayout(slug, body);
      return c.json({ success: true, data: body }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Get layout — resolves plugin layouts dynamically
  app.get('/:slug/layouts/:layoutSlug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const layoutSlug = c.req.param('layoutSlug');
      const layout = storageAdapter.getLayout(slug, layoutSlug);

      // Dynamic resolution: if layout references a plugin, merge fresh workspace data
      const pluginName = (layout.config as any)?.plugin;
      if (pluginName && projectHomeDir) {
        const ws = readPluginWorkspace(projectHomeDir, pluginName);
        if (ws) {
          layout.config = {
            ...(layout.config as any),
            tabs: ws.tabs,
            globalPrompts: ws.globalPrompts,
            defaultAgent: ws.defaultAgent,
            availableAgents: ws.availableAgents,
            requiredProviders: ws.requiredProviders,
          };
        }
      }

      // Backfill workingDirectory for coding layouts missing it
      if (layout.type === 'coding' && !(layout.config as any)?.workingDirectory) {
        const project = storageAdapter.getProject(slug);
        const primary = project.directories?.find((d: any) => d.role === 'primary');
        if (primary) {
          (layout.config as any).workingDirectory = primary.path;
        }
      }

      return c.json({ success: true, data: layout });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 404);
    }
  });

  // Update layout
  app.put('/:slug/layouts/:layoutSlug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const body = await c.req.json();
      storageAdapter.saveLayout(slug, body);
      return c.json({ success: true, data: body });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // Delete layout
  app.delete('/:slug/layouts/:layoutSlug', async (c) => {
    try {
      const slug = c.req.param('slug');
      const layoutSlug = c.req.param('layoutSlug');
      storageAdapter.deleteLayout(slug, layoutSlug);
      return c.json({ success: true }, 200);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  // ── Available layout sources (plugins + built-in types) ──

  app.get('/layouts/available', (c) => {
    try {
      const homeDir = projectHomeDir || '.stallion-ai';
      return c.json({ success: true, data: getAvailableLayouts(homeDir) });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ── Apply plugin layout to project ──

  app.post('/:slug/layouts/from-plugin', async (c) => {
    try {
      const slug = c.req.param('slug');
      const { plugin: pluginName } = await c.req.json();
      if (!pluginName) return c.json({ success: false, error: 'plugin name required' }, 400);

      const homeDir = projectHomeDir || '.stallion-ai';
      const ws = readPluginWorkspace(homeDir, pluginName);
      if (!ws) return c.json({ success: false, error: `Plugin '${pluginName}' has no workspace` }, 404);

      const now = new Date().toISOString();
      const layout = {
        id: randomUUID(),
        projectSlug: slug,
        type: 'chat',
        name: ws.name,
        slug: ws.slug,
        icon: ws.icon,
        description: ws.description,
        config: {
          plugin: pluginName,
          tabs: ws.tabs,
          globalPrompts: ws.globalPrompts,
          defaultAgent: ws.defaultAgent,
          availableAgents: ws.availableAgents,
          requiredProviders: ws.requiredProviders,
        },
        createdAt: now,
        updatedAt: now,
      };

      storageAdapter.saveLayout(slug, layout);
      return c.json({ success: true, data: layout }, 201);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  return app;
}
