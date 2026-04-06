import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  registryOps: { add: vi.fn() },
}));

vi.mock('../../providers/registry.js', () => {
  const pluginProvider = {
    listAvailable: vi
      .fn()
      .mockResolvedValue([{ id: 'p1', name: 'Plugin 1', version: '1.0.0' }]),
    listInstalled: vi.fn().mockResolvedValue([]),
    install: vi.fn().mockResolvedValue({ success: true }),
    uninstall: vi.fn().mockResolvedValue({ success: true }),
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
    getPluginRegistryProviders: vi
      .fn()
      .mockReturnValue([{ provider: pluginProvider, source: 'test' }]),
    getSkillRegistryProviders: vi
      .fn()
      .mockReturnValue([{ provider: skillProvider, source: 'test' }]),
    getAgentRegistryProvider: vi.fn().mockReturnValue({
      listAvailable: vi.fn().mockResolvedValue([]),
      listInstalled: vi.fn().mockResolvedValue([]),
      install: vi.fn().mockResolvedValue({ success: true }),
      uninstall: vi.fn().mockResolvedValue({ success: true }),
    }),
    getIntegrationRegistryProvider: vi.fn().mockReturnValue({
      listAvailable: vi.fn().mockResolvedValue([]),
      listInstalled: vi.fn().mockResolvedValue([]),
      install: vi.fn().mockResolvedValue({ success: true }),
      uninstall: vi.fn().mockResolvedValue({ success: true }),
      getToolDef: vi.fn().mockResolvedValue(null),
      sync: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

vi.mock('../../services/skill-service.js', () => ({
  SkillService: vi.fn(),
}));

const { createRegistryRoutes } = await import('../registry.js');

function setup() {
  const configLoader = {
    getProjectHomeDir: vi.fn().mockReturnValue('/tmp'),
    saveIntegration: vi.fn(),
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
  );
  return { app, configLoader, refreshACPModes, reloadSkills, skillService };
}

async function json(res: Response) {
  return res.json();
}

describe('Registry Routes', () => {
  // ── Plugins — SDK useRegistryPluginsQuery expects { success, data } ──

  test('GET /plugins returns { success, data } array', async () => {
    const { app } = setup();
    const body = await json(await app.request('/plugins'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('source');
  });

  test('POST /plugins/install returns { success }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'p1' }),
      }),
    );
    expect(body.success).toBe(true);
  });

  test('DELETE /plugins/:id returns { success }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/plugins/p1', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
  });

  // ── Skills — SDK useRegistrySkillsQuery expects { success, data } ──

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

  // SDK useSkillContentQuery expects { success, data } where data is string
  test('GET /skills/:id/content returns { success, data: string }', async () => {
    const { app } = setup();
    const body = await json(await app.request('/skills/s1/content'));
    expect(body.success).toBe(true);
    expect(typeof body.data).toBe('string');
  });

  test('GET /skills/:id/content returns 404 for unknown skill', async () => {
    const { getSkillRegistryProviders } = await import(
      '../../providers/registry.js'
    );
    (getSkillRegistryProviders as any).mockReturnValue([
      {
        provider: {
          listAvailable: vi.fn(),
          getContent: vi.fn().mockResolvedValue(null),
        },
        source: 'test',
      },
    ]);
    const { app } = setup();
    const res = await app.request('/skills/unknown/content');
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.success).toBe(false);
  });
});
