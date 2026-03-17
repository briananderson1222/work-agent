/**
 * System status routes — unified readiness check for onboarding
 */

import { execFile, execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGitInfo } from '@stallion-ai/shared';
import { Hono } from 'hono';
import { checkBedrockCredentials } from '../providers/bedrock.js';
import { getOnboardingProviders } from '../providers/registry.js';

interface SystemStatusDeps {
  getACPStatus: () => {
    connected: boolean;
    connections: Array<{ id: string; status: string }>;
  };
  getAppConfig: () => {
    region: string;
    defaultModel: string;
    runtime?: string;
  };
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
}

export function createSystemRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();

  // Fast readiness check — credential resolution + ACP + CLIs
  const whichCmd = (cmd: string) =>
    new Promise<boolean>((resolve) => {
      execFile('which', [cmd], (err, stdout) =>
        resolve(!err && stdout.trim().length > 0),
      );
    });

  app.get('/status', async (c) => {
    const [credentialsFound, kiroCliInstalled, claudeInstalled] =
      await Promise.all([
        checkBedrockCredentials(),
        whichCmd('kiro-cli'),
        whichCmd('claude'),
      ]);

    const acpStatus = deps.getACPStatus();
    const config = deps.getAppConfig();

    // Aggregate onboarding prerequisites from all providers
    const providers = getOnboardingProviders();
    const prerequisiteArrays = await Promise.all(
      providers.map(({ provider, source }) =>
        provider
          .getPrerequisites()
          .then((items) => items.map((p) => ({ ...p, source })))
          .catch(() => []),
      ),
    );
    const prerequisites = prerequisiteArrays.flat();

    return c.json({
      prerequisites,
      bedrock: { credentialsFound, verified: null, region: config.region },
      acp: {
        connected: acpStatus.connected,
        connections: acpStatus.connections,
      },
      clis: { 'kiro-cli': kiroCliInstalled, claude: claudeInstalled },
      ready: credentialsFound || acpStatus.connected,
    });
  });

  // Heavier verification — actually calls ListFoundationModels
  app.post('/verify-bedrock', async (c) => {
    try {
      const { BedrockClient, ListFoundationModelsCommand } = await import(
        '@aws-sdk/client-bedrock'
      );
      const body = await c.req.json().catch(() => ({}));
      const region = body.region || deps.getAppConfig().region;
      const client = new BedrockClient({ region });
      await client.send(new ListFoundationModelsCommand({}));
      return c.json({ verified: true, region });
    } catch (error: any) {
      logger.warn('Bedrock verification failed', { error: error.message });
      return c.json({ verified: false, error: error.message });
    }
  });

  // Check for core app updates
  app.get('/core-update', async (c) => {
    try {
      const {
        gitRoot,
        branch,
        hash: currentHash,
      } = resolveGitInfo(dirname(fileURLToPath(import.meta.url)));

      // Check if upstream is configured; auto-configure if origin exists
      let hasUpstream = false;
      try {
        execSync(`git rev-parse --abbrev-ref ${branch}@{u}`, {
          cwd: gitRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        hasUpstream = true;
      } catch {
        // Try to auto-configure tracking from origin
        try {
          execSync('git remote get-url origin', {
            cwd: gitRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          execSync(`git fetch origin ${branch} --quiet`, {
            cwd: gitRoot,
            timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          execSync(`git branch --set-upstream-to=origin/${branch} ${branch}`, {
            cwd: gitRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          hasUpstream = true;
        } catch {}
      }

      if (!hasUpstream) {
        return c.json({
          currentHash,
          branch,
          behind: 0,
          ahead: 0,
          updateAvailable: false,
          noUpstream: true,
        });
      }

      execSync('git fetch --quiet', { cwd: gitRoot, timeout: 15000 });

      const remoteHash = execSync('git rev-parse @{u}', {
        cwd: gitRoot,
        encoding: 'utf-8',
      })
        .trim()
        .substring(0, 7);

      const behind = parseInt(
        execSync('git rev-list HEAD..@{u} --count', {
          cwd: gitRoot,
          encoding: 'utf-8',
        }).trim(),
        10,
      );
      const ahead = parseInt(
        execSync('git rev-list @{u}..HEAD --count', {
          cwd: gitRoot,
          encoding: 'utf-8',
        }).trim(),
        10,
      );

      return c.json({
        currentHash,
        remoteHash,
        branch,
        behind,
        ahead,
        updateAvailable: behind > 0,
      });
    } catch (error: any) {
      return c.json({ updateAvailable: false, error: error.message });
    }
  });

  // Apply core app update
  app.post('/core-update', async (c) => {
    try {
      const { gitRoot } = resolveGitInfo(
        dirname(fileURLToPath(import.meta.url)),
      );

      execSync('git pull --ff-only', { cwd: gitRoot, timeout: 30000 });

      // Rebuild server and UI
      execSync('npm run build:server', {
        cwd: gitRoot,
        timeout: 120000,
        stdio: 'pipe',
      });
      execSync('npm run build:ui', {
        cwd: gitRoot,
        timeout: 120000,
        stdio: 'pipe',
      });

      const newHash = execSync('git rev-parse HEAD', {
        cwd: gitRoot,
        encoding: 'utf-8',
      })
        .trim()
        .substring(0, 7);

      deps.eventBus?.emit('core:updated', { hash: newHash });

      // Schedule graceful self-restart after response is sent
      const port = process.env.PORT || '3141';
      const pidFile = join(gitRoot, '.stallion.pids');

      setTimeout(() => {
        const serverEnv: Record<string, string> = {
          ...(process.env as any),
          PORT: port,
        };
        const child = spawn('node', ['dist-server/index.js'], {
          cwd: gitRoot,
          stdio: 'ignore',
          detached: true,
          env: serverEnv,
        });
        child.unref();

        // Update PIDFILE — preserve UI PID, replace server PID
        if (existsSync(pidFile)) {
          const pids = readFileSync(pidFile, 'utf-8').trim().split(' ');
          const uiPid = pids[1] || '';
          writeFileSync(pidFile, `${child.pid} ${uiPid}`);
        }

        logger.info('Core restart: new server spawned', {
          pid: child.pid,
          hash: newHash,
        });
        process.exit(0);
      }, 500);

      return c.json({
        success: true,
        hash: newHash,
        message: `Updated to ${newHash}. Server restarting…`,
        restarting: true,
      });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Capabilities manifest — tells the client which voice/context providers are
  // available and configured on this server.  clientOnly providers are always
  // advertised; server-backed providers require credentials or API keys.
  app.get('/capabilities', (c) => {
    const appConfig = deps.getAppConfig();
    return c.json({
      runtime: appConfig.runtime || 'voltagent',
      voice: {
        stt: [
          {
            id: 'webspeech',
            name: 'WebSpeech (Browser)',
            clientOnly: true,
            visibleOn: ['all'],
            configured: true,
          },
          // Server-backed providers would be inserted here by plugin registrations
          // (e.g. ElevenLabs, Nova Sonic) with configured: true when credentials exist.
        ],
        tts: [
          {
            id: 'webspeech',
            name: 'WebSpeech (Browser)',
            clientOnly: true,
            visibleOn: ['all'],
            configured: true,
          },
        ],
      },
      context: {
        providers: [
          {
            id: 'geolocation',
            name: 'Geolocation',
            visibleOn: ['mobile'],
          },
          {
            id: 'timezone',
            name: 'Timezone',
            visibleOn: ['all'],
          },
        ],
      },
      scheduler: true,
    });
  });

  // Discovery beacon — open CORS so LAN clients can probe without credentials.
  // Reveals nothing sensitive: just confirms this is a Stallion server.
  app.use('/discover', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    return next();
  });

  app.get('/discover', (c) => {
    const reqUrl = new URL(c.req.url);
    return c.json({
      stallion: true,
      name: 'Project Stallion',
      port: Number(reqUrl.port) || 3141,
    });
  });

  return app;
}
