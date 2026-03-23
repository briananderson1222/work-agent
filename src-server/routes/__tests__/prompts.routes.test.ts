import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  promptOps: { add: vi.fn() },
}));

const { createPromptRoutes } = await import('../prompts.js');

function createMockPromptService() {
  const prompts: any[] = [];
  return {
    listPrompts: vi.fn(async () => [...prompts]),
    getPrompt: vi.fn(async (id: string) => prompts.find((p) => p.id === id) ?? null),
    addPrompt: vi.fn(async (opts: any) => {
      const p = { id: 'p-' + prompts.length, ...opts, source: 'local', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      prompts.push(p);
      return p;
    }),
    updatePrompt: vi.fn(async (id: string, updates: any) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      prompts[idx] = { ...prompts[idx], ...updates };
      return prompts[idx];
    }),
    deletePrompt: vi.fn(async (id: string) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      prompts.splice(idx, 1);
    }),
    listProviders: vi.fn(() => []),
  };
}

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

async function json(res: Response) { return res.json(); }

describe('Prompt Routes', () => {
  test('GET / returns empty list', async () => {
    const app = createPromptRoutes(createMockPromptService() as any, mockLogger);
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST / creates prompt', async () => {
    const svc = createMockPromptService();
    const app = createPromptRoutes(svc as any, mockLogger);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', content: 'Do stuff' }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.name).toBe('Test');
  });

  test('GET /:id returns 404 for missing', async () => {
    const app = createPromptRoutes(createMockPromptService() as any, mockLogger);
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  test('DELETE /:id returns 500 for missing', async () => {
    const app = createPromptRoutes(createMockPromptService() as any, mockLogger);
    const res = await app.request('/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(500);
  });

  test('GET /providers returns provider list', async () => {
    const app = createPromptRoutes(createMockPromptService() as any, mockLogger);
    const body = await json(await app.request('/providers'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
