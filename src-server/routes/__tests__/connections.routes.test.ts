import { describe, expect, test, vi } from 'vitest';
import { createConnectionRoutes } from '../connections.js';

function createMockConnectionService() {
  const connections = [
    {
      id: 'bedrock-model',
      kind: 'model' as const,
      type: 'bedrock',
      name: 'Bedrock',
      enabled: true,
      description: 'AWS Bedrock models',
      capabilities: ['llm'],
      config: {},
      status: 'ready' as const,
      prerequisites: [],
      lastCheckedAt: null,
    },
    {
      id: 'claude-runtime',
      kind: 'runtime' as const,
      type: 'claude-runtime',
      name: 'Claude Runtime',
      enabled: true,
      description: 'Claude Agent SDK',
      capabilities: ['agent-runtime'],
      config: {},
      status: 'ready' as const,
      prerequisites: [],
      lastCheckedAt: null,
    },
  ];

  return {
    listConnections: vi.fn().mockResolvedValue(connections),
    listModelConnections: vi.fn().mockResolvedValue([connections[0]]),
    listRuntimeConnections: vi.fn().mockResolvedValue([connections[1]]),
    getConnection: vi.fn(
      async (id: string) =>
        connections.find((connection) => connection.id === id) ?? null,
    ),
    saveConnection: vi.fn(async (connection: any) => connection),
    deleteConnection: vi.fn().mockResolvedValue(undefined),
    testConnection: vi
      .fn()
      .mockResolvedValue({ healthy: true, status: 'ready', prerequisites: [] }),
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Connection Routes', () => {
  test('GET / returns projected connections', async () => {
    const app = createConnectionRoutes(createMockConnectionService() as any);
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  test('GET /models and /runtimes return filtered lists', async () => {
    const app = createConnectionRoutes(createMockConnectionService() as any);
    const models = await json(await app.request('/models'));
    const runtimes = await json(await app.request('/runtimes'));
    expect(models.data[0].kind).toBe('model');
    expect(runtimes.data[0].kind).toBe('runtime');
  });

  test('POST / persists model connections', async () => {
    const service = createMockConnectionService();
    const app = createConnectionRoutes(service as any);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'model',
        type: 'openai-compat',
        name: 'OpenAI Compat',
        enabled: true,
        config: { baseUrl: 'https://example.com' },
        capabilities: ['llm'],
      }),
    });
    expect(res.status).toBe(201);
    expect(service.saveConnection).toHaveBeenCalled();
  });

  test('POST /:id/test returns 404 for missing connection', async () => {
    const service = createMockConnectionService();
    service.testConnection.mockRejectedValueOnce(
      new Error('Connection not found'),
    );
    const app = createConnectionRoutes(service as any);
    const res = await app.request('/missing/test', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
