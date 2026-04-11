import { Hono } from 'hono';
import { createSystemStatusRoutes } from './system-status-routes.js';
import type { SystemStatusDeps } from './system-route-types.js';
import { createSystemUpdateRoutes } from './system-update-routes.js';

export function createSystemRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();
  app.route('/', createSystemStatusRoutes(deps));
  app.route('/', createSystemUpdateRoutes(deps, logger));

  return app;
}
