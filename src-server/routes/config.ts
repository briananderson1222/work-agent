/**
 * Config Routes - app configuration management
 */

import { Hono } from 'hono';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { EventBus } from '../services/event-bus.js';
import { configOps } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import {
  appConfigUpdateSchema,
  errorMessage,
  getBody,
  validate,
} from './schemas.js';

export function createConfigRoutes(
  configLoader: ConfigLoader,
  logger: Logger,
  eventBus?: EventBus,
  onConfigChanged?: () => void,
) {
  const app = new Hono();

  // Get app config
  app.get('/app', async (c) => {
    try {
      configOps.add(1, { op: 'get_app' });
      const config = await configLoader.loadAppConfig();
      return c.json({ success: true, data: config });
    } catch (error: unknown) {
      logger.error('Failed to load app config', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Update app config
  app.put('/app', validate(appConfigUpdateSchema), async (c) => {
    try {
      configOps.add(1, { op: 'update_app' });
      const updates = getBody(c);
      const updated = await configLoader.updateAppConfig(updates);
      logger.info('App config updated', { config: updated });
      eventBus?.emit('system:status-changed', { source: 'config' });
      onConfigChanged?.();
      return c.json({ success: true, data: updated });
    } catch (error: unknown) {
      logger.error('Failed to update app config', { error });
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  return app;
}
