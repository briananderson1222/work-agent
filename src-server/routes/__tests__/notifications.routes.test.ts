import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  notificationOps: { add: vi.fn() },
}));

const { createNotificationRoutes } = await import('../notifications.js');
const { NotificationService } = await import('../../services/notification-service.js');
const { EventBus } = await import('../../services/event-bus.js');

async function json(res: Response) { return res.json(); }

describe('Notification Routes', () => {
  let dir: string;
  let svc: InstanceType<typeof NotificationService>;
  let app: ReturnType<typeof createNotificationRoutes>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'notif-routes-test-'));
    svc = new NotificationService(new EventBus(), dir, 999_999);
    app = createNotificationRoutes(svc);
  });

  afterEach(() => {
    svc.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test('GET / returns empty list', async () => {
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST / schedules a notification', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', body: 'Hello', category: 'test' }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test');
  });

  test('DELETE /:id dismisses a notification', async () => {
    const n = svc.schedule('test', { title: 'X', body: '', category: 'c' });
    const body = await json(await app.request(`/${n.id}`, { method: 'DELETE' }));
    expect(body.success).toBe(true);
  });

  test('DELETE / clears all', async () => {
    svc.schedule('test', { title: 'A', body: '', category: 'c' });
    const body = await json(await app.request('/', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(svc.list()).toHaveLength(0);
  });

  test('GET /providers returns provider list', async () => {
    const body = await json(await app.request('/providers'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST /:id/snooze snoozes a notification', async () => {
    const n = svc.schedule('test', { title: 'X', body: '', category: 'c' });
    const future = new Date(Date.now() + 60_000).toISOString();
    const body = await json(await app.request(`/${n.id}/snooze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ until: future }),
    }));
    expect(body.success).toBe(true);
  });
});
