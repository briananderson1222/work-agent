import type { Notification } from '@stallion-ai/contracts/notification';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { INotificationProvider } from '../providers/provider-interfaces.js';
import { approvalInboxOps } from '../telemetry/metrics.js';
import type { EventBus } from './event-bus.js';
import type { NotificationService } from './notification-service.js';
import type { OrchestrationService } from './orchestration-service.js';

type InboxTarget =
  | {
      approvalId: string;
      kind: 'registry';
      requestKey: string;
    }
  | {
      kind: 'orchestration';
      requestId: string;
      requestKey: string;
      threadId: string;
    };

interface ApprovalInboxLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

interface ApprovalInboxDependencies {
  approvalRegistry: { resolve(approvalId: string, approved: boolean): boolean };
  orchestrationService: Pick<OrchestrationService, 'dispatch'>;
}

const APPROVAL_INBOX_SOURCE = 'approval-inbox';
const APPROVAL_NOTIFICATION_CATEGORY = 'approval-request';

export class ApprovalInboxNotificationProvider
  implements INotificationProvider
{
  readonly id = APPROVAL_INBOX_SOURCE;
  readonly displayName = 'Approval Inbox';
  readonly categories = [APPROVAL_NOTIFICATION_CATEGORY];

  private readonly targetsByNotificationId = new Map<string, InboxTarget>();
  private readonly notificationIdByRequestKey = new Map<string, string>();

  constructor(private readonly deps: ApprovalInboxDependencies) {}

  hydrate(notifications: Notification[]): void {
    for (const notification of notifications) {
      const target = parseInboxTarget(notification);
      if (!target) {
        continue;
      }
      this.targetsByNotificationId.set(notification.id, target);
      this.notificationIdByRequestKey.set(target.requestKey, notification.id);
    }
  }

  remember(notification: Notification): void {
    const target = parseInboxTarget(notification);
    if (!target) {
      return;
    }
    this.targetsByNotificationId.set(notification.id, target);
    this.notificationIdByRequestKey.set(target.requestKey, notification.id);
  }

  completeRequest(requestKey: string): string | null {
    const notificationId = this.notificationIdByRequestKey.get(requestKey);
    if (!notificationId) {
      return null;
    }
    this.forget(notificationId);
    return notificationId;
  }

  async handleAction(notificationId: string, actionId: string): Promise<void> {
    const target = this.targetsByNotificationId.get(notificationId);
    if (!target) {
      return;
    }

    approvalInboxOps.add(1, {
      action: actionId,
      target: target.kind,
    });

    if (target.kind === 'orchestration') {
      await this.deps.orchestrationService.dispatch({
        type: 'respondToRequest',
        threadId: target.threadId,
        requestId: target.requestId,
        decision: mapOrchestrationDecision(actionId),
      });
    } else {
      this.deps.approvalRegistry.resolve(
        target.approvalId,
        actionId !== 'decline',
      );
    }

    this.forget(notificationId);
  }

  async handleDismiss(notificationId: string): Promise<void> {
    const target = this.targetsByNotificationId.get(notificationId);
    if (!target) {
      return;
    }

    approvalInboxOps.add(1, {
      action: 'dismiss',
      target: target.kind,
    });

    if (target.kind === 'orchestration') {
      await this.deps.orchestrationService.dispatch({
        type: 'respondToRequest',
        threadId: target.threadId,
        requestId: target.requestId,
        decision: 'decline',
      });
    } else {
      this.deps.approvalRegistry.resolve(target.approvalId, false);
    }

    this.forget(notificationId);
  }

  private forget(notificationId: string): void {
    const target = this.targetsByNotificationId.get(notificationId);
    if (!target) {
      return;
    }
    this.targetsByNotificationId.delete(notificationId);
    this.notificationIdByRequestKey.delete(target.requestKey);
  }
}

