import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  pluginInstalls: { add: vi.fn() },
  pluginUninstalls: { add: vi.fn() },
  pluginUpdates: { add: vi.fn() },
  pluginSettingsUpdates: { add: vi.fn() },
}));

vi.mock('../../providers/registry.js', () => ({
  getAgentRegistryProvider: vi
    .fn()
    .mockReturnValue({ listInstalled: vi.fn().mockResolvedValue([]) }),
  getIntegrationRegistryProvider: vi
    .fn()
    .mockReturnValue({ listInstalled: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../../services/plugin-permissions.js', () => ({
  getPermissionTier: vi.fn().mockReturnValue('standard'),
  getPluginGrants: vi.fn().mockReturnValue(['network']),
  grantPermissions: vi.fn(),
  hasGrant: vi.fn().mockReturnValue(true),
  processInstallPermissions: vi.fn(),
  revokeAllGrants: vi.fn(),
}));

const mockManifest = {
  name: 'test-plugin',
  displayName: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  permissions: ['network'],
  settings: [
    { key: 'apiKey', label: 'API Key', type: 'string', default: 'default-val' },
  ],
  providers: [{ type: 'test-provider', module: 'provider.js' }],
  layout: { slug: 'test-layout', source: 'layout.js' },
  agents: [],
  links: null,
};

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (typeof p === 'string' && p.includes('nonexistent')) return false;
      if (typeof p === 'string' && p.includes('plugins')) return true;
      if (typeof p === 'string' && p.includes('dist/bundle')) return true;
      return false;
    }),
    readdirSync: vi
      .fn()
      .mockReturnValue([{ name: 'test-plugin', isDirectory: () => true }]),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify(mockManifest)),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:fs/promises', () => ({
  readdir: vi
    .fn()
    .mockResolvedValue([{ name: 'test-plugin', isDirectory: () => true }]),
  readFile: vi.fn().mockResolvedValue(JSON.stringify(mockManifest)),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: any,
      cb: (
        error: Error | null,
        result: { stdout: string; stderr: string },
      ) => void,
    ) => cb(null, { stdout: '', stderr: '' }),
  ),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  };
});

vi.mock('@stallion-ai/shared', () => ({
  buildPlugin: vi.fn().mockResolvedValue({ built: false }),
  copyPluginIntegrations: vi.fn(),
}));

const mockOverrides: Record<string, any> = {};
vi.mock('../../domain/config-loader.js', () => ({
  ConfigLoader: vi.fn().mockImplementation(() => ({
    loadPluginOverrides: vi.fn().mockResolvedValue(mockOverrides),
    savePluginOverrides: vi
      .fn()
      .mockImplementation(async (o: any) => Object.assign(mockOverrides, o)),
  })),
}));

const { createPluginRoutes } = await import('../plugins.js');

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const eventBus = { emit: vi.fn() };

function setup() {
  return createPluginRoutes('/tmp/project', logger as any, eventBus as any);
}

async function json(res: Response) {
  return res.json();
}

describe('Plugin Routes', () => {
  // ── GET / — SDK usePluginsQuery reads json.plugins ──

  test('GET / returns { plugins } with fields the UI reads', async () => {
    const app = setup();
    const body = await json(await app.request('/'));
    expect(body.plugins).toBeDefined();
    expect(Array.isArray(body.plugins)).toBe(true);
    const p = body.plugins[0];
    // PluginManagementView reads these fields
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('displayName');
    expect(p).toHaveProperty('version');
    expect(p).toHaveProperty('description');
    expect(p).toHaveProperty('hasBundle');
    expect(p).toHaveProperty('hasSettings');
    expect(p).toHaveProperty('permissions');
    expect(p.permissions).toHaveProperty('declared');
    expect(p.permissions).toHaveProperty('granted');
    expect(p.permissions).toHaveProperty('missing');
  });

  // ── GET /:name/settings — UI reads settingsData.schema and settingsData.values ──

  test('GET /:name/settings returns { schema, values }', async () => {
    const app = setup();
    const body = await json(await app.request('/test-plugin/settings'));
    expect(body.schema).toBeDefined();
    expect(Array.isArray(body.schema)).toBe(true);
    expect(body.schema[0]).toHaveProperty('key');
    expect(body.schema[0]).toHaveProperty('label');
    expect(body.values).toBeDefined();
    // Default value should be populated
    expect(body.values.apiKey).toBe('default-val');
  });

  test('GET /:name/settings returns 404 for missing plugin', async () => {
    const app = setup();
    const res = await app.request('/nonexistent/settings');
    expect(res.status).toBe(404);
  });

  // ── PUT /:name/settings — returns { success: true } ──

  test('PUT /:name/settings saves and returns { success: true }', async () => {
    const app = setup();
    const body = await json(
      await app.request('/test-plugin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { apiKey: 'new-key' } }),
      }),
    );
    expect(body).toEqual({ success: true });
  });

  // ── GET /:name/providers — UI reads data.providers as array ──

  test('GET /:name/providers returns { providers } with enabled flag', async () => {
    const app = setup();
    const body = await json(await app.request('/test-plugin/providers'));
    expect(body.providers).toBeDefined();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers[0]).toMatchObject({
      type: 'test-provider',
      module: 'provider.js',
      enabled: true,
    });
  });

  // ── GET /:name/overrides — returns raw object ──

  test('GET /:name/overrides returns raw overrides object', async () => {
    const app = setup();
    const body = await json(await app.request('/test-plugin/overrides'));
    expect(typeof body).toBe('object');
  });

  // ── PUT /:name/overrides — returns { success: true } ──

  test('PUT /:name/overrides saves and returns { success: true }', async () => {
    const app = setup();
    const body = await json(
      await app.request('/test-plugin/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: ['test-provider'] }),
      }),
    );
    expect(body).toEqual({ success: true });
  });
});
