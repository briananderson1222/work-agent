import { spawn as spawnProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

type LifecycleModule = typeof import('../commands/lifecycle.js');
type PlatformModule = typeof import('../commands/platform.js');

const TEST_ROOT = join(
  tmpdir(),
  `stallion-lifecycle-${process.pid}-${Date.now()}`,
);
const TEST_CWD = join(TEST_ROOT, 'cwd');
const TEST_DEFAULT_HOME = join(TEST_ROOT, 'default-home');
const TEST_ALT_HOME = join(TEST_ROOT, 'alt-home');
const TEST_SECOND_HOME = join(TEST_ROOT, 'second-home');
const TEST_PIDFILE = join(TEST_CWD, '.stallion.pids');
const TEST_INSTANCE_STATE_DIR = join(TEST_CWD, '.stallion', 'instances');

function normalizeInstanceName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

function resolveInstanceId(
  options: {
    cwd?: string;
    instanceName?: string;
    projectHome?: string;
    serverPort?: number;
    uiPort?: number;
  } = {},
): string {
  if (options.instanceName?.trim()) {
    return normalizeInstanceName(options.instanceName);
  }

  const projectHome = resolve(options.projectHome || TEST_DEFAULT_HOME);
  const serverPort = options.serverPort ?? 3141;
  const uiPort = options.uiPort ?? 3000;

  if (
    projectHome === TEST_DEFAULT_HOME &&
    serverPort === 3141 &&
    uiPort === 3000
  ) {
    return 'default';
  }

  const hash = createHash('sha1')
    .update(
      JSON.stringify({
        cwd: options.cwd || TEST_CWD,
        projectHome,
        serverPort,
        uiPort,
      }),
    )
    .digest('hex')
    .slice(0, 12);

  return `instance-${hash}`;
}

function getInstanceStatePath(instanceId: string, cwd = TEST_CWD): string {
  return join(cwd, '.stallion', 'instances', `${instanceId}.json`);
}

async function loadLifecycleModule(
  options: {
    childProcessMock?: {
      execSync?: Mock;
      spawn?: Mock;
    };
    platformOverrides?: Partial<PlatformModule>;
  } = {},
): Promise<{
  lifecycle: LifecycleModule;
  platform: PlatformModule;
}> {
  vi.resetModules();

  vi.doMock('../commands/helpers.js', () => ({
    AGENTS_DIR: join(TEST_DEFAULT_HOME, 'agents'),
    CWD: TEST_CWD,
    DEFAULT_INSTANCE_ID: 'default',
    DEFAULT_PROJECT_HOME: TEST_DEFAULT_HOME,
    DEFAULT_SERVER_PORT: 3141,
    DEFAULT_UI_PORT: 3000,
    INSTANCE_STATE_DIR: TEST_INSTANCE_STATE_DIR,
    PIDFILE: TEST_PIDFILE,
    PLUGINS_DIR: join(TEST_DEFAULT_HOME, 'plugins'),
    PROJECT_HOME: TEST_DEFAULT_HOME,
    extractPluginName: () => '',
    getInstanceStatePath,
    isGitUrl: () => false,
    lookupDepInRegistries: () => null,
    normalizeHomePath: (path: string) => resolve(path),
    normalizeInstanceName,
    parseGitSource: () => ({ branch: 'main', url: '' }),
    readManifest: vi.fn(),
    resolveLifecycleHomeTarget: ({
      baseDir,
      env,
      tempHome,
    }: {
      baseDir?: string;
      env?: NodeJS.ProcessEnv;
      tempHome?: boolean;
    } = {}) => {
      const resolvedEnv = env ?? process.env;

      if (tempHome) {
        const projectHome = mkdtempSync(join(tmpdir(), 'stallion-dev-home-'));
        return {
          isDefaultHome: false,
          projectHome,
          source: '--temp-home' as const,
        };
      }

      if (baseDir) {
        const projectHome = resolve(baseDir);
        return {
          isDefaultHome: projectHome === TEST_DEFAULT_HOME,
          projectHome,
          source: '--base' as const,
        };
      }

      if (resolvedEnv.STALLION_AI_DIR) {
        const projectHome = resolve(resolvedEnv.STALLION_AI_DIR);
        return {
          isDefaultHome: projectHome === TEST_DEFAULT_HOME,
          projectHome,
          source: 'env' as const,
        };
      }

      return {
        isDefaultHome: true,
        projectHome: TEST_DEFAULT_HOME,
        source: 'default' as const,
      };
    },
    resolveLifecycleInstanceId: resolveInstanceId,
  }));

  if (options.childProcessMock) {
    vi.doMock('node:child_process', () => ({
      execSync: options.childProcessMock.execSync ?? vi.fn(),
      spawn: options.childProcessMock.spawn ?? vi.fn(),
    }));
  }

  if (options.platformOverrides) {
    vi.doMock('../commands/platform.js', async () => {
      const actual = await vi.importActual<PlatformModule>(
        '../commands/platform.js',
      );
      return { ...actual, ...options.platformOverrides };
    });
  }

  const lifecycle = await import('../commands/lifecycle.js');
  const platform = await import('../commands/platform.js');
  return { lifecycle, platform };
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function ensureBuildOutputs(instanceId = 'default'): void {
  const server =
    instanceId === 'default' ? 'dist-server' : `dist-server-${instanceId}`;
  const ui = instanceId === 'default' ? 'dist-ui' : `dist-ui-${instanceId}`;
  ensureDir(join(TEST_CWD, server));
  ensureDir(join(TEST_CWD, ui));
}

function writeInstanceState(options: {
  baseDir?: string;
  instanceId?: string;
  instanceName?: string;
  serverPid: number | null;
  serverPort?: number;
  startedAt?: string;
  uiPid: number | null;
  uiPort?: number;
}): string {
  const instanceId =
    options.instanceId ||
    resolveInstanceId({
      instanceName: options.instanceName,
      projectHome: options.baseDir,
      serverPort: options.serverPort,
      uiPort: options.uiPort,
    });
  const statePath = getInstanceStatePath(instanceId);

  ensureDir(TEST_INSTANCE_STATE_DIR);
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        baseDir: resolve(options.baseDir || TEST_DEFAULT_HOME),
        cwd: TEST_CWD,
        homeSource: 'default',
        instanceId,
        serverPid: options.serverPid,
        serverPort: options.serverPort ?? 3141,
        startedAt: options.startedAt ?? new Date().toISOString(),
        uiPid: options.uiPid,
        uiPort: options.uiPort ?? 3000,
      },
      null,
      2,
    ),
  );

  return statePath;
}

