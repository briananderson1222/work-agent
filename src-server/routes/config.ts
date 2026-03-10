/**
 * Config Routes - app configuration management
 */

import { Hono } from 'hono';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { EventBus } from '../services/event-bus.js';

export function createConfigRoutes(
  configLoader: ConfigLoader,
  logger: any,
  eventBus?: EventBus,
  onConfigChanged?: () => void,
) {
  const app = new Hono();

  // Get app config
  app.get('/app', async (c) => {
    try {
      const config = await configLoader.loadAppConfig();
      return c.json({ success: true, data: config });
    } catch (error: any) {
      logger.error('Failed to load app config', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Update app config
  app.put('/app', async (c) => {
    try {
      const updates = await c.req.json();
      const updated = await configLoader.updateAppConfig(updates);
      logger.info('App config updated', { config: updated });
      eventBus?.emit('system:status-changed', { source: 'config' });
      onConfigChanged?.();
      return c.json({ success: true, data: updated });
    } catch (error: any) {
      logger.error('Failed to update app config', { error });
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
