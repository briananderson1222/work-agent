import { execSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveGitInfo } from '@stallion-ai/shared/git';
import {
  CWD,
  DEFAULT_INSTANCE_ID,
  DEFAULT_PROJECT_HOME,
  DEFAULT_SERVER_PORT,
  DEFAULT_UI_PORT,
  getInstanceStatePath,
  INSTANCE_STATE_DIR,
  type LifecycleHomeSource,
  normalizeHomePath,
  normalizeInstanceName,
  PIDFILE,
  resolveLifecycleHomeTarget,
  resolveLifecycleInstanceId,
} from './helpers.js';
import {
  createAppShortcut,
  createPathLink,
  killProcessTree,
  promptYN,
  sleepSync,
} from './platform.js';

interface InstanceStateRecord {
  baseDir: string;
  cwd: string;
  homeSource: LifecycleHomeSource;
  instanceId: string;
  legacy?: boolean;
  serverPid: number | null;
  serverPort: number;
  startedAt: string;
  statePath: string;
  uiPid: number | null;
  uiPort: number;
}

interface InstanceSelector {
  baseDir?: string;
  instanceId?: string;
  instanceName?: string;
  serverPort?: number;
  uiPort?: number;
}

export interface StartOptions extends InstanceSelector {
  build?: boolean;
  features?: string;
  homeSource?: LifecycleHomeSource;
  logFile?: string;
}

export interface StopOptions extends InstanceSelector {}

