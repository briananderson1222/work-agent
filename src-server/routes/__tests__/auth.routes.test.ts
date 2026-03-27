import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  authOps: { add: vi.fn() },
}));
vi.mock('../../providers/registry.js', () => ({
  getAuthProvider: () => ({
    getStatus: async () => ({ authenticated: true, method: 'sso' }),
    renew: async () => ({ success: true, message: 'Renewed' }),
  }),
  getUserIdentityProvider: () => ({
    getIdentity: async () => ({ alias: 'testuser', name: 'Test User' }),
  }),
  getUserDirectoryProvider: () => ({
    searchPeople: async (q: string) => [{ alias: q, name: q }],
    lookupPerson: async (alias: string) => ({ alias, name: alias }),
  }),
}));

const { createAuthRoutes, createUserRoutes } = await import('../auth.js');

async function json(res: Response) {
  return res.json();
}

describe('Auth Routes', () => {
  test('GET /status returns auth status', async () => {
    const app = createAuthRoutes();
    const body = await json(await app.request('/status'));
    expect(body.authenticated).toBe(true);
    expect(body.user).toBeDefined();
  });

  test('POST /renew returns success', async () => {
    const app = createAuthRoutes();
    const body = await json(await app.request('/renew', { method: 'POST' }));
    expect(body.success).toBe(true);
  });
});

describe('User Routes', () => {
  test('GET /search returns results', async () => {
    const app = createUserRoutes();
    const body = await json(await app.request('/search?q=test'));
    expect(body).toHaveLength(1);
  });

  test('GET /search returns empty for no query', async () => {
    const app = createUserRoutes();
    const body = await json(await app.request('/search'));
    expect(body).toEqual([]);
  });

  test('GET /:alias returns person', async () => {
    const app = createUserRoutes();
    const body = await json(await app.request('/testuser'));
    expect(body.alias).toBe('testuser');
  });
});
