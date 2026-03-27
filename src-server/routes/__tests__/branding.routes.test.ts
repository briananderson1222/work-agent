import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  providerOps: { add: vi.fn() },
}));
vi.mock('../../providers/registry.js', () => ({
  getBrandingProvider: () => ({
    getAppName: async () => 'Stallion AI',
    getLogo: async () => null,
    getTheme: async () => ({ primary: '#000' }),
    getWelcomeMessage: async () => 'Hello!',
  }),
}));

const { createBrandingRoutes } = await import('../branding.js');

async function json(res: Response) {
  return res.json();
}

describe('Branding Routes', () => {
  test('GET / returns branding config', async () => {
    const app = createBrandingRoutes();
    const body = await json(await app.request('/'));
    expect(body.data.name).toBe('Stallion AI');
    expect(body.data.theme).toEqual({ primary: '#000' });
    expect(body.data.welcomeMessage).toBe('Hello!');
  });
});