async function spawnLongRunning(): Promise<number> {
  const proc = spawnProcess('node', ['-e', 'setInterval(() => {}, 10000)'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  proc.unref();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  return proc.pid!;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock('../commands/helpers.js');
  vi.doUnmock('../commands/platform.js');
  vi.doUnmock('node:child_process');
  rmSync(TEST_ROOT, { force: true, recursive: true });
});

describe('lifecycle instance state', () => {
  it('recognizes and cleans up stale legacy pidfiles', async () => {
    ensureDir(TEST_CWD);
    writeFileSync(TEST_PIDFILE, '99999');

    const { lifecycle } = await loadLifecycleModule();

    expect(lifecycle.isRunning()).toBe(false);
    expect(existsSync(TEST_PIDFILE)).toBe(false);
  });

  it('stops only the targeted named instance when multiple instances are live', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_DEFAULT_HOME);
    ensureDir(TEST_ALT_HOME);

    const alphaPid = await spawnLongRunning();
    const betaPid = await spawnLongRunning();
    writeInstanceState({
      baseDir: TEST_ALT_HOME,
      instanceName: 'alpha',
      serverPid: alphaPid,
      serverPort: 3242,
      uiPid: null,
      uiPort: 5274,
    });
    const betaStatePath = writeInstanceState({
      baseDir: TEST_SECOND_HOME,
      instanceName: 'beta',
      serverPid: betaPid,
      serverPort: 3243,
      uiPid: null,
      uiPort: 5275,
    });

    const { lifecycle } = await loadLifecycleModule();

    lifecycle.stop({ instanceName: 'alpha' });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    expect(isAlive(alphaPid)).toBe(false);
    expect(isAlive(betaPid)).toBe(true);
    expect(existsSync(getInstanceStatePath('alpha'))).toBe(false);
    expect(existsSync(betaStatePath)).toBe(true);

    process.kill(betaPid, 'SIGKILL');
  }, 15_000);

  it('writes per-instance state and injects instance env on start', async () => {
    ensureDir(TEST_CWD);
    ensureBuildOutputs('smoke-a');
    ensureDir(TEST_ALT_HOME);

    const execSync = vi.fn();
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ pid: 41001, unref: vi.fn() })
      .mockReturnValueOnce({ pid: 41002, unref: vi.fn() });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: NodeJS.Signals | number,
    ) => {
      if (signal === 0 && (pid === 41001 || pid === 41002)) {
        return true;
      }
      throw new Error(`unexpected process.kill(${pid}, ${String(signal)})`);
    }) as typeof process.kill);

    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { lifecycle } = await loadLifecycleModule({
      childProcessMock: { execSync, spawn },
      platformOverrides: { sleepSync: vi.fn() },
    });

    lifecycle.start({
      baseDir: TEST_ALT_HOME,
      homeSource: '--base',
      instanceName: 'smoke-a',
      serverPort: 3242,
      uiPort: 5274,
    });

    const statePath = getInstanceStatePath('smoke-a');
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      baseDir: string;
      instanceId: string;
      serverPid: number;
      serverPort: number;
      uiPid: number;
      uiPort: number;
    };

    expect(execSync).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0][1]).toEqual(['dist-server-smoke-a/index.js']);
    expect(spawn.mock.calls[0][2]?.env).toEqual(
      expect.objectContaining({
        PORT: '3242',
        STALLION_AI_DIR: TEST_ALT_HOME,
        STALLION_INSTANCE_ID: 'smoke-a',
        STALLION_INSTANCE_STATE_PATH: statePath,
      }),
    );
    expect(state).toMatchObject({
      baseDir: TEST_ALT_HOME,
      instanceId: 'smoke-a',
      serverPid: 41001,
      serverPort: 3242,
      uiPid: 41002,
      uiPort: 5274,
    });
    expect(consoleLog).toHaveBeenCalledWith(
      '\n  Stop with: stallion stop --instance=smoke-a',
    );

    killSpy.mockRestore();
  });
});

