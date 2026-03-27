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
  listSkills: () => [{ name: 'test-skill', description: 'A test' }],
}));

const { createSystemRoutes } = await import('../system.js');

function createMockDeps() {
  return {
    getACPStatus: () => ({ connected: false, connections: [] }),
    getAppConfig: () => ({
      region: 'us-east-1',
      defaultModel: 'claude-3',
      runtime: 'voltagent',
    }),
    appConfig: { runtime: 'voltagent' },
    port: 3141,
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
    expect(body.ready).toBe(true);
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
