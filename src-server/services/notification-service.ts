/**
 * NotificationService — multi-provider notification aggregator.
 * Uses JsonFileStore for persistence and EventBus for real-time delivery.
 */

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Notification, ScheduleNotificationOpts } from '@stallion-ai/shared';
import type { INotificationProvider } from '../providers/types.js';
import type { EventBus } from './event-bus.js';
import { JsonFileStore } from './json-store.js';
import { notificationOps } from '../telemetry/metrics.js';

export class NotificationService {
  private providers = new Map<string, INotificationProvider>();
  private store: JsonFileStore<Notification[]>;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private eventBus: EventBus,
    dataDir: string,
    private pollIntervalMs = 60_000,
  ) {
    this.store = new JsonFileStore(join(dataDir, 'notifications.json'), []);
  }

  addProvider(provider: INotificationProvider): void {
    this.providers.set(provider.id, provider);
  }

  listProviders(): Array<{ id: string; displayName: string; categories: string[] }> {
    return [...this.providers.values()].map(p => ({
      id: p.id,
      displayName: p.displayName,
      categories: [...p.categories],
    }));
  }

  start(): void {
    // Reschedule any persisted pending notifications
    for (const n of this.store.read()) {
      if (n.status === 'pending' && n.scheduledAt) this.scheduleTimer(n);
    }
    // Start provider polling
    if (this.providers.size > 0) {
      this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
      this.poll();
    }
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  schedule(source: string, opts: ScheduleNotificationOpts): Notification {
    const now = new Date().toISOString();
    const all = this.store.read();

    // Dedupe by tag
    if (opts.dedupeTag) {
      const existing = all.find(n => (n.metadata as any)?.dedupeTag === opts.dedupeTag && n.status !== 'dismissed');
      if (existing) {
        Object.assign(existing, { title: opts.title, body: opts.body, updatedAt: now });
        this.store.write(all);
        return existing;
      }
    }

    notificationOps.add(1, { op: 'schedule' });
    const notification: Notification = {
      id: randomUUID(),
      source,
      category: opts.category,
      title: opts.title,
      body: opts.body,
      priority: opts.priority ?? 'normal',
      status: opts.scheduledAt ? 'pending' : 'delivered',
      scheduledAt: opts.scheduledAt ?? null,
      deliveredAt: opts.scheduledAt ? null : now,
      ttl: opts.ttl,
      actions: opts.actions,
      metadata: { ...opts.metadata, dedupeTag: opts.dedupeTag },
      createdAt: now,
      updatedAt: now,
    };

    all.push(notification);
    this.store.write(all);

    if (notification.status === 'delivered') {
      this.eventBus.emit('notification:delivered', notification as unknown as Record<string, unknown>);
      if (notification.ttl && notification.ttl > 0) {
        this.timers.set(notification.id, setTimeout(() => this.expire(notification.id), notification.ttl));
      }
    } else {
      this.scheduleTimer(notification);
    }

    return notification;
  }

  dismiss(id: string): void {
    notificationOps.add(1, { op: 'dismiss' });
    this.updateStatus(id, 'dismissed');
    this.clearTimer(id);
    this.eventBus.emit('notification:dismissed', { id });
    const n = this.store.read().find(n => n.id === id);
    if (n) {
      const provider = this.providers.get(n.source);
      provider?.handleDismiss?.(id);
    }
  }

  async action(id: string, actionId: string): Promise<void> {
    const n = this.store.read().find(n => n.id === id);
    if (!n) return;
    const provider = this.providers.get(n.source);
    await provider?.handleAction?.(id, actionId);
    this.updateStatus(id, 'actioned');
    this.clearTimer(id);
    this.eventBus.emit('notification:updated', { id, status: 'actioned' });
  }

  snooze(id: string, until: string): void {
    const all = this.store.read();
    const n = all.find(n => n.id === id);
    if (!n) return;
    notificationOps.add(1, { op: 'snooze' });
    n.status = 'pending';
    n.scheduledAt = until;
    n.updatedAt = new Date().toISOString();
    this.store.write(all);
    this.clearTimer(id);
    this.scheduleTimer(n);
    this.eventBus.emit('notification:updated', { id, status: 'pending' });
  }

  list(opts?: { status?: string[]; category?: string[] }): Notification[] {
    let results = this.store.read();
    if (opts?.status?.length) results = results.filter(n => opts.status!.includes(n.status));
    if (opts?.category?.length) results = results.filter(n => opts.category!.includes(n.category));
    return results;
  }

  clearAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.store.write([]);
    this.eventBus.emit('notification:cleared', {});
  }

  private scheduleTimer(n: Notification): void {
    if (!n.scheduledAt) return;
    const delay = Math.max(0, new Date(n.scheduledAt).getTime() - Date.now());
    this.timers.set(n.id, setTimeout(() => this.deliver(n.id), delay));
  }

  private deliver(id: string): void {
    this.clearTimer(id);
    const all = this.store.read();
    const n = all.find(n => n.id === id);
    if (!n || n.status !== 'pending') return;
    notificationOps.add(1, { op: 'deliver' });
    n.status = 'delivered';
    n.deliveredAt = new Date().toISOString();
    n.updatedAt = n.deliveredAt;
    this.store.write(all);
    this.eventBus.emit('notification:delivered', n as unknown as Record<string, unknown>);
    if (n.ttl && n.ttl > 0) {
      this.timers.set(id, setTimeout(() => this.expire(id), n.ttl));
    }
  }

  private expire(id: string): void {
    this.updateStatus(id, 'expired');
    this.clearTimer(id);
    this.eventBus.emit('notification:updated', { id, status: 'expired' });
  }

  private updateStatus(id: string, status: Notification['status']): void {
    const all = this.store.read();
    const n = all.find(n => n.id === id);
    if (!n) return;
    n.status = status;
    n.updatedAt = new Date().toISOString();
    this.store.write(all);
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }

  private async poll(): Promise<void> {
    for (const provider of this.providers.values()) {
      if (!provider.poll) continue;
      try {
        const items = await provider.poll();
        for (const opts of items) this.schedule(provider.id, opts);
      } catch { /* provider poll failure is non-fatal */ }
    }
  }
}
