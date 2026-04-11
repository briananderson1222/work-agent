import { execFile as execFileCb, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolveGitInfo } from '@stallion-ai/shared/git';
import { Hono } from 'hono';
import { systemOps } from '../telemetry/metrics.js';
import { errorMessage } from './schemas.js';
import type { SystemStatusDeps } from './system-route-types.js';

const execFileAsync = promisify(execFileCb);

export function createSystemUpdateRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();

  app.post('/verify-bedrock', async (c) => {
    try {
      systemOps.add(1, { op: 'verify_bedrock' });
      const { BedrockClient, ListFoundationModelsCommand } = await import(
        '@aws-sdk/client-bedrock'
      );
      const body = (await c.req.json().catch(() => ({}))) as {
        region?: string;
      };
      const region = body.region || deps.getAppConfig().region || 'us-east-1';
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

  app.get('/core-update', async (c) => {
    try {
      const {
        gitRoot,
        branch,
        hash: currentHash,
      } = resolveGitInfo(dirname(fileURLToPath(import.meta.url)));

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
        } catch (autoConfigureError) {
          console.debug(
            'Failed to auto-configure upstream:',
            autoConfigureError,
          );
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

      const port = process.env.PORT || '3141';
      const pidFile = join(gitRoot, '.stallion.pids');

      setTimeout(() => {
        const serverEnv: Record<string, string> = {
          ...(process.env as Record<string, string>),
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

  return app;
}
