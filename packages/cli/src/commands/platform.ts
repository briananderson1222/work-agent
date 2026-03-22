import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

/** Cross-platform synchronous sleep — no shell spawn needed. */
export function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {} // busy-wait fallback
  }
}

/**
 * Kill a process and its entire child tree, then wait for it to exit.
 * Unix : SIGTERM → poll 5 s → SIGKILL (process-group first, then single PID)
 * Windows : taskkill /F /T /PID (kills tree synchronously)
 */
export function killProcessTree(pid: number): void {
  if (IS_WINDOWS) {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
      });
    } catch {
      /* already gone */
    }
    return;
  }
  // Unix: try process-group kill first, fall back to single-PID
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // gone
    }
    sleepSync(200);
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {}
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

/** Cross-platform async yes/no prompt via node:readline (no shell). */
export async function promptYN(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

/**
 * Register the stallion CLI globally on PATH.
 * Unix    : symlink repoRoot/stallion → /usr/local/bin/stallion
 * Windows : write stallion.cmd shim to %APPDATA%\npm\ (npm puts that on PATH)
 */
export function createPathLink(repoRoot: string): void {
  if (IS_WINDOWS) {
    const cliTs = join(repoRoot, 'packages', 'cli', 'src', 'cli.ts');
    const npmBin = join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'npm',
    );
    mkdirSync(npmBin, { recursive: true });
    writeFileSync(
      join(npmBin, 'stallion.cmd'),
      `@echo off\nnpx tsx "${cliTs}" %*\n`,
    );
    console.log(`  ✓ stallion.cmd → ${cliTs}`);
    console.log("  You can now run 'stallion' from anywhere");
    return;
  }
  const source = join(repoRoot, 'stallion');
  if (!existsSync(source)) {
    console.error('No stallion script found in current directory.');
    process.exit(1);
  }
  try {
    execFileSync('ln', ['-sf', source, '/usr/local/bin/stallion'], { stdio: 'pipe' });
  } catch {
    execFileSync('sudo', ['ln', '-sf', source, '/usr/local/bin/stallion'], {
      stdio: 'inherit',
    });
  }
  console.log(`  ✓ Linked: stallion → ${source}`);
  console.log("  You can now run 'stallion' from anywhere");
}

/**
 * Create a platform-specific one-click launcher.
 * macOS   : ~/Applications/Stallion.app
 * Windows : ~/Desktop/Stallion.bat
 * Linux   : ~/.local/share/applications/stallion.desktop
 */
export function createAppShortcut(repoRoot: string): void {
  if (IS_WINDOWS) {
    const cliTs = join(repoRoot, 'packages', 'cli', 'src', 'cli.ts');
    let desktop: string;
    try {
      desktop = execSync(
        'powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"',
        { encoding: 'utf-8' },
      ).trim();
    } catch {
      desktop = join(homedir(), 'Desktop');
    }
    const bat = join(desktop, 'Stallion.bat');
    writeFileSync(
      bat,
      `@echo off\nstart "" /B npx tsx "${cliTs}" start\ntimeout /t 2 /nobreak >nul\nstart "" http://localhost:3000\n`,
    );
    console.log(`  ✓ Created ${bat}`);
    console.log('  Double-click to launch Stallion and open in browser');
    return;
  }

  const stallionPath = join(repoRoot, 'stallion');

  if (IS_MAC) {
    const appDir = join(homedir(), 'Applications', 'Stallion.app');
    const macosDir = join(appDir, 'Contents', 'MacOS');
    mkdirSync(macosDir, { recursive: true });
    writeFileSync(
      join(appDir, 'Contents', 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Stallion</string>
  <key>CFBundleDisplayName</key><string>Stallion AI</string>
  <key>CFBundleIdentifier</key><string>com.stallion-ai.launcher</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>`,
    );
    writeFileSync(
      join(macosDir, 'launch'),
      `#!/bin/bash\n"${stallionPath}" start &\nsleep 2\nopen "http://localhost:3000"\n`,
    );
    execFileSync('chmod', ['+x', join(macosDir, 'launch')]);
    console.log('  ✓ Created ~/Applications/Stallion.app');
    console.log('  Double-click to launch Stallion and open in browser');
    return;
  }

  // Linux
  const desktopDir = join(homedir(), '.local', 'share', 'applications');
  mkdirSync(desktopDir, { recursive: true });
  writeFileSync(
    join(desktopDir, 'stallion.desktop'),
    `[Desktop Entry]\nName=Stallion AI\nExec=bash -c '"${stallionPath}" start & sleep 2 && xdg-open http://localhost:3000'\nType=Application\nTerminal=false\n`,
  );
  console.log('  ✓ Created ~/.local/share/applications/stallion.desktop');
  console.log('  Launch from your application menu');
}