export interface CleanOptions extends InstanceSelector {
  actionLabel?: string;
  allowDefaultHomeClean?: boolean;
  force?: boolean;
  homeSource?: LifecycleHomeSource;
  projectHome?: string;
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

function notifyBuildUpdated(serverPort: number): void {
  try {
    execSync(
      `curl -s -X POST http://localhost:${serverPort}/api/system/build-updated`,
      { stdio: 'ignore', timeout: 3000 },
    );
  } catch {}
}

function removeStateRecord(record: InstanceStateRecord): void {
  rmSync(record.statePath, { force: true });
}

function readLegacyInstanceState(): InstanceStateRecord | null {
  if (!existsSync(PIDFILE)) return null;

  const [serverPid, uiPid] = parsePidList(readFileSync(PIDFILE, 'utf-8'));
  const record: InstanceStateRecord = {
    instanceId: DEFAULT_INSTANCE_ID,
    serverPid,
    uiPid,
    serverPort: DEFAULT_SERVER_PORT,
    uiPort: DEFAULT_UI_PORT,
    baseDir: DEFAULT_PROJECT_HOME,
    homeSource: 'default',
    startedAt: new Date(0).toISOString(),
    cwd: CWD,
    statePath: PIDFILE,
    legacy: true,
  };

  if (!isInstanceRunning(record)) {
    removeStateRecord(record);
    return null;
  }

  return record;
}

function readInstanceStateFile(path: string): InstanceStateRecord | null {
  try {
    const parsed = JSON.parse(
      readFileSync(path, 'utf-8'),
    ) as Partial<InstanceStateRecord>;
    const instanceId = parsed.instanceId;
    if (!instanceId) return null;

    return {
      instanceId,
      serverPid: parsed.serverPid ?? null,
      uiPid: parsed.uiPid ?? null,
      serverPort: parsed.serverPort ?? DEFAULT_SERVER_PORT,
      uiPort: parsed.uiPort ?? DEFAULT_UI_PORT,
      baseDir: normalizeHomePath(parsed.baseDir || DEFAULT_PROJECT_HOME),
      homeSource: parsed.homeSource || 'default',
      startedAt: parsed.startedAt || new Date(0).toISOString(),
      cwd: parsed.cwd || CWD,
      statePath: path,
    };
  } catch {
    return null;
  }
}

function listRunningInstances(): InstanceStateRecord[] {
  const records: InstanceStateRecord[] = [];

  if (existsSync(INSTANCE_STATE_DIR)) {
    for (const entry of readdirSync(INSTANCE_STATE_DIR)) {
      if (!entry.endsWith('.json')) continue;
      const path = join(INSTANCE_STATE_DIR, entry);
      const record = readInstanceStateFile(path);
      if (!record || !isInstanceRunning(record)) {
        rmSync(path, { force: true });
        continue;
      }
      records.push(record);
    }
  }

  const hasDefaultRecord = records.some(
    (record) => record.instanceId === DEFAULT_INSTANCE_ID,
  );
  const legacyRecord = readLegacyInstanceState();
  if (legacyRecord && !hasDefaultRecord) {
    records.push(legacyRecord);
  } else if (legacyRecord && hasDefaultRecord) {
    removeStateRecord(legacyRecord);
  }

  return records.sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
}

function normalizeSelector(
  selector: InstanceSelector = {},
): Required<Pick<InstanceSelector, never>> & InstanceSelector {
  return {
    ...selector,
    baseDir: selector.baseDir ? normalizeHomePath(selector.baseDir) : undefined,
    instanceId:
      selector.instanceId ||
      (selector.instanceName
        ? normalizeInstanceName(selector.instanceName)
        : undefined),
  };
}

function matchesSelector(
  record: InstanceStateRecord,
  selector: InstanceSelector,
): boolean {
  if (selector.instanceId && record.instanceId !== selector.instanceId) {
    return false;
  }
  if (selector.baseDir && record.baseDir !== selector.baseDir) {
    return false;
  }
  if (
    selector.serverPort !== undefined &&
    record.serverPort !== selector.serverPort
  ) {
    return false;
  }
  if (selector.uiPort !== undefined && record.uiPort !== selector.uiPort) {
    return false;
  }
  return true;
}

function describeInstance(record: InstanceStateRecord): string {
  return `${record.instanceId} — server ${record.serverPort}, ui ${record.uiPort}, home ${record.baseDir}`;
}

function stopRecord(record: InstanceStateRecord, announce = true): void {
  const pids = new Set(
    [record.serverPid, record.uiPid].filter(
      (value): value is number => value != null,
    ),
  );
  for (const pid of pids) {
    killProcessTree(pid);
  }
  removeStateRecord(record);
  if (announce) {
    console.log('  ✓ Stopped');
  }
}

function assertNoSiblingConflicts(
  instanceId: string,
  actionLabel: string,
): void {
  const siblings = listRunningInstances().filter(
    (record) => record.instanceId !== instanceId,
  );
  if (siblings.length === 0) return;

  throw new Error(
    [
      `${actionLabel} is blocked because this checkout uses shared build artifacts and other Stallion instances are still live.`,
      'Stop the sibling instance(s) first or rerun the action from a different checkout.',
      ...siblings.map((record) => `  - ${describeInstance(record)}`),
    ].join('\n'),
  );
}

function ensureSingleMatch(
  matches: InstanceStateRecord[],
  action: string,
): InstanceStateRecord | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  throw new Error(
    [
      `${action} matched multiple running Stallion instances in this checkout.`,
      'Use --instance, --base, --port, or --ui-port to disambiguate.',
      ...matches.map((record) => `  - ${describeInstance(record)}`),
    ].join('\n'),
  );
}

function writeInstanceState(record: InstanceStateRecord): void {
  mkdirSync(INSTANCE_STATE_DIR, { recursive: true });
  writeFileSync(
    record.statePath,
    JSON.stringify(
      {
        instanceId: record.instanceId,
        serverPid: record.serverPid,
        uiPid: record.uiPid,
        serverPort: record.serverPort,
        uiPort: record.uiPort,
        baseDir: record.baseDir,
        homeSource: record.homeSource,
        startedAt: record.startedAt,
        cwd: record.cwd,
      },
      null,
      2,
    ),
  );
  rmSync(PIDFILE, { force: true });
}

function announceHome(projectHome: string, source: LifecycleHomeSource): void {
  if (source === '--temp-home') {
    console.log(`Using temporary Stallion home: ${projectHome}`);
  }
}

