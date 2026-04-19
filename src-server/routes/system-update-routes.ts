import { execFile as execFileCb, spawn } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolveGitInfo } from '@stallion-ai/shared/git';
import { Hono } from 'hono';
import { systemOps } from '../telemetry/metrics.js';
import { errorMessage } from './schemas.js';
import type { SystemStatusDeps } from './system-route-types.js';

const execFileAsync = promisify(execFileCb);
const DEFAULT_INSTANCE_ID = 'default';

interface InstanceStateRecord {
  baseDir: string;
  instanceId: string;
  serverPid: number | null;
  serverPort: number;
  startedAt: string;
  statePath: string;
  uiPid: number | null;
  uiPort: number;
}

function isRecord(
  value: unknown,
): value is Record<string, string | number | boolean | null | unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePidList(raw: string): Array<number | null> {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    });
}

function isProcessAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isInstanceRunning(record: InstanceStateRecord): boolean {
  return isProcessAlive(record.serverPid) || isProcessAlive(record.uiPid);
}

function readInstanceStateFile(path: string): InstanceStateRecord | null {
  try {
    const parsed = JSON.parse(
      readFileSync(path, 'utf-8'),
    ) as Partial<InstanceStateRecord>;
    if (typeof parsed.instanceId !== 'string' || !parsed.instanceId) {
      return null;
    }

    return {
      instanceId: parsed.instanceId,
      serverPid: parsed.serverPid ?? null,
      uiPid: parsed.uiPid ?? null,
      serverPort: parsed.serverPort ?? 3141,
      uiPort: parsed.uiPort ?? 3000,
      baseDir:
        typeof parsed.baseDir === 'string' && parsed.baseDir
          ? parsed.baseDir
          : '',
      startedAt:
        typeof parsed.startedAt === 'string' && parsed.startedAt
          ? parsed.startedAt
          : new Date(0).toISOString(),
      statePath: path,
    };
  } catch {
    return null;
  }
}

function readLegacyInstanceState(gitRoot: string): InstanceStateRecord | null {
  const pidFile = join(gitRoot, '.stallion.pids');
  if (!existsSync(pidFile)) return null;

  const [serverPid, uiPid] = parsePidList(readFileSync(pidFile, 'utf-8'));
  const record: InstanceStateRecord = {
    instanceId: DEFAULT_INSTANCE_ID,
    serverPid,
    uiPid,
    serverPort: 3141,
    uiPort: 3000,
    baseDir: '',
    startedAt: new Date(0).toISOString(),
    statePath: pidFile,
  };

  if (!isInstanceRunning(record)) {
    rmSync(pidFile, { force: true });
    return null;
  }

  return record;
}

function listRunningInstances(gitRoot: string): InstanceStateRecord[] {
  const records: InstanceStateRecord[] = [];
  const instanceStateDir = join(gitRoot, '.stallion', 'instances');

  if (existsSync(instanceStateDir)) {
    for (const entry of readdirSync(instanceStateDir)) {
      if (!entry.endsWith('.json')) continue;
      const statePath = join(instanceStateDir, entry);
      const record = readInstanceStateFile(statePath);
      if (!record || !isInstanceRunning(record)) {
        rmSync(statePath, { force: true });
        continue;
      }
      records.push(record);
    }
  }

  const hasDefaultRecord = records.some(
    (record) => record.instanceId === DEFAULT_INSTANCE_ID,
  );
  const legacyRecord = readLegacyInstanceState(gitRoot);
  if (legacyRecord && !hasDefaultRecord) {
    records.push(legacyRecord);
  } else if (legacyRecord && hasDefaultRecord) {
    rmSync(legacyRecord.statePath, { force: true });
  }

  return records.sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
}

function describeInstance(record: InstanceStateRecord): string {
  const home = record.baseDir || '(unknown home)';
  return `${record.instanceId} — server ${record.serverPort}, ui ${record.uiPort}, home ${home}`;
}

function getSelfUpdateConflictError(
  gitRoot: string,
  currentInstanceId: string,
): string | null {
  const siblings = listRunningInstances(gitRoot).filter(
    (record) => record.instanceId !== currentInstanceId,
  );
  if (siblings.length === 0) return null;

  return [
    'Core update is blocked because this checkout shares build artifacts with other live Stallion instances.',
    'Stop the sibling instance(s) first or rerun the update from a different checkout.',
    ...siblings.map((record) => `  - ${describeInstance(record)}`),
  ].join('\n');
}

