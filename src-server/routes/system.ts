import { Hono } from 'hono';
import type { SystemStatusDeps } from './system-route-types.js';
import { createSystemStatusRoutes } from './system-status-routes.js';
import { createSystemUpdateRoutes } from './system-update-routes.js';

export function createSystemRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();
  app.route('/', createSystemStatusRoutes(deps));
  app.route('/', createSystemUpdateRoutes(deps, logger));

  return app;
}
