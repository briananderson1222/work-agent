import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  notificationOps: { add: vi.fn() },
}));

const { NotificationService } = await import('../notification-service.js');
const { EventBus } = await import('../event-bus.js');

describe('NotificationService', () => {
  let dir: string;
  let bus: InstanceType<typeof EventBus>;
  let svc: InstanceType<typeof NotificationService>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'notif-test-'));
    bus = new EventBus();
    svc = new NotificationService(bus, dir, 999_999);
  });

  afterEach(() => {
    svc.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test('schedule creates an immediately delivered notification', () => {
    const n = svc.schedule('test', { title: 'Hello', body: 'World', category: 'test' });
    expect(n.status).toBe('delivered');
    expect(n.title).toBe('Hello');
  });

  test('list returns scheduled notifications', () => {
    svc.schedule('test', { title: 'A', body: '', category: 'a' });
    svc.schedule('test', { title: 'B', body: '', category: 'b' });
    expect(svc.list()).toHaveLength(2);
  });

  test('list filters by status', () => {
    svc.schedule('test', { title: 'A', body: '', category: 'a' });
    const n = svc.schedule('test', { title: 'B', body: '', category: 'b' });
    svc.dismiss(n.id);
    expect(svc.list({ status: ['delivered'] })).toHaveLength(1);
    expect(svc.list({ status: ['dismissed'] })).toHaveLength(1);
  });

  test('list filters by category', () => {
    svc.schedule('test', { title: 'A', body: '', category: 'alert' });
    svc.schedule('test', { title: 'B', body: '', category: 'info' });
    expect(svc.list({ category: ['alert'] })).toHaveLength(1);
  });

  test('dismiss changes status', () => {
    const n = svc.schedule('test', { title: 'X', body: '', category: 'c' });
    svc.dismiss(n.id);
    const found = svc.list({ status: ['dismissed'] });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(n.id);
  });

  test('snooze sets pending status and new scheduledAt', () => {
    const n = svc.schedule('test', { title: 'X', body: '', category: 'c' });
    const future = new Date(Date.now() + 60_000).toISOString();
    svc.snooze(n.id, future);
    const found = svc.list({ status: ['pending'] });
    expect(found).toHaveLength(1);
    expect(found[0].scheduledAt).toBe(future);
  });

  test('clearAll removes everything', () => {
    svc.schedule('test', { title: 'A', body: '', category: 'a' });
    svc.schedule('test', { title: 'B', body: '', category: 'b' });
    svc.clearAll();
    expect(svc.list()).toHaveLength(0);
  });

  test('dedupeTag updates existing instead of creating new', () => {
    svc.schedule('test', { title: 'V1', body: '', category: 'c', dedupeTag: 'dup' });
    svc.schedule('test', { title: 'V2', body: '', category: 'c', dedupeTag: 'dup' });
    const all = svc.list();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  test('schedule emits notification:delivered event', () => {
    const fn = vi.fn();
    bus.subscribe(fn);
    svc.schedule('test', { title: 'E', body: '', category: 'c' });
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notification:delivered' }),
    );
  });

  test('dismiss emits notification:dismissed event', () => {
    const n = svc.schedule('test', { title: 'E', body: '', category: 'c' });
    const fn = vi.fn();
    bus.subscribe(fn);
    svc.dismiss(n.id);
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notification:dismissed' }),
    );
  });

  test('listProviders returns empty when none registered', () => {
    expect(svc.listProviders()).toEqual([]);
  });

  test('addProvider and listProviders', () => {
    svc.addProvider({ id: 'mock', displayName: 'Mock', categories: new Set(['test']), poll: async () => [] } as any);
    const providers = svc.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('mock');
  });
});
