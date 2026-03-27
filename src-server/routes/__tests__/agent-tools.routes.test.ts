import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  toolCalls: { add: vi.fn() },
}));

const { createAgentToolRoutes } = await import('../agent-tools.js');

function createMockRuntimeContext() {
  return {
    activeAgents: new Map([['default', { model: 'claude-3' }]]),
    agentTools: new Map([
      [
        'default',
        [{ name: 'myServer_read', id: 't1', description: 'Read files' }],
      ],
    ]),
    toolNameMapping: new Map([
      [
        'myServer_read',
        {
          original: 'read',
          normalized: 'myServer_read',
          server: 'myServer',
          tool: 'read',
        },
      ],
    ]),
    agentSpecs: new Map([['default', { tools: { mcpServers: ['myServer'] } }]]),
    agentStatus: new Map([['default', 'idle']]),
    mcpConnectionStatus: new Map([['default:myServer', { connected: true }]]),
    integrationMetadata: new Map([
      ['default:myServer', { type: 'mcp', transport: 'stdio', toolCount: 1 }],
    ]),
    memoryAdapters: new Map([['default', {}]]),
    configLoader: {
      loadAgent: vi.fn().mockResolvedValue({
        tools: { mcpServers: ['myServer'], available: ['*'] },
      }),
      updateAgent: vi.fn().mockResolvedValue(undefined),
    },
    initialize: vi.fn().mockResolvedValue(undefined),
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Agent Tool Routes', () => {
  test('GET /:slug/tools returns tool list', async () => {
    const app = createAgentToolRoutes(createMockRuntimeContext() as any);
    const body = await json(await app.request('/default/tools'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].server).toBe('myServer');
  });

  test('GET /:slug/tools returns 404 for unknown agent', async () => {
    const app = createAgentToolRoutes(createMockRuntimeContext() as any);
    const res = await app.request('/unknown/tools');
    expect(res.status).toBe(404);
  });

  test('POST /:slug/tools adds tool to agent', async () => {
    const ctx = createMockRuntimeContext();
    const app = createAgentToolRoutes(ctx as any);
    const body = await json(
      await app.request('/default/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: 'newServer' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(ctx.initialize).toHaveBeenCalled();
  });

  test('DELETE /:slug/tools/:toolId removes tool', async () => {
    const ctx = createMockRuntimeContext();
    const app = createAgentToolRoutes(ctx as any);
    const body = await json(
      await app.request('/default/tools/myServer', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
  });

  test('GET /:slug/health returns health status', async () => {
    const app = createAgentToolRoutes(createMockRuntimeContext() as any);
    const body = await json(await app.request('/default/health'));
    expect(body.success).toBe(true);
    expect(body.healthy).toBe(true);
    expect(body.checks.loaded).toBe(true);
    expect(body.integrations).toHaveLength(1);
  });

  test('GET /:slug/health returns 404 for unknown agent', async () => {
    const app = createAgentToolRoutes(createMockRuntimeContext() as any);
    const res = await app.request('/unknown/health');
    expect(res.status).toBe(404);
  });
});
