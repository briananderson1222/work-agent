import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  toolCalls: { add: vi.fn() },
}));

const { createToolRoutes } = await import('../tools.js');

function createMockMCPService() {
  return {
    listIntegrations: vi.fn().mockResolvedValue([{ id: 'mcp-1', name: 'Test MCP' }]),
    getToolAgentMap: vi.fn().mockResolvedValue({ 'mcp-1': ['default'] }),
    getConnectionStatus: vi.fn().mockReturnValue({ connected: true }),
    saveIntegration: vi.fn().mockResolvedValue(undefined),
    getIntegration: vi.fn().mockResolvedValue({ id: 'mcp-1', name: 'Test MCP', type: 'stdio' }),
    deleteIntegration: vi.fn().mockResolvedValue(undefined),
  };
}

async function json(res: Response) { return res.json(); }

describe('Tool Routes', () => {
  test('GET / lists tools with agent usage', async () => {
    const app = createToolRoutes(createMockMCPService() as any, vi.fn());
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data[0].usedBy).toEqual(['default']);
  });

  test('POST / saves integration', async () => {
    const svc = createMockMCPService();
    const app = createToolRoutes(svc as any, vi.fn());
    const body = await json(await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'new', name: 'New', type: 'stdio' }),
    }));
    expect(body.success).toBe(true);
    expect(svc.saveIntegration).toHaveBeenCalled();
  });

  test('GET /:id returns integration', async () => {
    const app = createToolRoutes(createMockMCPService() as any, vi.fn());
    const body = await json(await app.request('/mcp-1'));
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('mcp-1');
  });

  test('DELETE /:id removes integration', async () => {
    const svc = createMockMCPService();
    const app = createToolRoutes(svc as any, vi.fn());
    const body = await json(await app.request('/mcp-1', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(svc.deleteIntegration).toHaveBeenCalledWith('mcp-1');
  });
});
