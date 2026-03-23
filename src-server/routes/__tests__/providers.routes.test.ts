import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  providerOps: { add: vi.fn() },
}));
vi.mock('../../providers/bedrock-llm-provider.js', () => ({ BedrockLLMProvider: vi.fn().mockImplementation(() => ({ healthCheck: async () => true, listModels: async () => [] })) }));
vi.mock('../../providers/ollama-provider.js', () => ({ OllamaLLMProvider: vi.fn().mockImplementation(() => ({ healthCheck: async () => true })), OllamaEmbeddingProvider: vi.fn() }));
vi.mock('../../providers/openai-compat-provider.js', () => ({ OpenAICompatLLMProvider: vi.fn().mockImplementation(() => ({ healthCheck: async () => true })), OpenAICompatEmbeddingProvider: vi.fn() }));
vi.mock('../../providers/bedrock-embedding-provider.js', () => ({ BedrockEmbeddingProvider: vi.fn() }));
vi.mock('../../providers/lancedb-provider.js', () => ({ LanceDBProvider: vi.fn() }));

const { createProviderRoutes } = await import('../providers.js');

function createMockProviderService() {
  const connections: any[] = [];
  return {
    listProviderConnections: vi.fn(() => [...connections]),
    saveProviderConnection: vi.fn((c: any) => connections.push(c)),
    deleteProviderConnection: vi.fn((id: string) => {
      const idx = connections.findIndex((c) => c.id === id);
      if (idx >= 0) connections.splice(idx, 1);
    }),
    checkHealth: vi.fn().mockResolvedValue(true),
  };
}

async function json(res: Response) { return res.json(); }

describe('Provider Routes', () => {
  test('GET / returns empty list', async () => {
    const app = createProviderRoutes(createMockProviderService() as any);
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST / creates provider connection', async () => {
    const app = createProviderRoutes(createMockProviderService() as any);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bedrock', name: 'Test', config: {} }),
    });
    expect(res.status).toBe(201);
  });

  test('DELETE /:id removes provider', async () => {
    const svc = createMockProviderService();
    const app = createProviderRoutes(svc as any);
    const body = await json(await app.request('/p1', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(svc.deleteProviderConnection).toHaveBeenCalledWith('p1');
  });

  test('POST /:id/test returns 404 for missing provider', async () => {
    const app = createProviderRoutes(createMockProviderService() as any);
    const res = await app.request('/missing/test', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  test('GET /:id/health returns 404 for missing provider', async () => {
    const app = createProviderRoutes(createMockProviderService() as any);
    const body = await json(await app.request('/missing/health'));
    expect(body.success).toBe(false);
  });
});
