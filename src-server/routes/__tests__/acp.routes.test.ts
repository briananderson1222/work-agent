import { beforeEach, describe, expect, test, vi } from 'vitest';

let providerEntries: Array<{
  builtin?: boolean;
  source: string;
  provider: any;
}> = [];

vi.mock('../../telemetry/metrics.js', () => ({
  acpOps: { add: vi.fn() },
}));
vi.mock('../../providers/registry.js', () => ({
  listProviders: (type: string) =>
    providerEntries.filter((entry) => entry.source.startsWith(type)),
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
  beforeEach(() => {
    providerEntries = [];
  });

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

  test('GET /registry returns ACP connection registry entries', async () => {
    providerEntries = [
      {
        source: 'acpConnectionRegistry:core',
        builtin: true,
        provider: {
          listAvailable: () => [
            {
              id: 'kiro',
              name: 'Kiro CLI',
              command: 'kiro-cli',
              args: ['acp'],
            },
          ],
        },
      },
    ];
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/registry'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        id: 'kiro',
        name: 'Kiro CLI',
        command: 'kiro-cli',
        args: ['acp'],
        source: 'core',
        sourceName: 'acpConnectionRegistry:core',
        installed: false,
      },
    ]);
  });

  test('GET /registry marks saved and plugin-provided connections as installed', async () => {
    providerEntries = [
      {
        source: 'acpConnectionRegistry:core',
        builtin: true,
        provider: {
          listAvailable: () => [
            { id: 'kiro', name: 'Kiro CLI', command: 'kiro-cli' },
            { id: 'cursor', name: 'Cursor', command: 'cursor' },
          ],
        },
      },
      {
        source: 'acpConnections:plugin',
        provider: {
          getConnections: () => [{ id: 'cursor', name: 'Cursor' }],
        },
      },
    ];
    const ctx = createMockRuntimeContext();
    ctx.configLoader.loadACPConfig.mockResolvedValue({
      connections: [{ id: 'kiro', name: 'Kiro', command: 'kiro-cli' }],
    });
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/registry'));
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 'cursor',
        installed: true,
        installedSource: 'plugin',
      }),
      expect.objectContaining({
        id: 'kiro',
        installed: true,
        installedSource: 'user',
      }),
    ]);
  });

  test('GET /registry preserves saved config precedence when plugin connection uses same id', async () => {
    providerEntries = [
      {
        source: 'acpConnectionRegistry:core',
        builtin: true,
        provider: {
          listAvailable: () => [
            { id: 'kiro', name: 'Kiro CLI', command: 'kiro-cli' },
          ],
        },
      },
      {
        source: 'acpConnections:plugin',
        provider: {
          getConnections: () => [{ id: 'kiro', name: 'Plugin Kiro' }],
        },
      },
    ];
    const ctx = createMockRuntimeContext();
    ctx.configLoader.loadACPConfig.mockResolvedValue({
      connections: [{ id: 'kiro', name: 'User Kiro', command: 'kiro-cli' }],
    });
    const app = createACPRoutes(ctx as any);
    const body = await json(await app.request('/registry'));

    expect(body.data).toEqual([
      expect.objectContaining({
        id: 'kiro',
        installed: true,
        installedSource: 'user',
      }),
    ]);
  });

  test('POST /registry/:id/install saves an ACP registry entry as a user connection', async () => {
    providerEntries = [
      {
        source: 'acpConnectionRegistry:core',
        builtin: true,
        provider: {
          listAvailable: () => [
            {
              id: 'kiro',
              name: 'Kiro CLI',
              command: 'kiro-cli',
              args: ['acp'],
              icon: 'K',
            },
          ],
        },
      },
    ];
    const ctx = createMockRuntimeContext();
    const app = createACPRoutes(ctx as any);
    const body = await json(
      await app.request('/registry/kiro/install', { method: 'POST' }),
    );

    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: 'kiro',
      name: 'Kiro CLI',
      command: 'kiro-cli',
      args: ['acp'],
    });
    expect(ctx.configLoader.saveACPConfig).toHaveBeenCalledWith({
      connections: [
        expect.objectContaining({
          id: 'kiro',
          command: 'kiro-cli',
          args: ['acp'],
        }),
      ],
    });
    expect(ctx.acpBridge.addConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kiro' }),
    );
  });

  test('POST /registry/:id/install returns 409 when connection already exists', async () => {
    providerEntries = [
      {
        source: 'acpConnectionRegistry:core',
        builtin: true,
        provider: {
          listAvailable: () => [
            { id: 'kiro', name: 'Kiro CLI', command: 'kiro-cli' },
          ],
        },
      },
    ];
    const ctx = createMockRuntimeContext();
    ctx.configLoader.loadACPConfig.mockResolvedValue({
      connections: [{ id: 'kiro', command: 'kiro-cli' }],
    });
    const app = createACPRoutes(ctx as any);
    const res = await app.request('/registry/kiro/install', { method: 'POST' });
    expect(res.status).toBe(409);
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
