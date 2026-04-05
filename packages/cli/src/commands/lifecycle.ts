import { execSync, spawn } from 'node:child_process';
import {
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveGitInfo } from '@stallion-ai/shared';
import { CWD, PIDFILE, PROJECT_HOME } from './helpers.js';
import {
  createAppShortcut,
  createPathLink,
  killProcessTree,
  promptYN,
  sleepSync,
} from './platform.js';

export function isRunning(): boolean {
  if (!existsSync(PIDFILE)) return false;
  const [pid] = readFileSync(PIDFILE, 'utf-8').trim().split(' ');
  try {
    process.kill(parseInt(pid, 10), 0);
    return true;
  } catch {
    return false;
  }
}

export function isInstalled(): boolean {
  return (
    existsSync(join(CWD, 'dist-server')) && existsSync(join(CWD, 'dist-ui'))
  );
}

export interface StartOptions {
  serverPort?: number;
  uiPort?: number;
  logFile?: string;
  build?: boolean;
  baseDir?: string;
  features?: string;
}

export function start(opts: StartOptions = {}): void {
  const {
    serverPort = 3141,
    uiPort = 3000,
    logFile,
    build,
    baseDir,
    features,
  } = opts;

  if (build) {
    console.log('Building application...');
    if (isRunning()) stop();
    execSync('npm run build:server', { cwd: CWD, stdio: 'inherit' });
    execSync('npm run build:ui', { cwd: CWD, stdio: 'inherit' });
  } else if (isRunning()) {
    console.log(
      `✓ Already running\n  UI:   http://localhost:${uiPort}\n  Stop: stallion stop`,
    );
    return;
  } else if (!isInstalled()) {
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

  const serverEnv: Record<string, string> = {
    ...(process.env as any),
    PORT: String(serverPort),
  };
  if (baseDir) serverEnv.STALLION_AI_DIR = baseDir;
  if (features) serverEnv.STALLION_FEATURES = features;

  const serverProc = spawn('node', ['dist-server/index.js'], {
    cwd: CWD,
    stdio: serverStdio,
    detached: true,
    windowsHide: true,
    env: serverEnv,
  });
  serverProc.unref();

  const apiBase = `http://localhost:${serverPort}`;
  const uiProc = spawn(
    'node',
    [
      '-e',
      `
    const http=require('http'),fs=require('fs'),path=require('path');
    const dir=path.join(process.cwd(),'dist-ui');
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.map':'application/json'};
    const inject='<script>window.__API_BASE__=${JSON.stringify(apiBase)}</script>';
    http.createServer((req,res)=>{
      let u=req.url.split('?')[0];
      let p=path.join(dir,u==='/'?'index.html':u);
      if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(dir,'index.html');
      const ext=path.extname(p);
      if(ext==='.html'){
        let html=fs.readFileSync(p,'utf-8');
        html=html.replace('<head>','<head>'+inject);
        res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-cache'});
        res.end(html);
      } else {
        res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-cache'});
        fs.createReadStream(p).pipe(res);
      }
    }).listen(${uiPort},'0.0.0.0');
  `,
    ],
    {
      cwd: CWD,
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      env: { ...process.env },
    },
  );
  uiProc.unref();

  writeFileSync(PIDFILE, `${serverProc.pid} ${uiProc.pid}`);

  sleepSync(1000);
  try {
    process.kill(serverProc.pid!, 0);
    process.kill(uiProc.pid!, 0);
    console.log(`\n  ✓ Server: http://localhost:${serverPort}`);
    console.log(`  ✓ UI:     http://localhost:${uiPort}`);
    console.log('\n  Stop with: stallion stop');
  } catch {
    console.error(
      `Failed to start. Check that ports ${serverPort} and ${uiPort} are free.`,
    );
    stop();
    process.exit(1);
  }
}

export function stop(): void {
  if (!existsSync(PIDFILE)) return;
  const pids = readFileSync(PIDFILE, 'utf-8')
    .trim()
    .split(' ')
    .map((p) => parseInt(p, 10));
  for (const pid of pids) {
    killProcessTree(pid);
  }
  rmSync(PIDFILE, { force: true });
  console.log('  ✓ Stopped');
}

export function doctor(): void {
  console.log('Checking prerequisites...\n');
  let ok = true;

  const check = (name: string, _cmd: string, versionCmd?: string) => {
    try {
      const ver = versionCmd
        ? execSync(versionCmd, { encoding: 'utf-8' }).trim()
        : '';
      console.log(`  ✓ ${name}${ver ? ` ${ver}` : ''}`);
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

  const major = parseInt(process.version.slice(1), 10);
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
  createPathLink(CWD);
}

export function shortcut(): void {
  createAppShortcut(CWD);
}

export async function clean(force = false): Promise<void> {
  if (!force) {
    console.log(`\n⚠️  This will delete ${PROJECT_HOME} which includes:`);
    console.log('   - All installed plugins');
    console.log('   - Conversation history');
    console.log('   - Tool configurations\n');

    const confirmed = await promptYN('Continue?');
    console.log('');
    if (!confirmed) {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  stop();
  rmSync(PROJECT_HOME, { recursive: true, force: true });
  rmSync(join(CWD, 'dist-server'), { recursive: true, force: true });
  rmSync(join(CWD, 'dist-ui'), { recursive: true, force: true });
  console.log('  ✓ Cleaned');
}

export function upgrade(): void {
  if (isRunning()) {
    stop();
  }

  const { gitRoot, branch } = resolveGitInfo(CWD);

  // Auto-configure upstream tracking if missing but origin exists
  try {
    execSync(`git rev-parse --abbrev-ref ${branch}@{u}`, {
      cwd: gitRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    try {
      execSync('git remote get-url origin', {
        cwd: gitRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log('Configuring upstream tracking...');
      execSync(`git fetch origin ${branch} --quiet`, {
        cwd: gitRoot,
        timeout: 15000,
      });
      execSync(`git branch --set-upstream-to=origin/${branch} ${branch}`, {
        cwd: gitRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      console.error(
        'No upstream configured and no origin remote found. Cannot upgrade.',
      );
      process.exit(1);
    }
  }

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
