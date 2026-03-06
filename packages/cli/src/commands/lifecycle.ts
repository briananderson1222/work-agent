import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveGitInfo } from '@stallion-ai/shared';
import { CWD, PIDFILE } from './helpers.js';

export function isRunning(): boolean {
  if (!existsSync(PIDFILE)) return false;
  const [pid] = readFileSync(PIDFILE, 'utf-8').trim().split(' ');
  try { process.kill(parseInt(pid), 0); return true; } catch { return false; }
}

export function isInstalled(): boolean {
  return existsSync(join(CWD, 'dist-server')) &&
    existsSync(join(CWD, 'dist-ui'));
}

export function start(serverPort = 3141, uiPort = 3000, logFile?: string): void {
  if (isRunning()) {
    console.log(`✓ Already running\n  UI:   http://localhost:${uiPort}\n  Stop: stallion stop`);
    return;
  }

  const firstBuild = !isInstalled();
  if (firstBuild) {
    console.log('Building application...');
    execSync('npm run build:server', { cwd: CWD, stdio: 'inherit' });
    execSync('npm run build:ui', { cwd: CWD, stdio: 'inherit' });
  }

  stop();

  let serverStdio: any = 'ignore';
  if (logFile) {
    const fd = openSync(logFile, 'w');
    serverStdio = ['ignore', fd, fd];
  }

  const serverProc = spawn('node', ['dist-server/index.js'], {
    cwd: CWD, stdio: serverStdio, detached: true,
    env: { ...process.env, PORT: String(serverPort) },
  });
  serverProc.unref();

  const uiProc = spawn('node', ['-e', `
    const http=require('http'),fs=require('fs'),path=require('path');
    const dir=path.join(process.cwd(),'dist-ui');
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.map':'application/json'};
    http.createServer((req,res)=>{
      let u=req.url.split('?')[0];
      let p=path.join(dir,u==='/'?'index.html':u);
      if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(dir,'index.html');
      const ext=path.extname(p);
      res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-cache'});
      fs.createReadStream(p).pipe(res);
    }).listen(${uiPort});
  `], {
    cwd: CWD, stdio: 'ignore', detached: true, env: { ...process.env },
  });
  uiProc.unref();

  writeFileSync(PIDFILE, `${serverProc.pid} ${uiProc.pid}`);

  execSync('sleep 1');
  try {
    process.kill(serverProc.pid!, 0);
    process.kill(uiProc.pid!, 0);
    console.log(`\n  ✓ Server: http://localhost:${serverPort}`);
    console.log(`  ✓ UI:     http://localhost:${uiPort}`);
    console.log('\n  Stop with: stallion stop');
  } catch {
    console.error(`Failed to start. Check that ports ${serverPort} and ${uiPort} are free.`);
    stop();
    process.exit(1);
  }
}

export function stop(): void {
  if (!existsSync(PIDFILE)) return;
  const pids = readFileSync(PIDFILE, 'utf-8').trim().split(' ');
  for (const pid of pids) {
    try { process.kill(parseInt(pid)); } catch {}
  }
  rmSync(PIDFILE, { force: true });
  console.log('  ✓ Stopped');
}

export function doctor(): void {
  console.log('Checking prerequisites...\n');
  let ok = true;

  const check = (name: string, cmd: string, versionCmd?: string) => {
    try {
      const ver = versionCmd
        ? execSync(versionCmd, { encoding: 'utf-8' }).trim()
        : '';
      console.log(`  ✓ ${name}${ver ? ' ' + ver : ''}`);
    } catch {
      console.log(`  ✗ ${name} — not found`);
      ok = false;
    }
  };

  check('Node.js', 'node', 'node -v');
  check('npm', 'npm', 'npm -v');
  check('git', 'git', 'git --version');
  check('tsx', 'tsx', 'tsx --version');

  try {
    execSync('rustc --version', { stdio: 'pipe' });
    const ver = execSync('rustc --version', { encoding: 'utf-8' }).trim();
    console.log(`  ✓ Rust ${ver.split(' ')[1]} (desktop builds available)`);
  } catch {
    console.log('  ⚠ Rust — not installed (desktop builds unavailable)');
  }

  const major = parseInt(process.version.slice(1));
  if (major < 20) {
    console.log(`\n  ✗ Node.js ${process.version} is too old (need >= 20)`);
    ok = false;
  }

  if (!ok) {
    console.log('\nMissing required prerequisites.');
    process.exit(1);
  }
  console.log('\n  All good!');
}

export function link(): void {
  const target = '/usr/local/bin/stallion';
  const source = join(CWD, 'stallion');

  if (!existsSync(source)) {
    console.error('No stallion script found in current directory.');
    process.exit(1);
  }

  try {
    execSync(`ln -sf "${source}" "${target}"`, { stdio: 'pipe' });
  } catch {
    execSync(`sudo ln -sf "${source}" "${target}"`, { stdio: 'inherit' });
  }
  console.log(`  ✓ Linked: stallion → ${source}`);
  console.log("  You can now run 'stallion' from anywhere");
}

export function shortcut(): void {
  const appDir = join(homedir(), 'Applications', 'Stallion.app');
  const macosDir = join(appDir, 'Contents', 'MacOS');
  mkdirSync(macosDir, { recursive: true });

  writeFileSync(join(appDir, 'Contents', 'Info.plist'),
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
</plist>`);

  const stallionPath = join(CWD, 'stallion');
  writeFileSync(join(macosDir, 'launch'),
`#!/bin/bash
"${stallionPath}" start &
sleep 2
open "http://localhost:3000"
`);
  execSync(`chmod +x "${join(macosDir, 'launch')}"`);

  console.log('  ✓ Created ~/Applications/Stallion.app');
  console.log('  Double-click to launch Stallion and open in browser');
}

export function clean(force = false): void {
  if (!force) {
    console.log('\n⚠️  This will delete ~/.stallion-ai which includes:');
    console.log('   - All installed plugins');
    console.log('   - Conversation history');
    console.log('   - Tool configurations\n');

    try {
      const answer = execSync('read -p "Continue? [y/N] " -n 1 -r ans && echo $ans', {
        stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf-8', shell: '/bin/bash',
      }).trim().toLowerCase();
      console.log('');
      if (answer !== 'y') {
        console.log('Cancelled.');
        process.exit(0);
      }
    } catch {
      console.log('\nCancelled.');
      process.exit(0);
    }
  }

  stop();
  rmSync(join(homedir(), '.stallion-ai'), { recursive: true, force: true });
  rmSync(join(CWD, 'dist-server'), { recursive: true, force: true });
  rmSync(join(CWD, 'dist-ui'), { recursive: true, force: true });
  console.log('  ✓ Cleaned');
}

export function upgrade(): void {
  if (isRunning()) {
    stop();
  }

  const { gitRoot } = resolveGitInfo(CWD);

  console.log('Pulling latest...');
  execSync('git pull', { cwd: gitRoot, stdio: 'inherit' });

  console.log('\nInstalling dependencies...');
  execSync('npm install', { cwd: gitRoot, stdio: 'inherit' });

  console.log('\nRebuilding...');
  execSync('npm run build:server', { cwd: gitRoot, stdio: 'inherit' });
  execSync('npm run build:ui', { cwd: gitRoot, stdio: 'inherit' });

  console.log('\n  ✓ Upgraded');
  console.log('  Plugins unchanged. Run "stallion start" to launch.');
}
