import { type HonoServerConfig } from '@voltagent/server-hono';
import { cors } from 'hono/cors';
import type { EventBus } from '../services/event-bus.js';
import { isAuthError } from '../utils/auth-errors.js';
import type { Logger } from '../utils/logger.js';

type RuntimeApp = Parameters<NonNullable<HonoServerConfig['configureApp']>>[0];

interface RuntimeHttpContext {
  app: RuntimeApp;
  logger: Logger;
  eventBus: EventBus;
}

export function configureRuntimeHttp({
  app,
  logger,
  eventBus,
}: RuntimeHttpContext): void {
  app.onError((err, c) => {
    if (isAuthError(err)) {
      return c.json({ success: false, error: err.message }, 401);
    }
    return c.json({ success: false, error: err.message }, 500);
  });

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const origin = c.req.header('origin') || '-';
    logger.info(
      `${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms origin=${origin}`,
    );
  });

  app.use(
    '*',
    cors({
      origin: resolveRuntimeCorsOrigin,
      credentials: true,
    }),
  );

  app.use('*', async (c, next) => {
    await next();

    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method)) {
      return;
    }

    const keys = getInvalidationKeysForPath(c.req.path);
    if (keys.length > 0) {
      eventBus.emit('data:changed', { keys });
    }
  });
}

export function resolveRuntimeCorsOrigin(
  origin?: string,
): string | null | undefined {
  if (!origin) {
    return origin;
  }

  if (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('https://localhost:') ||
    origin === 'tauri://localhost' ||
    origin === 'https://tauri.localhost'
  ) {
    return origin;
  }

  try {
    const host = new URL(origin).hostname;
    if (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return origin;
    }
  } catch {}

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  return allowedOrigins.includes(origin) ? origin : null;
}

function getInvalidationKeysForPath(path: string): string[] {
  const keys: string[] = [];

  if (path.startsWith('/agents')) keys.push('agents');
  if (path.startsWith('/integrations')) keys.push('integrations');
  if (path.includes('/prompts')) keys.push('prompts');
  if (path.includes('/playbooks')) keys.push('playbooks');
  if (path.includes('/skills')) keys.push('skills');
  if (path.includes('/providers')) keys.push('providers');
  if (path.includes('/scheduler') || path.includes('/jobs')) {
    keys.push('scheduler-jobs');
  }
  if (path.includes('/projects')) keys.push('projects');
  if (path.includes('/knowledge')) keys.push('knowledge');
  if (path.includes('/registry')) keys.push('skills', 'integrations', 'agents');

  return [...new Set(keys)];
}