export function wireApprovalInboxNotifications(
  eventBus: EventBus,
  provider: ApprovalInboxNotificationProvider,
  notificationService: NotificationService,
  logger: ApprovalInboxLogger,
): () => void {
  provider.hydrate(
    notificationService.list({
      category: [APPROVAL_NOTIFICATION_CATEGORY],
      status: ['delivered', 'pending'],
    }),
  );

  return eventBus.subscribe((message) => {
    if (message.event === 'approval:opened') {
      const notification = notificationService.schedule(APPROVAL_INBOX_SOURCE, {
        category: APPROVAL_NOTIFICATION_CATEGORY,
        title: 'Approval needed',
        body: formatRegistryApprovalBody(message.data),
        priority: 'high',
        actions: [
          { id: 'accept', label: 'Allow Once', variant: 'primary' },
          { id: 'decline', label: 'Deny', variant: 'danger' },
        ],
        dedupeTag: `approval:${message.data?.approvalId ?? 'unknown'}`,
        metadata: {
          agentName: message.data?.agentName,
          agentSlug: message.data?.agentSlug,
          approvalId: message.data?.approvalId,
          conversationId: message.data?.conversationId,
          conversationTitle: message.data?.conversationTitle,
          detail: message.data?.description,
          requestKind: 'registry',
          requestKey: `approval:${message.data?.approvalId ?? 'unknown'}`,
          source: message.data?.source,
          toolName: message.data?.toolName,
        },
      });
      provider.remember(notification);
      approvalInboxOps.add(1, { action: 'opened', target: 'registry' });
      return;
    }

    if (message.event === 'approval:resolved') {
      const requestKey = `approval:${message.data?.approvalId ?? 'unknown'}`;
      const notificationId = provider.completeRequest(requestKey);
      if (!notificationId) {
        return;
      }
      if (message.data?.status === 'expired') {
        notificationService.markStatus(notificationId, 'expired');
      } else {
        notificationService.markStatus(notificationId, 'actioned');
      }
      approvalInboxOps.add(1, { action: 'resolved', target: 'registry' });
      return;
    }

    if (message.event !== 'orchestration:event' || !message.data?.event) {
      return;
    }

    const event = message.data.event as CanonicalRuntimeEvent;
    if (event.method === 'request.opened') {
      const notification = notificationService.schedule(APPROVAL_INBOX_SOURCE, {
        category: APPROVAL_NOTIFICATION_CATEGORY,
        title: event.title || 'Provider approval needed',
        body: event.description || formatOrchestrationBody(event),
        priority: 'high',
        actions: [
          { id: 'accept', label: 'Allow Once', variant: 'primary' },
          {
            id: 'acceptForSession',
            label: 'Allow for Session',
            variant: 'secondary',
          },
          { id: 'decline', label: 'Deny', variant: 'danger' },
        ],
        dedupeTag: buildOrchestrationRequestKey(event),
        metadata: {
          detail: event.description,
          provider: event.provider,
          requestId: event.requestId,
          requestKey: buildOrchestrationRequestKey(event),
          requestKind: 'orchestration',
          requestType: event.requestType,
          threadId: event.threadId,
          toolName:
            typeof event.payload?.toolName === 'string'
              ? event.payload.toolName
              : undefined,
        },
      });
      provider.remember(notification);
      approvalInboxOps.add(1, { action: 'opened', target: 'orchestration' });
      return;
    }

    if (event.method === 'request.resolved') {
      const notificationId = provider.completeRequest(
        buildOrchestrationRequestKey(event),
      );
      if (!notificationId) {
        return;
      }
      if (event.status === 'expired') {
        notificationService.markStatus(notificationId, 'expired');
      } else {
        notificationService.markStatus(notificationId, 'actioned');
      }
      approvalInboxOps.add(1, { action: 'resolved', target: 'orchestration' });
      return;
    }

    logger.debug('Ignoring non-approval orchestration event for inbox', {
      method: event.method,
    });
  });
}

function parseInboxTarget(notification: Notification): InboxTarget | null {
  const requestKind = notification.metadata?.requestKind;
  const requestKey = notification.metadata?.requestKey;
  if (typeof requestKind !== 'string' || typeof requestKey !== 'string') {
    return null;
  }

  if (requestKind === 'orchestration') {
    const threadId = notification.metadata?.threadId;
    const requestId = notification.metadata?.requestId;
    if (typeof threadId !== 'string' || typeof requestId !== 'string') {
      return null;
    }
    return {
      kind: 'orchestration',
      requestId,
      requestKey,
      threadId,
    };
  }

  if (requestKind === 'registry') {
    const approvalId = notification.metadata?.approvalId;
    if (typeof approvalId !== 'string') {
      return null;
    }
    return {
      approvalId,
      kind: 'registry',
      requestKey,
    };
  }

  return null;
}

function mapOrchestrationDecision(
  actionId: string,
): 'accept' | 'acceptForSession' | 'decline' {
  if (actionId === 'acceptForSession') {
    return 'acceptForSession';
  }
  if (actionId === 'decline') {
    return 'decline';
  }
  return 'accept';
}

function buildOrchestrationRequestKey(
  event: Pick<CanonicalRuntimeEvent, 'method' | 'threadId' | 'requestId'>,
): string {
  return `orchestration:${event.threadId}:${event.requestId}`;
}

function formatOrchestrationBody(
  event: Extract<CanonicalRuntimeEvent, { method: 'request.opened' }>,
): string {
  const toolName =
    typeof event.payload?.toolName === 'string' ? event.payload.toolName : null;
  if (toolName) {
    return `${event.provider} wants approval to use ${toolName}.`;
  }
  return `${event.provider} requested ${event.requestType}.`;
}

function formatRegistryApprovalBody(payload?: Record<string, unknown>): string {
  const agentName =
    typeof payload?.agentName === 'string' ? payload.agentName : 'An agent';
  const toolName =
    typeof payload?.toolName === 'string'
      ? payload.toolName
      : typeof payload?.title === 'string'
        ? payload.title
        : 'a tool';
  return `${agentName} wants to use ${toolName}.`;
}
