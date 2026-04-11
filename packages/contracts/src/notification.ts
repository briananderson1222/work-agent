export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationStatus =
  | 'pending'
  | 'delivered'
  | 'dismissed'
  | 'expired'
  | 'actioned';

export interface NotificationAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface Notification {
  id: string;
  source: string;
  category: string;
  title: string;
  body?: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  scheduledAt?: string | null;
  deliveredAt?: string | null;
  ttl?: number;
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleNotificationOpts {
  category: string;
  title: string;
  body?: string;
  priority?: NotificationPriority;
  scheduledAt?: string;
  ttl?: number;
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
  dedupeTag?: string;
}