function updateInstanceRecord(
  record: Record<string, string | number | boolean | null | unknown>,
  serverPid: number,
) {
  const nextRecord = { ...record };

  nextRecord.serverPid = serverPid;
  if ('pid' in nextRecord) {
    nextRecord.pid = serverPid;
  }
  if (Array.isArray(nextRecord.pids)) {
    const nextPids = [...nextRecord.pids];
    nextPids[0] = serverPid;
    nextRecord.pids = nextPids;
  }
  if (isRecord(nextRecord.server)) {
    nextRecord.server = {
      ...nextRecord.server,
      pid: serverPid,
    };
  }
  nextRecord.updatedAt = new Date().toISOString();

  return nextRecord;
}

function updateInstanceStatePayload(
  payload: unknown,
  instanceId: string | undefined,
  serverPid: number,
): unknown {
  if (Array.isArray(payload)) {
    if (!instanceId) return payload;
    return payload.map((entry) => {
      if (
        isRecord(entry) &&
        typeof entry.instanceId === 'string' &&
        entry.instanceId === instanceId
      ) {
        return updateInstanceRecord(entry, serverPid);
      }
      return entry;
    });
  }

  if (!isRecord(payload)) {
    return payload;
  }

  if (instanceId && Array.isArray(payload.instances)) {
    return {
      ...payload,
      instances: payload.instances.map((entry) => {
        if (
          isRecord(entry) &&
          typeof entry.instanceId === 'string' &&
          entry.instanceId === instanceId
        ) {
          return updateInstanceRecord(entry, serverPid);
        }
        return entry;
      }),
    };
  }

  if (
    instanceId &&
    isRecord(payload.instances) &&
    isRecord(payload.instances[instanceId])
  ) {
    return {
      ...payload,
      instances: {
        ...payload.instances,
        [instanceId]: updateInstanceRecord(
          payload.instances[instanceId] as Record<
            string,
            string | number | boolean | null | unknown
          >,
          serverPid,
        ),
      },
    };
  }

  if (
    instanceId &&
    typeof payload.instanceId === 'string' &&
    payload.instanceId !== instanceId
  ) {
    return payload;
  }

  return updateInstanceRecord(payload, serverPid);
}

function updateRestartState(logger: any, gitRoot: string, serverPid: number) {
  const instanceStatePath = process.env.STALLION_INSTANCE_STATE_PATH;
  const instanceId = process.env.STALLION_INSTANCE_ID;

  if (instanceStatePath && existsSync(instanceStatePath)) {
    try {
      const rawState = readFileSync(instanceStatePath, 'utf-8').trim();
      if (rawState) {
        const nextState = updateInstanceStatePayload(
          JSON.parse(rawState) as unknown,
          instanceId,
          serverPid,
        );
        writeFileSync(
          instanceStatePath,
          `${JSON.stringify(nextState, null, 2)}\n`,
        );
        return;
      }
    } catch (error) {
      logger.warn(
        'Core restart: failed to rewrite instance state, falling back to legacy pidfile',
        {
          error: errorMessage(error),
          instanceId,
          instanceStatePath,
        },
      );
    }
  }

  const pidFile = join(gitRoot, '.stallion.pids');
  if (existsSync(pidFile)) {
    const pids = readFileSync(pidFile, 'utf-8').trim().split(' ');
    const uiPid = pids[1] || '';
    writeFileSync(pidFile, `${serverPid} ${uiPid}`);
  }
}

export function createSystemUpdateRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();

  const verifyManagedRuntime = async (c: any) => {
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
  };

  app.post('/verify-managed-runtime', verifyManagedRuntime);
  app.post('/verify-bedrock', async (c) => {
    return verifyManagedRuntime(c);
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
      const currentInstanceId =
        process.env.STALLION_INSTANCE_ID || DEFAULT_INSTANCE_ID;
      const conflictError = getSelfUpdateConflictError(
        gitRoot,
        currentInstanceId,
      );

      if (conflictError) {
        return c.json({ success: false, error: conflictError }, 409);
      }

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

        if (child.pid) {
          updateRestartState(logger, gitRoot, child.pid);
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

  app.post('/build-updated', (c) => {
    deps.eventBus?.emit('build:updated', {
      timestamp: new Date().toISOString(),
    });
    return c.json({ notified: true });
  });

  return app;
}
