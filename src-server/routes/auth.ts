import { Hono } from 'hono';
import { stat, writeFile } from 'fs/promises';
import { homedir, tmpdir, userInfo as osUserInfo } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { createPinoLogger } from '@voltagent/logger';

const logger = createPinoLogger({ name: 'auth' });

// Type extensions for auth routes
interface AgentResponse {
  data?: Array<{
    slug: string;
    toolsConfig?: {
      mcpServers?: string[];
    };
  }>;
}

interface ToolCallResponse {
  success: boolean;
  response?: any;
}

const COOKIE_PATH = join(homedir(), '.midway', 'cookie');
const COOKIE_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EXPIRING_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ── User Identity ──────────────────────────────────────
// Starts with OS username, enriched by available tools on first request.

interface UserIdentity {
  alias: string;
  profileUrl: string;
  name?: string;
  title?: string;
  email?: string;
}

let cachedUser: UserIdentity | null = null;

function baseUser(): UserIdentity {
  const alias = osUserInfo().username;
  return {
    alias,
    profileUrl: `https://phonetool.amazon.com/users/${alias}`,
    email: `${alias}@amazon.com`,
  };
}

/** Get cached user identity (available to other modules) */
export function getCachedUser(): UserIdentity {
  if (!cachedUser) cachedUser = baseUser();
  return cachedUser;
}

async function getUser(): Promise<UserIdentity> {
  if (cachedUser) return cachedUser;
  cachedUser = baseUser();
  // Async enrichment — don't block the response
  enrichUser(cachedUser).catch((e) => logger.error('enrichUser failed', { error: e }));
  return cachedUser;
}

async function enrichUser(user: UserIdentity): Promise<void> {
  // Try to enrich from workspace agent tools (non-blocking, best-effort)
  const port = process.env.PORT || 3141;
  const base = `http://localhost:${port}`;
  
  try {
    // Find a workspace agent that has sat-sfdc tools
    const agentsRes = await fetch(`${base}/api/agents`);
    const { data: agents } = await agentsRes.json() as AgentResponse;
    const agent = agents?.find((a) => a.toolsConfig?.mcpServers?.includes('sat-sfdc'));
    if (!agent) return;

    const slug = encodeURIComponent(agent.slug);
    const call = async (tool: string, args: any, transform: string) => {
      const r = await fetch(`${base}/agents/${slug}/tool/${tool}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolArgs: args, transform }),
      });
      const d = await r.json() as ToolCallResponse;
      return d.success ? d.response : null;
    };

    // search_users returns full name, title, email
    const me = await call('sat-sfdc_search_users', { alias: user.alias }, 'data => (data.data?.users || data.users || [])[0]');
    if (me) {
      cachedUser = {
        ...user,
        name: me.name || user.alias,
        title: me.businessTitle,
        email: me.email || user.email,
      };
    }
  } catch {
    // Enrichment failed — keep base identity
  }
}

// ── Terminal Launch ────────────────────────────────────

async function openTerminal(command: string): Promise<void> {
  if (await appExists('iTerm')) {
    return osascript(`tell application "iTerm"
      activate
      create window with default profile command "${esc(command)}"
    end tell`);
  }
  if (await appExists('Ghostty')) {
    return osascript(`tell application "Ghostty"
      activate
      do script "${esc(command)}"
    end tell`);
  }
  const file = join(tmpdir(), `stallion-${Date.now()}.command`);
  await writeFile(file, `#!/bin/sh\n${command}\nrm -f "${file}"\n`, { mode: 0o755 });
  return new Promise((resolve, reject) => {
    execFile('open', [file], (err) => err ? reject(err) : resolve());
  });
}

function esc(s: string) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

function osascript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err) => err ? reject(err) : resolve());
  });
}

async function appExists(name: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('mdfind', [`kMDItemKind == "Application" && kMDItemDisplayName == "${name}"`], (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

// ── Routes ─────────────────────────────────────────────

export function createAuthRoutes() {
  const app = new Hono();

  app.get('/status', async (c) => {
    const user = await getUser();
    try {
      const stats = await stat(COOKIE_PATH);
      const age = Date.now() - stats.mtime.getTime();
      const expiresAt = new Date(stats.mtime.getTime() + COOKIE_LIFETIME_MS);

      let status: string;
      let message: string;

      if (age > COOKIE_LIFETIME_MS) {
        status = 'expired';
        message = 'Authentication expired';
      } else if (age > (COOKIE_LIFETIME_MS - EXPIRING_THRESHOLD_MS)) {
        status = 'expiring';
        message = `Expires in ${Math.round((COOKIE_LIFETIME_MS - age) / (60 * 1000))} minutes`;
      } else {
        status = 'valid';
        message = 'Authentication valid';
      }

      return c.json({ provider: 'mwinit', status, expiresAt: expiresAt.toISOString(), message, user });
    } catch {
      return c.json({ provider: 'mwinit', status: 'missing', expiresAt: null, message: 'No authentication found', user });
    }
  });

  app.post('/renew', async (c) => {
    try {
      await openTerminal('mwinit -o');
      return c.json({ success: true, message: 'Terminal opened with mwinit -o' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/terminal', async (c) => {
    try {
      await openTerminal('mwinit -o');
      return c.json({ success: true, message: 'Terminal opened with mwinit -o' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
