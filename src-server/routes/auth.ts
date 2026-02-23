import { Hono } from 'hono';
import { stat, writeFile, unlink } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { userInfo as osUserInfo } from 'os';

const COOKIE_PATH = join(homedir(), '.midway', 'cookie');
const COOKIE_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EXPIRING_THRESHOLD_MS = 2 * 60 * 60 * 1000;

function userInfo() { return osUserInfo().username; }

/** Detect user's terminal and open command in it (like boo) */
async function openTerminal(command: string): Promise<void> {
  // Check installed apps (server process won't have TERM_PROGRAM)
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
  
  // Fallback: .command file opens in system default terminal
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

export function createAuthRoutes() {
  const app = new Hono();

  app.get('/status', async (c) => {
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

      return c.json({ provider: 'mwinit', status, expiresAt: expiresAt.toISOString(), message, user: { alias: userInfo(), profileUrl: `https://phonetool.amazon.com/users/${userInfo()}` } });
    } catch {
      return c.json({ provider: 'mwinit', status: 'missing', expiresAt: null, message: 'No authentication found', user: { alias: userInfo(), profileUrl: `https://phonetool.amazon.com/users/${userInfo()}` } });
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
    const { command } = await c.req.json();
    if (!command || typeof command !== 'string') {
      return c.json({ success: false, error: 'command required' }, 400);
    }
    try {
      await openTerminal(command);
      return c.json({ success: true, message: 'Terminal opened' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
