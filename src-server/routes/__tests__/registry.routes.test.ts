import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  registryOps: { add: vi.fn() },
}));

vi.mock('../../providers/registry.js', () => {
  const integrationProvider = {
    listAvailable: vi.fn().mockResolvedValue([]),
    listInstalled: vi.fn().mockResolvedValue([]),
    install: vi.fn().mockResolvedValue({ success: true }),
    uninstall: vi.fn().mockResolvedValue({ success: true }),
    getToolDef: vi.fn().mockResolvedValue(null),
    sync: vi.fn().mockResolvedValue(undefined),
  };
  const skillProvider = {
    listAvailable: vi
      .fn()
      .mockResolvedValue([
        { id: 's1', name: 'Skill 1', description: 'A skill' },
      ]),
    getContent: vi.fn().mockResolvedValue('# Skill content'),
  };
  return {
    getSkillRegistryProviders: vi
      .fn()
      .mockReturnValue([{ provider: skillProvider, source: 'test' }]),
    getAgentRegistryProvider: vi.fn().mockReturnValue({
      listAvailable: vi.fn().mockResolvedValue([]),
      listInstalled: vi.fn().mockResolvedValue([]),
      install: vi.fn().mockResolvedValue({ success: true }),
      uninstall: vi.fn().mockResolvedValue({ success: true }),
    }),
    getIntegrationRegistryProvider: vi
      .fn()
      .mockReturnValue(integrationProvider),
    __integrationProvider: integrationProvider,
  };
});

vi.mock('../plugin-install-shared.js', () => ({
  installPluginFromSource: vi.fn().mockResolvedValue({
    success: true,
    plugin: {
      name: 'p1',
      displayName: 'Plugin 1',
      version: '1.0.0',
      hasBundle: true,
      agents: [],
    },
    tools: [],
    dependencies: [],
    permissions: { autoGranted: [], pendingConsent: [] },
  }),
  readRegistryPluginAvailability: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      displayName: 'Plugin 1',
      version: '1.0.0',
      source: 'test',
      installed: true,
    },
  ]),
  resolvePluginRegistrySource: vi
    .fn()
    .mockResolvedValue('/tmp/registry/plugin-one'),
  uninstallInstalledPlugin: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../services/skill-service.js', () => ({
  SkillService: vi.fn(),
}));

const { createRegistryRoutes } = await import('../registry.js');
const { __integrationProvider } = await import('../../providers/registry.js');
const {
  installPluginFromSource,
  readRegistryPluginAvailability,
  resolvePluginRegistrySource,
  uninstallInstalledPlugin,
} = await import('../plugin-install-shared.js');

function setup() {
  const configLoader = {
    getProjectHomeDir: vi.fn().mockReturnValue('/tmp'),
    saveIntegration: vi.fn(),
    deleteIntegration: vi.fn().mockResolvedValue(undefined),
  };
  const refreshACPModes = vi.fn().mockResolvedValue(undefined);
  const reloadSkills = vi.fn().mockResolvedValue(undefined);
  const skillService = {
    installSkill: vi.fn().mockResolvedValue({ success: true }),
    removeSkill: vi.fn().mockResolvedValue({ success: true }),
  };
  const app = createRegistryRoutes(
    configLoader as any,
    refreshACPModes,
    reloadSkills,
    skillService as any,
    { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any },
  );
  return { app, configLoader, refreshACPModes, reloadSkills, skillService };
}

async function json(res: Response) {
  return res.json();
}

describe('Registry Routes', () => {
  test('POST /integrations/install saves the tool definition when one is provided', async () => {
    const { app, configLoader } = setup();
    __integrationProvider.getToolDef.mockResolvedValueOnce({
      id: 'filesystem',
      kind: 'mcp',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });

    const body = await json(
      await app.request('/integrations/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'filesystem' }),
      }),
    );

    expect(body.success).toBe(true);
    expect(configLoader.saveIntegration).toHaveBeenCalledWith(
      'filesystem',
      expect.objectContaining({
        command: 'npx',
      }),
    );
  });

  test('DELETE /integrations/:id removes the saved integration config after uninstall', async () => {
    const { app, configLoader } = setup();

    const body = await json(
      await app.request('/integrations/filesystem', { method: 'DELETE' }),
    );

    expect(body.success).toBe(true);
    expect(configLoader.deleteIntegration).toHaveBeenCalledWith('filesystem');
  });

  test('GET /plugins returns { success, data } array with installed state', async () => {
    const { app } = setup();
    const body = await json(await app.request('/plugins'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 'p1',
      installed: true,
      source: 'test',
    });
    expect(readRegistryPluginAvailability).toHaveBeenCalled();
  });

  test('POST /plugins/install resolves the source and passes the registry id into the install pipeline', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(resolvePluginRegistrySource).toHaveBeenCalledWith('p1');
    expect(installPluginFromSource).toHaveBeenCalledWith(
      '/tmp/registry/plugin-one',
      [],
      expect.objectContaining({
        agentsDir: '/tmp/agents',
        pluginsDir: '/tmp/plugins',
        projectHomeDir: '/tmp',
      }),
      { registryId: 'p1' },
    );
  });

  test('DELETE /plugins/:id removes the installed plugin through the shared lifecycle path', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/plugins/p1', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
    expect(uninstallInstalledPlugin).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        agentsDir: '/tmp/agents',
        pluginsDir: '/tmp/plugins',
        projectHomeDir: '/tmp',
      }),
    );
  });

  test('GET /skills returns { success, data } array with id/name', async () => {
    const { app } = setup();
    const body = await json(await app.request('/skills'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('name');
  });

  test('POST /skills/install returns { success }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 's1' }),
      }),
    );
    expect(body.success).toBe(true);
  });

  test('DELETE /skills/:id returns { success }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/skills/s1', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
  });

  test('POST /skills/:id/update returns { success }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/skills/s1/update', { method: 'POST' }),
    );
    expect(body.success).toBe(true);
  });

  test('GET /skills/:id/content returns { success, data: string }', async () => {
    const { app } = setup();
    const body = await json(await app.request('/skills/s1/content'));
    expect(body.success).toBe(true);
    expect(typeof body.data).toBe('string');
  });
});
