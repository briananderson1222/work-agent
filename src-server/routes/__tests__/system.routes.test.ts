import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  systemOps: { add: vi.fn() },
}));
vi.mock('../../providers/bedrock.js', () => ({
  checkBedrockCredentials: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../providers/registry.js', () => ({
  getAllPrerequisites: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/skill-service.js', () => ({
  SkillService: vi.fn(),
}));

const { createSystemRoutes } = await import('../system.js');
const { checkBedrockCredentials } = await import('../../providers/bedrock.js');

function createMockDeps() {
  return {
    getACPStatus: () => ({ connected: false, connections: [] }),
    listProviderConnections: () => [],
    checkOllamaAvailability: async () => false,
    getAppConfig: () => ({
      region: 'us-east-1',
      defaultModel: 'claude-3',
      runtime: 'voltagent',
    }),
    appConfig: { runtime: 'voltagent' },
    port: 3141,
    skillService: {
      listSkills: () => [{ name: 'test-skill', description: 'A test' }],
    },
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

async function json(res: Response) {
  return res.json();
}

describe('System Routes', () => {
  test('GET /status returns readiness check', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/status'));
    expect(body.bedrock).toBeDefined();
    expect(body.acp).toBeDefined();
    expect(body.capabilities.chat.ready).toBe(true);
    expect(body.recommendation).toEqual(
      expect.objectContaining({
        type: 'providers',
      }),
    );
    expect(body.clis).toEqual(
      expect.objectContaining({
        codex: expect.any(Boolean),
        claude: expect.any(Boolean),
      }),
    );
    expect(body.ready).toBe(true);
  });

  test('GET /status is ready when a configured provider exists without bedrock credentials', async () => {
    const app = createSystemRoutes(
      {
        ...createMockDeps(),
        getACPStatus: () => ({ connected: false, connections: [] }),
        listProviderConnections: () => [
          {
            id: 'ollama-local',
            type: 'ollama',
            enabled: true,
            capabilities: ['llm'],
          },
        ],
        getAppConfig: () => ({
          defaultModel: 'claude-3',
          runtime: 'voltagent',
        }),
      } as any,
      mockLogger,
    );
    const body = await json(await app.request('/status'));
    expect(body.ready).toBe(true);
    expect(body.capabilities.chat.source).toBe('ollama');
    expect(body.recommendation.title).toContain('already configured');
    expect(body.providers.configured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ollama',
          enabled: true,
          capabilities: ['llm'],
        }),
      ]),
    );
  });

  test('GET /status stays not ready when only non-llm providers are configured', async () => {
    vi.mocked(checkBedrockCredentials).mockResolvedValueOnce(false);

    const app = createSystemRoutes(
      {
        ...createMockDeps(),
        listProviderConnections: () => [
          {
            id: 'lancedb-builtin',
            type: 'lancedb',
            enabled: true,
            capabilities: ['vectordb'],
          },
        ],
        getAppConfig: () => ({
          defaultModel: 'claude-3',
          runtime: 'voltagent',
        }),
      } as any,
      mockLogger,
    );
    const body = await json(await app.request('/status'));
    expect(body.ready).toBe(false);
    expect(body.capabilities.chat.ready).toBe(false);
    expect(['connections', 'runtimes']).toContain(body.recommendation.type);
    expect(body.providers.configured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'lancedb',
          capabilities: ['vectordb'],
        }),
      ]),
    );
  });

  test('GET /capabilities returns manifest', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/capabilities'));
    expect(body.runtime).toBe('voltagent');
    expect(body.voice).toBeDefined();
    expect(body.scheduler).toBe(true);
  });

  test('GET /discover returns beacon', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/discover'));
    expect(body.stallion).toBe(true);
  });

  test('GET /runtime returns runtime type', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/runtime'));
    expect(body.runtime).toBe('voltagent');
  });

  test('GET /skills returns skill list', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/skills'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET /terminal-port returns port + 1', async () => {
    const app = createSystemRoutes(createMockDeps() as any, mockLogger);
    const body = await json(await app.request('/terminal-port'));
    expect(body.port).toBe(3142);
  });
});
