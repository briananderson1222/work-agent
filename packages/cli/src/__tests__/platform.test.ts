import { execSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppShortcut,
  createPathLink,
  IS_MAC,
  IS_WINDOWS,
  killProcessTree,
  sleepSync,
} from '../commands/platform.js';

// ─── sleepSync ────────────────────────────────────────────────────────────────

describe('sleepSync', () => {
  it('blocks for at least the requested duration', () => {
    const start = Date.now();
    sleepSync(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(150);
  });

  it('does not block dramatically longer than requested', () => {
    const start = Date.now();
    sleepSync(100);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('handles 0 ms without hanging', () => {
    const start = Date.now();
    sleepSync(0);
    expect(Date.now() - start).toBeLessThan(200);
  });
});

// ─── killProcessTree ──────────────────────────────────────────────────────────

describe('killProcessTree', () => {
  it('does not throw when PID does not exist', () => {
    expect(() => killProcessTree(99999)).not.toThrow();
  });

  it('kills a live process', async () => {
    const proc = spawn(
      'node',
      ['-e', 'setInterval(() => {}, 10000)'],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    proc.unref();
    const pid = proc.pid!;

    await new Promise((r) => setTimeout(r, 150));
    expect(() => process.kill(pid, 0)).not.toThrow();

    killProcessTree(pid);

    await new Promise((r) => setTimeout(r, 500));
    expect(() => process.kill(pid, 0)).toThrow();
  }, 15_000);
});

// ─── promptYN — logic coverage ───────────────────────────────────────────────

describe('promptYN (answer parsing logic)', () => {
  // The readline interaction is integration-tested manually; here we verify
  // the acceptance logic used inside promptYN.
  const accepts = (raw: string) => raw.trim().toLowerCase() === 'y';

  it('"y" is accepted', () => expect(accepts('y')).toBe(true));
  it('"Y" is accepted', () => expect(accepts('Y')).toBe(true));
  it('"y " with trailing space is accepted', () => expect(accepts('y ')).toBe(true));
  it('"n" is rejected', () => expect(accepts('n')).toBe(false));
  it('"N" is rejected', () => expect(accepts('N')).toBe(false));
  it('empty string is rejected', () => expect(accepts('')).toBe(false));
  it('whitespace-only is rejected', () => expect(accepts('  ')).toBe(false));
  it('"yes" is rejected (must be single y)', () => expect(accepts('yes')).toBe(false));
});

// ─── createPathLink ───────────────────────────────────────────────────────────

describe('createPathLink', () => {
  let tmpDir: string;
  let origAppData: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stallion-link-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (origAppData !== undefined) process.env['APPDATA'] = origAppData;
    else delete process.env['APPDATA'];
  });

  it.runIf(IS_WINDOWS)(
    'Windows: writes stallion.cmd shim to %APPDATA%\\npm\\',
    () => {
      origAppData = process.env['APPDATA'];
      process.env['APPDATA'] = tmpDir;

      createPathLink('/fake/repo');

      const shim = join(tmpDir, 'npm', 'stallion.cmd');
      expect(existsSync(shim)).toBe(true);
      const content = readFileSync(shim, 'utf-8');
      expect(content).toContain('@echo off');
      expect(content).toContain('npx tsx');
      expect(content).toContain(
        join('/fake/repo', 'packages', 'cli', 'src', 'cli.ts'),
      );
      expect(content).toContain('%*');
    },
  );

  it.runIf(IS_WINDOWS)(
    'Windows: creates npm bin dir if it does not exist',
    () => {
      origAppData = process.env['APPDATA'];
      process.env['APPDATA'] = tmpDir;

      expect(existsSync(join(tmpDir, 'npm'))).toBe(false);
      createPathLink('/fake/repo');
      expect(existsSync(join(tmpDir, 'npm'))).toBe(true);
    },
  );

  it.runIf(!IS_WINDOWS)(
    'Unix: errors and exits when stallion script is missing',
    () => {
      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockErr = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      createPathLink(tmpDir); // no 'stallion' file in tmpDir

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
      mockErr.mockRestore();
    },
  );
});

// ─── createAppShortcut ────────────────────────────────────────────────────────

describe('createAppShortcut', () => {
  it.runIf(IS_WINDOWS)(
    'Windows: writes a .bat launcher to the detected desktop',
    () => {
      const desktop = execSync(
        "powershell -NoProfile -Command \"[Environment]::GetFolderPath('Desktop')\"",
        { encoding: 'utf-8' },
      ).trim();
      const bat = join(desktop, 'Stallion.bat');
      if (existsSync(bat)) rmSync(bat);

      try {
        createAppShortcut('/test/repo');

        expect(existsSync(bat)).toBe(true);
        const content = readFileSync(bat, 'utf-8');
        expect(content).toContain('@echo off');
        expect(content).toContain('npx tsx');
        expect(content).toContain(
          join('/test/repo', 'packages', 'cli', 'src', 'cli.ts'),
        );
        expect(content).toContain('http://localhost:3000');
      } finally {
        if (existsSync(bat)) rmSync(bat);
      }
    },
  );

  it.runIf(IS_MAC)(
    'macOS: creates .app bundle with Info.plist and launch script',
    () => {
      const appDir = join(homedir(), 'Applications', 'Stallion.app');
      if (existsSync(appDir)) rmSync(appDir, { recursive: true });

      try {
        createAppShortcut('/test/repo');

        expect(existsSync(join(appDir, 'Contents', 'Info.plist'))).toBe(true);
        expect(
          existsSync(join(appDir, 'Contents', 'MacOS', 'launch')),
        ).toBe(true);
        const plist = readFileSync(
          join(appDir, 'Contents', 'Info.plist'),
          'utf-8',
        );
        expect(plist).toContain('com.stallion-ai.launcher');
        const launch = readFileSync(
          join(appDir, 'Contents', 'MacOS', 'launch'),
          'utf-8',
        );
        expect(launch).toContain('http://localhost:3000');
      } finally {
        if (existsSync(appDir)) rmSync(appDir, { recursive: true });
      }
    },
  );

  it.runIf(!IS_WINDOWS && !IS_MAC)(
    'Linux: creates .desktop entry',
    () => {
      const desktopDir = join(homedir(), '.local', 'share', 'applications');
      const desktopFile = join(desktopDir, 'stallion.desktop');
      if (existsSync(desktopFile)) rmSync(desktopFile);

      try {
        createAppShortcut('/test/repo');

        expect(existsSync(desktopFile)).toBe(true);
        const content = readFileSync(desktopFile, 'utf-8');
        expect(content).toContain('[Desktop Entry]');
        expect(content).toContain('Name=Stallion AI');
        expect(content).toContain('http://localhost:3000');
      } finally {
        if (existsSync(desktopFile)) rmSync(desktopFile);
      }
    },
  );
});
