import type { Notification } from '@stallion-ai/contracts/notification';

export function formatNotificationTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function sortNotifications(
  notifications: Notification[],
): Notification[] {
  return [...notifications].sort(
    (left, right) =>
      Date.parse(right.updatedAt || right.createdAt) -
      Date.parse(left.updatedAt || left.createdAt),
  );
}

export function isApprovalNotification(notification: Notification): boolean {
  return notification.category === 'approval-request';
}

export function notificationDetail(
  notification: Notification,
): string | undefined {
  const detail = notification.metadata?.detail;
  return typeof detail === 'string' ? detail : undefined;
}
