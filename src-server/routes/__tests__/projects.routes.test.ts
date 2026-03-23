import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  projectOps: { add: vi.fn() },
}));

const { createProjectRoutes } = await import('../projects.js');

function createMockProjectService() {
  const projects = new Map<string, any>();
  return {
    listProjects: vi.fn(async () => [...projects.values()].map((p) => ({ slug: p.slug, name: p.name }))),
    getProject: vi.fn(async (slug: string) => {
      const p = projects.get(slug);
      if (!p) throw new Error('Not found');
      return p;
    }),
    createProject: vi.fn(async (body: any) => {
      const p = { id: 'id-1', slug: body.slug || 'test', ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      projects.set(p.slug, p);
      return p;
    }),
    updateProject: vi.fn(async (slug: string, updates: any) => {
      const p = projects.get(slug);
      if (!p) throw new Error('Not found');
      Object.assign(p, updates);
      return p;
    }),
    deleteProject: vi.fn(async (slug: string) => { projects.delete(slug); }),
  };
}

function createMockStorageAdapter() {
  const layouts = new Map<string, any>();
  return {
    listLayouts: vi.fn((_slug: string) => [...layouts.values()]),
    getLayout: vi.fn((_slug: string, layoutSlug: string) => layouts.get(layoutSlug) || { slug: layoutSlug, type: 'chat', config: {} }),
    saveLayout: vi.fn((_slug: string, layout: any) => layouts.set(layout.slug, layout)),
    deleteLayout: vi.fn((_slug: string, layoutSlug: string) => layouts.delete(layoutSlug)),
    getProject: vi.fn(() => ({ workingDirectory: '/tmp' })),
  };
}

async function json(res: Response) { return res.json(); }

describe('Project Routes', () => {
  test('GET / returns project list', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
  });

  test('POST / creates project', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });
    expect(res.status).toBe(201);
  });

  test('GET /:slug returns 404 for missing', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const res = await app.request('/missing');
    expect(res.status).toBe(404);
  });

  test('DELETE /:slug deletes project', async () => {
    const svc = createMockProjectService();
    const app = createProjectRoutes(svc as any, createMockStorageAdapter() as any, '/tmp');
    const body = await json(await app.request('/test', { method: 'DELETE' }));
    expect(body.success).toBe(true);
  });

  test('GET /:slug/layouts returns layout list', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const body = await json(await app.request('/test/layouts'));
    expect(body.success).toBe(true);
  });

  test('POST /:slug/layouts creates layout', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const res = await app.request('/test/layouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-layout', name: 'New', type: 'chat' }),
    });
    expect(res.status).toBe(201);
  });

  test('DELETE /:slug/layouts/:layoutSlug deletes layout', async () => {
    const app = createProjectRoutes(createMockProjectService() as any, createMockStorageAdapter() as any, '/tmp');
    const body = await json(await app.request('/test/layouts/old', { method: 'DELETE' }));
    expect(body.success).toBe(true);
  });
});