describe('clean', () => {
  it('removes only the explicit base directory and leaves the default home intact', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_DEFAULT_HOME);
    ensureDir(TEST_ALT_HOME);
    ensureBuildOutputs('smoke-a');

    const { lifecycle } = await loadLifecycleModule();

    await lifecycle.clean({
      allowDefaultHomeClean: false,
      force: true,
      homeSource: '--base',
      instanceName: 'smoke-a',
      projectHome: TEST_ALT_HOME,
      serverPort: 3242,
      uiPort: 5274,
    });

    expect(existsSync(TEST_ALT_HOME)).toBe(false);
    expect(existsSync(TEST_DEFAULT_HOME)).toBe(true);
    expect(existsSync(join(TEST_CWD, 'dist-server-smoke-a'))).toBe(false);
    expect(existsSync(join(TEST_CWD, 'dist-ui-smoke-a'))).toBe(false);
  });

  it('refuses to clean the default home without explicit acknowledgement', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_DEFAULT_HOME);

    const { lifecycle } = await loadLifecycleModule();

    await expect(
      lifecycle.clean({
        force: true,
        homeSource: 'default',
        projectHome: TEST_DEFAULT_HOME,
      }),
    ).rejects.toThrow(
      'Refusing to clean the default Stallion home. Use --temp-home for hermetic runs, or pass --allow-default-home-clean when you truly intend to delete ~/.stallion-ai.',
    );
    expect(existsSync(TEST_DEFAULT_HOME)).toBe(true);
  });

  it('allows intentional default-home cleanup when explicitly acknowledged', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_DEFAULT_HOME);
    ensureBuildOutputs();

    const { lifecycle } = await loadLifecycleModule();

    await lifecycle.clean({
      allowDefaultHomeClean: true,
      force: true,
      homeSource: 'default',
      projectHome: TEST_DEFAULT_HOME,
    });

    expect(existsSync(TEST_DEFAULT_HOME)).toBe(false);
  });

  it('blocks shared-build cleanup when a sibling instance is still live', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_ALT_HOME);
    ensureDir(TEST_SECOND_HOME);
    ensureBuildOutputs();

    const siblingPid = await spawnLongRunning();
    writeInstanceState({
      baseDir: TEST_SECOND_HOME,
      instanceName: 'sibling',
      serverPid: siblingPid,
      serverPort: 3243,
      uiPid: null,
      uiPort: 5275,
    });

    const { lifecycle } = await loadLifecycleModule();

    await expect(
      lifecycle.clean({
        force: true,
        homeSource: '--base',
        projectHome: TEST_ALT_HOME,
        serverPort: 3242,
        uiPort: 5274,
      }),
    ).rejects.toThrow(
      'clean is blocked because this checkout uses shared build artifacts and other Stallion instances are still live.',
    );
    expect(isAlive(siblingPid)).toBe(true);

    process.kill(siblingPid, 'SIGKILL');
  }, 15_000);
});

