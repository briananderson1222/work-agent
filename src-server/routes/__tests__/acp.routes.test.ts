import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  acpOps: { add: vi.fn() },
}));
vi.mock('../../providers/registry.js', () => ({
  listProviders: () => [],
}));

const { createACPRoutes } = await import('../acp.js');

function createMockRuntimeContext() {
  return {
    acpBridge: {
      getStatus: vi.fn().mockReturnValue({ connected: false, connections: [] }),
      getSlashCommands: vi.fn().mockReturnValue([]),
      getCommandOptions: vi.fn().mockResolvedValue([]),
      addConnection: vi.fn().mockResolvedValue(undefined),
      removeConnection: vi.fn().mockResolvedValue(undefined),
    },
    configLoader: {
      loadACPConfig: vi.fn().mockResolvedValue({ connections: [] }),
      saveACPConfig: vi.fn().mockResolvedValue(undefined),
    },
  };
}

async function json(res: Response) {
  return res.json();
}

describe('ACP Routes', () => {
  test('GET /status returns ACP status', async () => {
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/status'));
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(false);
  });

  test('GET /commands/:slug returns slash commands', async () => {
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/commands/kiro'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('GET /connections returns connection list', async () => {
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/connections'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST /connections creates connection', async () => {
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(
      await app.request('/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test', command: 'kiro-cli', name: 'Test' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('test');
  });

  test('POST /connections returns 409 for duplicate', async () => {
    const ctx = createMockRuntimeContext();
    ctx.configLoader.loadACPConfig.mockResolvedValue({
      connections: [{ id: 'test', command: 'x' }],
    });
    const app = createACPRoutes(ctx as any);
    const res = await app.request('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test', command: 'kiro-cli' }),
    });
    expect(res.status).toBe(409);
  });
});