function resolveStartTarget(options: StartOptions) {
  const serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
  const uiPort = options.uiPort ?? DEFAULT_UI_PORT;
  const homeTarget = resolveLifecycleHomeTarget({ baseDir: options.baseDir });
  const projectHome = homeTarget.projectHome;
  const homeSource = options.homeSource ?? homeTarget.source;
  const instanceId =
    options.instanceId ||
    resolveLifecycleInstanceId({
      instanceName: options.instanceName,
      projectHome,
      serverPort,
      uiPort,
    });

  return {
    serverPort,
    uiPort,
    projectHome,
    homeSource,
    instanceId,
    statePath: getInstanceStatePath(instanceId),
  };
}

function resolveCleanTarget(options: CleanOptions) {
  const homeTarget = resolveLifecycleHomeTarget({
    baseDir: options.projectHome ?? options.baseDir,
  });
  const projectHome = homeTarget.projectHome;
  const homeSource = options.homeSource ?? homeTarget.source;
  const serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
  const uiPort = options.uiPort ?? DEFAULT_UI_PORT;
  const instanceId =
    options.instanceId ||
    resolveLifecycleInstanceId({
      instanceName: options.instanceName,
      projectHome,
      serverPort,
      uiPort,
    });

  return {
    projectHome,
    homeSource,
    isDefaultHome: homeTarget.isDefaultHome,
    serverPort,
    uiPort,
    instanceId,
  };
}

export function isRunning(selector: StopOptions = {}): boolean {
  const normalizedSelector = normalizeSelector(selector);
  return listRunningInstances().some((record) =>
    matchesSelector(record, normalizedSelector),
  );
}

interface BuildPaths {
  server: string;
  ui: string;
}

function resolveBuildPaths(instanceId: string): BuildPaths {
  if (instanceId === DEFAULT_INSTANCE_ID) {
    return { server: 'dist-server', ui: 'dist-ui' };
  }
  return {
    server: `dist-server-${instanceId}`,
    ui: `dist-ui-${instanceId}`,
  };
}

export function isInstalled(instanceId = DEFAULT_INSTANCE_ID): boolean {
  const { server, ui } = resolveBuildPaths(instanceId);
  return existsSync(join(CWD, server)) && existsSync(join(CWD, ui));
}

