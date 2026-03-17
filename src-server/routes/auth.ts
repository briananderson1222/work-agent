import { Hono } from 'hono';
import { userInfo } from 'node:os';
import {
  getAuthProvider,
  getUserDirectoryProvider,
  getUserIdentityProvider,
} from '../providers/registry.js';
import type { UserIdentity } from '../providers/types.js';
import { authOps } from '../telemetry/metrics.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ name: 'auth' });

// ── Cached User Identity ───────────────────────────────

let cachedUser: UserIdentity | null = null;

/** Get cached user identity (available to other modules) */
export function getCachedUser(): UserIdentity {
  if (!cachedUser) {
    // Synchronous fallback — kick off async resolution
    cachedUser = { alias: userInfo().username };
    resolveUser().catch((e) =>
      logger.error('resolveUser failed', { error: e }),
    );
  }
  return cachedUser;
}

async function resolveUser(): Promise<UserIdentity> {
  if (cachedUser?.name) return cachedUser; // already enriched
  const provider = getUserIdentityProvider();
  cachedUser = await provider.getIdentity();
  if (provider.enrichIdentity) {
    provider
      .enrichIdentity(cachedUser)
      .then((enriched) => {
        cachedUser = enriched;
      })
      .catch(() => {});
  }
  return cachedUser;
}

// ── Routes ─────────────────────────────────────────────

export function createAuthRoutes() {
  const app = new Hono();

  app.get('/status', async (c) => {
    authOps.add(1, { operation: 'status' });
    const [authStatus, user] = await Promise.all([
      getAuthProvider().getStatus(),
      resolveUser(),
    ]);
    return c.json({ ...authStatus, user });
  });

  app.post('/renew', async (c) => {
    authOps.add(1, { operation: 'renew' });
    try {
      const result = await getAuthProvider().renew();
      return c.json(result);
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  });

  app.post('/terminal', async (c) => {
    try {
      const result = await getAuthProvider().renew();
      return c.json(result);
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  });

  app.get('/badge-photo/:id', async (c) => {
    const id = c.req.param('id');
    const provider = getAuthProvider();
    if (!provider.getBadgePhoto) {
      return c.body(null, 404);
    }
    try {
      const data = await provider.getBadgePhoto(id);
      if (!data) return c.body(null, 404);
      c.header('Content-Type', 'image/jpeg');
      c.header('Cache-Control', 'public, max-age=86400');
      return c.body(data);
    } catch (e) {
      logger.debug('Failed to fetch badge photo', { id, error: e });
      return c.body(null, 502);
    }
  });

  return app;
}

export function createUserRoutes() {
  const app = new Hono();

  app.get('/search', async (c) => {
    authOps.add(1, { operation: 'search' });
    const q = c.req.query('q') || '';
    if (!q) return c.json([]);
    try {
      return c.json(await getUserDirectoryProvider().searchPeople(q));
    } catch (e) {
      logger.debug('Failed to search people directory', { q, error: e });
      return c.json([]);
    }
  });

  app.get('/:alias', async (c) => {
    const alias = c.req.param('alias');
    try {
      return c.json(await getUserDirectoryProvider().lookupPerson(alias));
    } catch (error: any) {
      return c.json({ alias, name: alias, error: error.message }, 404);
    }
  });

  return app;
}