describe('collectDoctorReport', () => {
  it('reports a first-run-ready path when Ollama is reachable locally', async () => {
    const { lifecycle } = await loadLifecycleModule();

    const report = await lifecycle.collectDoctorReport({
      checkOllama: async () => true,
      env: {},
      exec: (command) => {
        if (command === 'node -v') return 'v22.0.0';
        if (command === 'npm -v') return '10.0.0';
        if (command === 'git --version') return 'git version 2.42.0';
        if (command === 'tsx --version') return 'tsx v4.0.0';
        return null;
      },
      exists: () => false,
      readJson: (_path, fallback) => fallback,
    });

    expect(report.chatReady).toBe(true);
    expect(report.runtimeReady).toBe(false);
    expect(report.recommendation).toContain('Ollama is reachable');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Ollama',
          status: 'pass',
        }),
      ]),
    );
  });

  it('prefers configured chat providers over hard-coded defaults', async () => {
    const { lifecycle } = await loadLifecycleModule();

    const report = await lifecycle.collectDoctorReport({
      checkOllama: async () => false,
      env: {},
      exec: (command) => {
        if (command === 'node -v') return 'v22.0.0';
        if (command === 'npm -v') return '10.0.0';
        if (command === 'git --version') return 'git version 2.42.0';
        if (command === 'tsx --version') return 'tsx v4.0.0';
        if (command === 'codex --version') return 'codex 1.0.0';
        return null;
      },
      exists: (path) =>
        path.endsWith('app.json') || path.endsWith('providers.json'),
      readJson: (path, fallback) => {
        if (path.endsWith('app.json')) {
          return {
            defaultModel: 'llama3.2',
            runtimeConnections: {},
          } as typeof fallback;
        }
        if (path.endsWith('providers.json')) {
          return [
            {
              capabilities: ['llm'],
              enabled: true,
              id: 'ollama-local',
            },
          ] as typeof fallback;
        }
        return fallback;
      },
    });

    expect(report.chatReady).toBe(true);
    expect(report.runtimeReady).toBe(true);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Configured chat providers',
          status: 'pass',
        }),
      ]),
    );
  });
});

describe('upgrade', () => {
  it('blocks shared-build upgrades when multiple instances are still live', async () => {
    ensureDir(TEST_CWD);
    ensureDir(TEST_ALT_HOME);
    ensureDir(TEST_SECOND_HOME);

    const alphaPid = await spawnLongRunning();
    const betaPid = await spawnLongRunning();
    writeInstanceState({
      baseDir: TEST_ALT_HOME,
      instanceName: 'alpha',
      serverPid: alphaPid,
      serverPort: 3242,
      uiPid: null,
      uiPort: 5274,
    });
    writeInstanceState({
      baseDir: TEST_SECOND_HOME,
      instanceName: 'beta',
      serverPid: betaPid,
      serverPort: 3243,
      uiPid: null,
      uiPort: 5275,
    });

    const execSync = vi.fn();
    const { lifecycle } = await loadLifecycleModule({
      childProcessMock: { execSync },
    });

    expect(() => lifecycle.upgrade()).toThrow(
      'stallion upgrade is blocked because this checkout has multiple live Stallion instances sharing build artifacts.',
    );
    expect(execSync).not.toHaveBeenCalled();
    expect(isAlive(alphaPid)).toBe(true);
    expect(isAlive(betaPid)).toBe(true);

    process.kill(alphaPid, 'SIGKILL');
    process.kill(betaPid, 'SIGKILL');
  }, 15_000);
});
