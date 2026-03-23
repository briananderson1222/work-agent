import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  codingOps: { add: vi.fn() },
  fileTreeOps: { add: vi.fn() },
}));

const { createCodingRoutes } = await import('../coding.js');
const { FileTreeService } = await import('../../services/file-tree-service.js');

async function json(res: Response) { return res.json(); }

describe('Coding Routes', () => {
  test('GET /files returns file tree', async () => {
    const svc = new FileTreeService();
    const app = createCodingRoutes(svc);
    const body = await json(await app.request('/files?path=/tmp'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /files returns 400 without path', async () => {
    const app = createCodingRoutes(new FileTreeService());
    const res = await app.request('/files');
    expect(res.status).toBe(400);
  });

  test('GET /files returns 400 for nonexistent path', async () => {
    const app = createCodingRoutes(new FileTreeService());
    const res = await app.request('/files?path=/nonexistent/xyz');
    expect(res.status).toBe(400);
  });

  test('GET /files/search returns 400 without query', async () => {
    const app = createCodingRoutes(new FileTreeService());
    const res = await app.request('/files/search?path=/tmp');
    expect(res.status).toBe(400);
  });

  test('GET /files/content returns 400 without path', async () => {
    const app = createCodingRoutes(new FileTreeService());
    const res = await app.request('/files/content');
    expect(res.status).toBe(400);
  });

  test('GET /files/content returns 500 for missing file', async () => {
    const app = createCodingRoutes(new FileTreeService());
    const res = await app.request('/files/content?path=/nonexistent/file.txt');
    expect(res.status).toBe(500);
  });
});
