import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  layoutOps: { add: vi.fn() },
}));

const { createLayoutRoutes, createWorkflowRoutes } = await import('../layouts.js');

function createMockLayoutService() {
  return {
    listLayouts: vi.fn().mockResolvedValue([{ slug: 'default', name: 'Default' }]),
    getLayout: vi.fn().mockResolvedValue({ slug: 'default', name: 'Default', tabs: [] }),
    createLayout: vi.fn().mockImplementation(async (c: any) => c),
    updateLayout: vi.fn().mockImplementation(async (_s: string, u: any) => ({ slug: 'default', ...u })),
    deleteLayout: vi.fn().mockResolvedValue(undefined),
    listAgentWorkflows: vi.fn().mockResolvedValue([]),
    getWorkflow: vi.fn().mockResolvedValue('// code'),
    createWorkflow: vi.fn().mockResolvedValue(undefined),
    updateWorkflow: vi.fn().mockResolvedValue(undefined),
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

async function json(res: Response) { return res.json(); }

describe('Layout Routes', () => {
  test('GET / lists layouts', async () => {
    const app = createLayoutRoutes(createMockLayoutService() as any);
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET /:slug returns layout', async () => {
    const app = createLayoutRoutes(createMockLayoutService() as any);
    const body = await json(await app.request('/default'));
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('default');
  });

  test('POST / creates layout', async () => {
    const app = createLayoutRoutes(createMockLayoutService() as any);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new', name: 'New', tabs: [] }),
    });
    expect(res.status).toBe(201);
  });

  test('PUT /:slug updates layout', async () => {
    const app = createLayoutRoutes(createMockLayoutService() as any);
    const body = await json(await app.request('/default', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    }));
    expect(body.success).toBe(true);
  });

  test('DELETE /:slug deletes layout', async () => {
    const app = createLayoutRoutes(createMockLayoutService() as any);
    const res = await app.request('/default', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});

describe('Workflow Routes', () => {
  test('GET /:slug/workflows/files lists workflows', async () => {
    const app = createWorkflowRoutes(createMockLayoutService() as any);
    const body = await json(await app.request('/agent1/workflows/files'));
    expect(body.success).toBe(true);
  });

  test('POST /:slug/workflows creates workflow', async () => {
    const app = createWorkflowRoutes(createMockLayoutService() as any);
    const res = await app.request('/agent1/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.ts', content: '// code' }),
    });
    expect(res.status).toBe(201);
  });

  test('DELETE /:slug/workflows/:id deletes workflow', async () => {
    const app = createWorkflowRoutes(createMockLayoutService() as any);
    const res = await app.request('/agent1/workflows/wf1', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
