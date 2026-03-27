import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  fileTreeOps: { add: vi.fn() },
}));

const { createFsRoutes } = await import('../fs.js');

async function json(res: Response) {
  return res.json();
}

describe('FS Routes', () => {
  test('GET /browse returns directories for home', async () => {
    const app = createFsRoutes();
    const body = await json(await app.request('/browse'));
    expect(body.data.path).toBeDefined();
    expect(Array.isArray(body.data.entries)).toBe(true);
  });

  test('GET /browse with explicit path', async () => {
    const app = createFsRoutes();
    const body = await json(await app.request('/browse?path=/tmp'));
    expect(body.data.path).toBe('/tmp');
  });

  test('GET /browse returns 404 for invalid path', async () => {
    const app = createFsRoutes();
    const res = await app.request('/browse?path=/nonexistent/path/xyz');
    expect(res.status).toBe(404);
  });
});
