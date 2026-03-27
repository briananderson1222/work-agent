/**
 * Notification Routes — notification management REST API.
 */

import { Hono } from 'hono';
import type { NotificationService } from '../services/notification-service.js';
import { notificationOps } from '../telemetry/metrics.js';
import {
  getBody,
  notificationCreateSchema,
  notificationSnoozeSchema,
  param,
  validate,
} from './schemas.js';

export function createNotificationRoutes(
  notificationService: NotificationService,
) {
  const app = new Hono();

  // List notifications (with optional status/category filters)
  app.get('/', (c) => {
    const status = c.req.queries('status');
    const category = c.req.queries('category');
    const data = notificationService.list({
      status: status?.length ? status : undefined,
      category: category?.length ? category : undefined,
    });
    return c.json({ success: true, data });
  });

  // Schedule a new notification
  app.post('/', validate(notificationCreateSchema), async (c) => {
    const body = getBody(c);
    const notification = notificationService.schedule(
      body.source ?? 'api',
      body,
    );
    notificationOps.add(1, { op: 'schedule' });
    return c.json({ success: true, data: notification }, 201);
  });

  // Dismiss a notification
  app.delete('/:id', (c) => {
    notificationService.dismiss(param(c, 'id'));
    return c.json({ success: true });
  });

  // Execute a notification action
  app.post('/:id/action/:actionId', async (c) => {
    await notificationService.action(param(c, 'id'), param(c, 'actionId'));
    notificationOps.add(1, { op: 'action' });
    return c.json({ success: true });
  });

  // Snooze a notification
  app.post('/:id/snooze', validate(notificationSnoozeSchema), async (c) => {
    const { until } = getBody(c);
    notificationService.snooze(param(c, 'id'), until);
    return c.json({ success: true });
  });

  // Clear all notifications
  app.delete('/', (c) => {
    notificationService.clearAll();
    return c.json({ success: true });
  });

  // List registered notification providers
  app.get('/providers', (c) => {
    return c.json({ success: true, data: notificationService.listProviders() });
  });

  return app;
}
