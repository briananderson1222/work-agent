import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// ─── temp path constants ──────────────────────────────────────────────────────
// Use a unique dir per test run so parallel runs don't collide.
const TEST_CWD = join(tmpdir(), `stallion-lifecycle-${process.pid}`);
const TEST_PROJECT_HOME = join(TEST_CWD, '.stallion-ai');
const TEST_PIDFILE = join(TEST_CWD, '.stallion.pids');

// ─── dynamically loaded lifecycle under mocked helpers ────────────────────────
// vi.doMock (not hoisted) + resetModules ensures lifecycle.ts binds to our
// temp paths instead of the real ~/.stallion-ai and repo CWD.
//
// platformModule MUST be imported after the reset so that lifecycle.js and the
// test share the same module instance — required for vi.spyOn to intercept calls
// made from inside lifecycle.
let isRunning: () => boolean;
let stop: () => void;
let clean: (force?: boolean) => Promise<void>;
let platformModule: typeof import('../commands/platform.js');

beforeAll(async () => {
  mkdirSync(TEST_CWD, { recursive: true });

  vi.resetModules();
  vi.doMock('../commands/helpers.js', () => ({
    CWD: TEST_CWD,
    PROJECT_HOME: TEST_PROJECT_HOME,
    PIDFILE: TEST_PIDFILE,
    PLUGINS_DIR: join(TEST_PROJECT_HOME, 'plugins'),
    AGENTS_DIR: join(TEST_PROJECT_HOME, 'agents'),
    LAYOUTS_DIR: join(TEST_PROJECT_HOME, 'layouts'),
    readManifest: vi.fn(),
    isGitUrl: () => false,
    parseGitSource: () => ({ url: '', branch: 'main' }),
    extractPluginName: () => '',
    lookupDepInRegistries: () => null,
  }));

  // lifecycle.js is imported first — it loads and caches the fresh platform.js
  const mod = await import('../commands/lifecycle.js');
  isRunning = mod.isRunning;
  stop = mod.stop;
  clean = mod.clean;

  // Importing platform.js now hits the same cached fresh instance
  platformModule = await import('../commands/platform.js');
});

afterAll(() => {
  vi.doUnmock('../commands/helpers.js');
  vi.resetModules();
  rmSync(TEST_CWD, { recursive: true, force: true });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureNoPidfile() {
  if (existsSync(TEST_PIDFILE)) rmSync(TEST_PIDFILE, { force: true });
}

async function spawnLongRunning(): Promise<number> {
  const proc = spawn(
    'node',
    ['-e', 'setInterval(() => {}, 10000)'],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  proc.unref();
  await new Promise((r) => setTimeout(r, 150));
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

beforeEach(ensureNoPidfile);
afterEach(ensureNoPidfile);

// ─── isRunning ────────────────────────────────────────────────────────────────

describe('isRunning', () => {
  it('returns false when no pidfile exists', () => {
    expect(isRunning()).toBe(false);
  });

  it('returns false when pidfile contains a dead PID', () => {
    writeFileSync(TEST_PIDFILE, '99999');
    expect(isRunning()).toBe(false);
  });

  it('returns true when pidfile contains a live PID', async () => {
    const pid = await spawnLongRunning();
    try {
      writeFileSync(TEST_PIDFILE, String(pid));
      expect(isRunning()).toBe(true);
    } finally {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('is a noop when no pidfile exists', () => {
    expect(() => stop()).not.toThrow();
    expect(existsSync(TEST_PIDFILE)).toBe(false);
  });

  it('kills a single process and removes the pidfile', async () => {
    const pid = await spawnLongRunning();
    writeFileSync(TEST_PIDFILE, String(pid));

    stop();

    expect(existsSync(TEST_PIDFILE)).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(isAlive(pid)).toBe(false);
  });

  it('kills multiple processes listed in the pidfile', async () => {
    const pid1 = await spawnLongRunning();
    const pid2 = await spawnLongRunning();
    writeFileSync(TEST_PIDFILE, `${pid1} ${pid2}`);

    stop();

    expect(existsSync(TEST_PIDFILE)).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(isAlive(pid1)).toBe(false);
    expect(isAlive(pid2)).toBe(false);
  });

  it('handles a pidfile containing only dead PIDs without throwing', () => {
    writeFileSync(TEST_PIDFILE, '99998 99999');
    expect(() => stop()).not.toThrow();
    expect(existsSync(TEST_PIDFILE)).toBe(false);
  });
});

// ─── clean ────────────────────────────────────────────────────────────────────

describe('clean', () => {
  // Re-create the three dirs that clean() deletes before each test
  beforeEach(() => {
    mkdirSync(TEST_PROJECT_HOME, { recursive: true });
    mkdirSync(join(TEST_CWD, 'dist-server'), { recursive: true });
    mkdirSync(join(TEST_CWD, 'dist-ui'), { recursive: true });
  });

  it('--force: removes PROJECT_HOME, dist-server, and dist-ui', async () => {
    await clean(true);

    expect(existsSync(TEST_PROJECT_HOME)).toBe(false);
    expect(existsSync(join(TEST_CWD, 'dist-server'))).toBe(false);
    expect(existsSync(join(TEST_CWD, 'dist-ui'))).toBe(false);
  });

  it('--force: does not call promptYN', async () => {
    const promptSpy = vi
      .spyOn(platformModule, 'promptYN')
      .mockResolvedValue(false);
    try {
      await clean(true);
      expect(promptSpy).not.toHaveBeenCalled();
    } finally {
      promptSpy.mockRestore();
    }
  });

  it('interactive: exits without cleaning when user says no', async () => {
    const promptSpy = vi
      .spyOn(platformModule, 'promptYN')
      .mockResolvedValue(false);
    // Throw on exit so execution doesn't fall through past process.exit(0),
    // matching real behaviour where exit() terminates the process.
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
    try {
      await expect(clean(false)).rejects.toThrow('process.exit(0)');

      expect(promptSpy).toHaveBeenCalledOnce();
      // Directories must still exist — clean was aborted before rmSync calls
      expect(existsSync(TEST_PROJECT_HOME)).toBe(true);
      expect(existsSync(join(TEST_CWD, 'dist-server'))).toBe(true);
      expect(existsSync(join(TEST_CWD, 'dist-ui'))).toBe(true);
    } finally {
      promptSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('interactive: proceeds with cleaning when user says yes', async () => {
    const promptSpy = vi
      .spyOn(platformModule, 'promptYN')
      .mockResolvedValue(true);
    try {
      await clean(false);

      expect(promptSpy).toHaveBeenCalledOnce();
      expect(existsSync(TEST_PROJECT_HOME)).toBe(false);
      expect(existsSync(join(TEST_CWD, 'dist-server'))).toBe(false);
      expect(existsSync(join(TEST_CWD, 'dist-ui'))).toBe(false);
    } finally {
      promptSpy.mockRestore();
    }
  });
});