export function start(opts: StartOptions = {}): void {
  const { logFile, build, features } = opts;
  const { serverPort, uiPort, projectHome, homeSource, instanceId, statePath } =
    resolveStartTarget(opts);
  const normalizedSelector = normalizeSelector({ instanceId });
  const runningMatch = ensureSingleMatch(
    listRunningInstances().filter((record) =>
      matchesSelector(record, normalizedSelector),
    ),
    'start',
  );
  const buildPaths = resolveBuildPaths(instanceId);
  const needsBuild = Boolean(build) || !isInstalled(instanceId);

  if (needsBuild) {
    if (runningMatch) {
      stopRecord(runningMatch, false);
    }
    console.log('Building application...');
    const buildEnv = {
      ...process.env,
      STALLION_BUILD_SERVER_DIR: buildPaths.server,
      STALLION_BUILD_UI_DIR: buildPaths.ui,
    };
    execSync('npm run build:server', {
      cwd: CWD,
      stdio: 'inherit',
      env: buildEnv,
    });
    execSync('npm run build:ui', {
      cwd: CWD,
      stdio: 'inherit',
      env: buildEnv,
    });
    if (runningMatch) {
      notifyBuildUpdated(runningMatch.serverPort);
    }
  } else if (runningMatch) {
    console.log(
      `✓ Already running\n  UI:   http://localhost:${runningMatch.uiPort}\n  Stop: stallion stop --instance=${runningMatch.instanceId}`,
    );
    return;
  }

  announceHome(projectHome, homeSource);

  let serverStdio: any = 'ignore';
  if (logFile) {
    const fd = openSync(logFile, 'w');
    serverStdio = ['ignore', fd, fd];
  }

  const serverEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(serverPort),
    STALLION_AI_DIR: projectHome,
    STALLION_INSTANCE_ID: instanceId,
    STALLION_INSTANCE_STATE_PATH: statePath,
  };
  if (features) serverEnv.STALLION_FEATURES = features;

  const serverProc = spawn('node', [`${buildPaths.server}/index.js`], {
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
    const dir=path.join(process.cwd(),'${buildPaths.ui}');
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

  writeInstanceState({
    instanceId,
    serverPid: serverProc.pid ?? null,
    uiPid: uiProc.pid ?? null,
    serverPort,
    uiPort,
    baseDir: projectHome,
    homeSource,
    startedAt: new Date().toISOString(),
    cwd: CWD,
    statePath,
  });

  sleepSync(1000);
  try {
    process.kill(serverProc.pid!, 0);
    process.kill(uiProc.pid!, 0);
    console.log(`\n  ✓ Server: http://localhost:${serverPort}`);
    console.log(`  ✓ UI:     http://localhost:${uiPort}`);
    if (homeSource === '--temp-home') {
      console.log(`  ✓ Home:   ${projectHome}`);
    }
    console.log(`  ✓ Instance: ${instanceId}`);
    console.log(`\n  Stop with: stallion stop --instance=${instanceId}`);
  } catch {
    console.error(
      `Failed to start. Check that ports ${serverPort} and ${uiPort} are free.`,
    );
    stop({ instanceId });
    process.exit(1);
  }
}

export function stop(opts: StopOptions = {}): void {
  const normalizedSelector = normalizeSelector(opts);
  const matches = listRunningInstances().filter((record) =>
    matchesSelector(record, normalizedSelector),
  );
  const match = ensureSingleMatch(matches, 'stop');
  if (!match) return;
  stopRecord(match);
}

export { collectDoctorReport, doctor } from './lifecycle-doctor.js';

export function link(): void {
  createPathLink(CWD);
}

export function shortcut(): void {
  createAppShortcut(CWD);
}

export async function clean(
  forceOrOptions: boolean | CleanOptions = false,
): Promise<void> {
  const options =
    typeof forceOrOptions === 'boolean'
      ? { force: forceOrOptions }
      : forceOrOptions;
  const {
    projectHome,
    homeSource,
    isDefaultHome,
    instanceId,
    serverPort,
    uiPort,
  } = resolveCleanTarget(options);

  if (isDefaultHome && !options.allowDefaultHomeClean) {
    throw new Error(
      'Refusing to clean the default Stallion home. Use --temp-home for hermetic runs, or pass --allow-default-home-clean when you truly intend to delete ~/.stallion-ai.',
    );
  }

  assertNoSiblingConflicts(instanceId, options.actionLabel ?? 'clean');
  announceHome(projectHome, homeSource);

  if (!options.force) {
    console.log(`\n⚠️  This will delete ${projectHome} which includes:`);
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

  stop({ instanceId, serverPort, uiPort, baseDir: projectHome });
  rmSync(projectHome, { recursive: true, force: true });
  const buildPaths = resolveBuildPaths(instanceId);
  rmSync(join(CWD, buildPaths.server), { recursive: true, force: true });
  rmSync(join(CWD, buildPaths.ui), { recursive: true, force: true });
  console.log('  ✓ Cleaned');
}

export function upgrade(): void {
  const liveInstances = listRunningInstances();
  if (liveInstances.length > 1) {
    throw new Error(
      [
        'stallion upgrade is blocked because this checkout has multiple live Stallion instances sharing build artifacts.',
        'Stop the sibling instances first or rerun from a different checkout.',
        ...liveInstances.map((record) => `  - ${describeInstance(record)}`),
      ].join('\n'),
    );
  }
  if (liveInstances.length === 1) {
    stopRecord(liveInstances[0], false);
  }

  const { gitRoot, branch } = resolveGitInfo(CWD);

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
