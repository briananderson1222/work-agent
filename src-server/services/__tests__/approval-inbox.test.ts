import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ApprovalInboxNotificationProvider,
  wireApprovalInboxNotifications,
} from '../approval-inbox.js';
import { ApprovalRegistry } from '../approval-registry.js';
import { EventBus } from '../event-bus.js';
import { NotificationService } from '../notification-service.js';

vi.mock('../../telemetry/metrics.js', () => ({
  approvalDuration: { record: vi.fn() },
  approvalInboxOps: { add: vi.fn() },
  approvalOps: { add: vi.fn() },
  notificationOps: { add: vi.fn() },
}));

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('approval inbox notifications', () => {
  let bus: EventBus;
  let dir: string;
  let notificationService: NotificationService;
  let approvalRegistry: ApprovalRegistry;
  let orchestrationService: { dispatch: ReturnType<typeof vi.fn> };
  let provider: ApprovalInboxNotificationProvider;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-inbox-'));
    bus = new EventBus();
    notificationService = new NotificationService(bus, dir, 999_999);
    approvalRegistry = new ApprovalRegistry(logger, { eventBus: bus });
    orchestrationService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    provider = new ApprovalInboxNotificationProvider({
      approvalRegistry,
      orchestrationService,
    });
    notificationService.addProvider(provider);
    wireApprovalInboxNotifications(bus, provider, notificationService, logger);
    notificationService.start();
  });

  afterEach(() => {
    notificationService.stop();
    rmSync(dir, { force: true, recursive: true });
  });

  test('creates actionable notifications for orchestration approvals', async () => {
    bus.emit('orchestration:event', {
      event: {
        createdAt: new Date().toISOString(),
        method: 'request.opened',
        payload: { toolName: 'bash.exec' },
        provider: 'codex',
        requestId: 'req-1',
        requestType: 'approval',
        threadId: 'thread-1',
        title: 'Needs approval',
      },
    });

    const notifications = notificationService.list();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual(
      expect.objectContaining({
        category: 'approval-request',
        title: 'Needs approval',
        metadata: expect.objectContaining({
          sessionId: 'thread-1',
          sessionKind: 'runtime',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'acceptForSession' }),
        ]),
      }),
    );

    await notificationService.action(notifications[0].id, 'acceptForSession');

    expect(orchestrationService.dispatch).toHaveBeenCalledWith({
      type: 'respondToRequest',
      threadId: 'thread-1',
      requestId: 'req-1',
      decision: 'acceptForSession',
    });
  });

  test('marks orchestration notifications actioned when the request resolves', () => {
    bus.emit('orchestration:event', {
      event: {
        createdAt: new Date().toISOString(),
        method: 'request.opened',
        provider: 'claude',
        requestId: 'req-2',
        requestType: 'approval',
        threadId: 'thread-2',
        title: 'Needs approval',
      },
    });
    const [notification] = notificationService.list();

    bus.emit('orchestration:event', {
      event: {
        createdAt: new Date().toISOString(),
        method: 'request.resolved',
        provider: 'claude',
        requestId: 'req-2',
        status: 'approved',
        threadId: 'thread-2',
      },
    });

    expect(notificationService.list()[0]).toEqual(
      expect.objectContaining({
        id: notification.id,
        status: 'actioned',
      }),
    );
    expect(orchestrationService.dispatch).not.toHaveBeenCalled();
  });

  test('creates notifications for approval registry requests and actions them through the registry', async () => {
    const approvalPromise = approvalRegistry.register('approval-1', {
      metadata: {
        agentName: 'Workspace Agent',
        source: 'runtime',
        title: 'fs.read',
        toolName: 'fs.read',
      },
    });

    const [notification] = notificationService.list();
    expect(notification.body).toContain('Workspace Agent wants to use fs.read');
    expect(notification.metadata).toEqual(
      expect.objectContaining({
        sessionKind: 'managed',
      }),
    );

    await notificationService.action(notification.id, 'accept');

    await expect(approvalPromise).resolves.toBe(true);
  });

  test('rejects unknown approval actions instead of failing open', async () => {
    bus.emit('orchestration:event', {
      event: {
        createdAt: new Date().toISOString(),
        method: 'request.opened',
        provider: 'codex',
        requestId: 'req-3',
        requestType: 'approval',
        threadId: 'thread-3',
        title: 'Needs approval',
      },
    });

    const [orchestrationNotification] = notificationService.list();
    await expect(
      notificationService.action(orchestrationNotification.id, 'allow-all'),
    ).rejects.toThrow('Unsupported orchestration approval action');

    const registryApprovalPromise = approvalRegistry.register('approval-2', {
      metadata: {
        agentName: 'Workspace Agent',
        title: 'fs.write',
        toolName: 'fs.write',
      },
    });
    const notifications = notificationService.list();
    const registryNotification = notifications.find(
      (item) => item.metadata?.approvalId === 'approval-2',
    );
    if (!registryNotification) {
      throw new Error('Expected registry notification');
    }

    await expect(
      notificationService.action(registryNotification.id, 'allow-all'),
    ).rejects.toThrow('Unsupported registry approval action');

    approvalRegistry.resolve('approval-2', false);
    await expect(registryApprovalPromise).resolves.toBe(false);
  });
});
