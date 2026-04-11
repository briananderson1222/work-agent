/**
 * Plugin Routes — top-level composer for plugin discovery, install, and public bridge routes.
 */

import { join } from 'node:path';
import { Hono } from 'hono';
import type { EventBus } from '../services/event-bus.js';
import type { Logger } from '../utils/logger.js';
import { buildPlugin } from './plugin-bundles.js';
import { registerPluginConfigRoutes } from './plugin-config-routes.js';
import { registerPluginInstallRoutes } from './plugin-install-routes.js';
import { registerPluginLifecycleRoutes } from './plugin-lifecycle-routes.js';
import { registerPluginPublicRoutes } from './plugin-public-routes.js';

export function createPluginRoutes(
  projectHomeDir: string,
  logger: Logger,
  eventBus?: EventBus,
) {
  const app = new Hono();
  const pluginsDir = join(projectHomeDir, 'plugins');
  const agentsDir = join(projectHomeDir, 'agents');

  registerPluginLifecycleRoutes(app, {
    agentsDir,
    buildPlugin: (pluginDir, name) => buildPlugin(pluginDir, name, logger),
    eventBus,
    logger,
    pluginsDir,
    projectHomeDir,
  });
  registerPluginConfigRoutes(app, {
    eventBus,
    pluginsDir,
    projectHomeDir,
  });
  registerPluginInstallRoutes(app, {
    agentsDir,
    eventBus,
    logger,
    pluginsDir,
    projectHomeDir,
  });
  registerPluginPublicRoutes(app, {
    logger,
    pluginsDir,
    projectHomeDir,
  });

  return app;
}
