import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  configOps: { add: vi.fn() },
}));

const { createConfigRoutes } = await import('../config.js');

function createMockConfigLoader() {
  let config = { defaultModel: 'claude-3', region: 'us-east-1' };
  return {
    loadAppConfig: vi.fn().mockImplementation(async () => ({ ...config })),
    updateAppConfig: vi.fn().mockImplementation(async (updates: any) => {
      config = { ...config, ...updates };
      return config;
    }),
  };
}

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

async function json(res: Response) { return res.json(); }

describe('Config Routes', () => {
  test('GET /app returns config', async () => {
    const loader = createMockConfigLoader();
    const app = createConfigRoutes(loader as any, mockLogger);
    const body = await json(await app.request('/app'));
    expect(body.success).toBe(true);
    expect(body.data.defaultModel).toBe('claude-3');
  });

  test('PUT /app updates config', async () => {
    const loader = createMockConfigLoader();
    const app = createConfigRoutes(loader as any, mockLogger);
    const res = await app.request('/app', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultModel: 'gpt-4' }),
    });
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.defaultModel).toBe('gpt-4');
  });

  test('PUT /app emits event when eventBus provided', async () => {
    const loader = createMockConfigLoader();
    const eventBus = { emit: vi.fn() };
    const app = createConfigRoutes(loader as any, mockLogger, eventBus as any);
    await app.request('/app', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: 'us-west-2' }),
    });
    expect(eventBus.emit).toHaveBeenCalledWith('system:status-changed', { source: 'config' });
  });

  test('PUT /app calls onConfigChanged callback', async () => {
    const loader = createMockConfigLoader();
    const cb = vi.fn();
    const app = createConfigRoutes(loader as any, mockLogger, undefined, cb);
    await app.request('/app', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: 'eu-west-1' }),
    });
    expect(cb).toHaveBeenCalled();
  });
});
