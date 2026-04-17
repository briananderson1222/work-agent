/**
 * System status routes — unified readiness check
 */

import { execFile, execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGitInfo } from '@stallion-ai/shared';
import { Hono } from 'hono';
import { checkBedrockCredentials } from '../providers/bedrock.js';
import { getAllPrerequisites } from '../providers/registry.js';
import type { SkillService } from '../services/skill-service.js';
import { systemOps } from '../telemetry/metrics.js';
import { errorMessage } from './schemas.js';

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
  appConfig?: { runtime?: string };
  port?: number;
  skillService?: SkillService;
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
    const [credentialsFound, kiroCliInstalled] = await Promise.all([
      checkBedrockCredentials(),
      whichCmd('kiro-cli'),
    ]);
    systemOps.add(1, { op: 'get_status' });

    const acpStatus = deps.getACPStatus();
    const config = deps.getAppConfig();

    // Aggregate prerequisites from all providers that implement getPrerequisites()
    const prerequisites = await getAllPrerequisites();

    return c.json({
      prerequisites,
      bedrock: { credentialsFound, verified: null, region: config.region },
      acp: {
        connected: acpStatus.connected,
        connections: acpStatus.connections,
      },
      clis: { 'kiro-cli': kiroCliInstalled },
      ready: credentialsFound || acpStatus.connected,
    });
  });

  // Heavier verification — actually calls ListFoundationModels
  app.post('/verify-bedrock', async (c) => {
    try {
      systemOps.add(1, { op: 'verify_bedrock' });
      const { BedrockClient, ListFoundationModelsCommand } = await import(
        '@aws-sdk/client-bedrock'
      );
      const body = (await c.req.json().catch(() => ({}))) as {
        region?: string;
      };
      const region = body.region || deps.getAppConfig().region;
      const client = new BedrockClient({ region });
      await client.send(new ListFoundationModelsCommand({}));
      return c.json({ verified: true, region });
    } catch (error: unknown) {
      logger.warn('Bedrock verification failed', {
        error: errorMessage(error),
      });
      return c.json({ verified: false, error: errorMessage(error) });
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
        await execFileAsync(
          'git',
          ['rev-parse', '--abbrev-ref', `${branch}@{u}`],
          {
            cwd: gitRoot,
            encoding: 'utf-8',
          },
        );
        hasUpstream = true;
      } catch (e) {
        console.debug('Failed to check upstream branch:', e);
        // Try to auto-configure tracking from origin
        try {
          await execFileAsync('git', ['remote', 'get-url', 'origin'], {
            cwd: gitRoot,
            encoding: 'utf-8',
          });
          await execFileAsync('git', ['fetch', 'origin', branch, '--quiet'], {
            cwd: gitRoot,
            timeout: 15000,
          });
          await execFileAsync(
            'git',
            ['branch', `--set-upstream-to=origin/${branch}`, branch],
            {
              cwd: gitRoot,
              encoding: 'utf-8',
            },
          );
          hasUpstream = true;
        } catch (e) {
          console.debug('Failed to auto-configure upstream:', e);
        }
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

      await execFileAsync('git', ['fetch', '--quiet'], {
        cwd: gitRoot,
        timeout: 15000,
      });

      const remoteHash = (
        await execFileAsync('git', ['rev-parse', '@{u}'], {
          cwd: gitRoot,
          encoding: 'utf-8',
        })
      ).stdout
        .trim()
        .substring(0, 7);

      const behind = parseInt(
        (
          await execFileAsync('git', ['rev-list', 'HEAD..@{u}', '--count'], {
            cwd: gitRoot,
            encoding: 'utf-8',
          })
        ).stdout.trim(),
        10,
      );
      const ahead = parseInt(
        (
          await execFileAsync('git', ['rev-list', '@{u}..HEAD', '--count'], {
            cwd: gitRoot,
            encoding: 'utf-8',
          })
        ).stdout.trim(),
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
    } catch (error: unknown) {
      return c.json({ updateAvailable: false, error: errorMessage(error) });
    }
  });

  // Apply core app update
  app.post('/core-update', async (c) => {
    try {
      systemOps.add(1, { op: 'apply_update' });
      const { gitRoot } = resolveGitInfo(
        dirname(fileURLToPath(import.meta.url)),
      );

      await execFileAsync('git', ['pull', '--ff-only'], {
        cwd: gitRoot,
        timeout: 30000,
      });

      // Rebuild server and UI
      await execFileAsync('npm', ['run', 'build:server'], {
        cwd: gitRoot,
        timeout: 120000,
      });
      await execFileAsync('npm', ['run', 'build:ui'], {
        cwd: gitRoot,
        timeout: 120000,
      });

      const newHash = (
        await execFileAsync('git', ['rev-parse', 'HEAD'], {
          cwd: gitRoot,
          encoding: 'utf-8',
        })
      ).stdout
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
          windowsHide: true,
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
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Capabilities manifest — tells the client which voice/context providers are
  // available and configured on this server.  clientOnly providers are always
  // advertised; server-backed providers require credentials or API keys.
  app.get('/capabilities', (c) => {
    systemOps.add(1, { op: 'get_capabilities' });
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

  app.get('/runtime', (c) => {
    const cfg = deps.appConfig ?? deps.getAppConfig();
    return c.json({ runtime: cfg.runtime || 'voltagent' });
  });

  app.get('/skills', (c) => {
    return c.json({
      success: true,
      data: deps.skillService?.listSkills() ?? [],
    });
  });

  app.get('/terminal-port', (c) => {
    const port = deps.port ?? 0;
    return c.json({ success: true, port: port + 1 });
  });

  return app;
}
