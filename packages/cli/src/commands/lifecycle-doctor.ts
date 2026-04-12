import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PROJECT_HOME } from './helpers.js';

type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  label: string;
  status: DoctorCheckStatus;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  recommendation: string;
  chatReady: boolean;
  runtimeReady: boolean;
}

interface DoctorDeps {
  exec: (command: string) => string | null;
  checkOllama: () => Promise<boolean>;
  readJson: <T>(path: string, fallback: T) => T;
  exists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
}

function execVersion(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

async function detectOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function doctorStatusSymbol(status: DoctorCheckStatus): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '⚠';
  return '✗';
}

export async function collectDoctorReport(
  deps: Partial<DoctorDeps> = {},
): Promise<DoctorReport> {
  const runtimeDeps: DoctorDeps = {
    exec: (command) => execVersion(command),
    checkOllama: detectOllama,
    readJson: readJsonFile,
    exists: existsSync,
    env: process.env,
    ...deps,
  };

  const appConfigPath = join(PROJECT_HOME, 'config', 'app.json');
  const providersPath = join(PROJECT_HOME, 'config', 'providers.json');
  const awsCredentialsPath = join(homedir(), '.aws', 'credentials');
  const awsConfigPath = join(homedir(), '.aws', 'config');

  const nodeVersion = runtimeDeps.exec('node -v');
  const npmVersion = runtimeDeps.exec('npm -v');
  const gitVersion = runtimeDeps.exec('git --version');
  const tsxVersion = runtimeDeps.exec('tsx --version');
  const rustVersion = runtimeDeps.exec('rustc --version');
  const codexVersion = runtimeDeps.exec('codex --version');
  const claudeVersion = runtimeDeps.exec('claude --version');
  const kiroVersion = runtimeDeps.exec('kiro-cli --version');
  const ollamaReachable = await runtimeDeps.checkOllama();

  const appConfig = runtimeDeps.readJson<Record<string, unknown>>(
    appConfigPath,
    {},
  );
  const providers = runtimeDeps.readJson<Array<Record<string, unknown>>>(
    providersPath,
    [],
  );
  const enabledLlmProviders = providers.filter(
    (provider) =>
      provider.enabled !== false &&
      Array.isArray(provider.capabilities) &&
      provider.capabilities.includes('llm'),
  );
  const runtimeConnections = (appConfig.runtimeConnections ?? {}) as Record<
    string,
    { enabled?: boolean }
  >;
  const enabledRuntimeConnections = Object.entries(runtimeConnections).filter(
    ([, settings]) => settings?.enabled !== false,
  );
  const awsConfigured = Boolean(
    runtimeDeps.env.AWS_ACCESS_KEY_ID ||
      runtimeDeps.env.AWS_PROFILE ||
      runtimeDeps.exists(awsCredentialsPath) ||
      runtimeDeps.exists(awsConfigPath),
  );

  const checks: DoctorCheck[] = [
    {
      label: 'Node.js',
      status:
        nodeVersion && parseInt(nodeVersion.slice(1), 10) >= 20
          ? 'pass'
          : 'fail',
      detail: nodeVersion ?? 'Not found',
    },
    {
      label: 'npm',
      status: npmVersion ? 'pass' : 'fail',
      detail: npmVersion ?? 'Not found',
    },
    {
      label: 'git',
      status: gitVersion ? 'pass' : 'fail',
      detail: gitVersion ?? 'Not found',
    },
    {
      label: 'tsx',
      status: tsxVersion ? 'pass' : 'fail',
      detail: tsxVersion ?? 'Not found',
    },
    {
      label: 'Rust',
      status: rustVersion ? 'pass' : 'warn',
      detail:
        rustVersion?.split(' ')[1] ??
        'Not installed (desktop builds unavailable)',
    },
    {
      label: 'App config',
      status: runtimeDeps.exists(appConfigPath) ? 'pass' : 'warn',
      detail: runtimeDeps.exists(appConfigPath)
        ? appConfigPath
        : 'No app config yet; it will be created on first start.',
    },
    {
      label: 'Configured chat providers',
      status: enabledLlmProviders.length > 0 ? 'pass' : 'warn',
      detail:
        enabledLlmProviders.length > 0
          ? `${enabledLlmProviders.length} enabled chat-capable connection(s)`
          : 'No enabled chat-capable provider connection saved yet.',
    },
    {
      label: 'Ollama',
      status: ollamaReachable ? 'pass' : 'warn',
      detail: ollamaReachable
        ? 'Reachable at http://127.0.0.1:11434'
        : 'Local Ollama server not detected.',
    },
    {
      label: 'Bedrock credentials',
      status: awsConfigured ? 'pass' : 'warn',
      detail: awsConfigured
        ? 'AWS credential sources detected.'
        : 'No AWS credential source detected.',
    },
    {
      label: 'Codex CLI',
      status: codexVersion ? 'pass' : 'warn',
      detail: codexVersion ?? 'Not found',
    },
    {
      label: 'Claude CLI',
      status: claudeVersion ? 'pass' : 'warn',
      detail: claudeVersion ?? 'Not found',
    },
    {
      label: 'ACP / external runtime',
      status:
        kiroVersion || enabledRuntimeConnections.some(([id]) => id === 'acp')
          ? 'pass'
          : 'warn',
      detail:
        kiroVersion ??
        (enabledRuntimeConnections.some(([id]) => id === 'acp')
          ? 'ACP runtime connection configured.'
          : 'No ACP runtime detected.'),
    },
  ];

  const chatReady =
    enabledLlmProviders.length > 0 || ollamaReachable || awsConfigured;
  const runtimeReady =
    awsConfigured ||
    Boolean(codexVersion) ||
    Boolean(claudeVersion) ||
    enabledRuntimeConnections.length > 0;
  const recommendation =
    enabledLlmProviders.length > 0
      ? 'Chat looks reachable. Review Connections if you want to change the default path.'
      : ollamaReachable
        ? 'Ollama is reachable, but no saved model connection exists yet. Add an Ollama connection in Connections.'
        : awsConfigured
          ? 'AWS credentials are available. Add or enable a Bedrock model connection in Connections.'
          : 'No chat-capable path is ready yet. Start Ollama locally or add a provider connection first.';

  return {
    checks,
    recommendation,
    chatReady,
    runtimeReady,
  };
}

export async function doctor(): Promise<void> {
  console.log('Checking prerequisites and runtime readiness...\n');
  const report = await collectDoctorReport();

  for (const check of report.checks) {
    console.log(
      `  ${doctorStatusSymbol(check.status)} ${check.label} — ${check.detail}`,
    );
  }

  console.log(
    `\n  Chat readiness: ${report.chatReady ? 'ready' : 'setup needed'}`,
  );
  console.log(
    `  Runtime readiness: ${report.runtimeReady ? 'ready' : 'setup needed'}`,
  );
  console.log(`\n  Next: ${report.recommendation}`);

  if (report.checks.some((check) => check.status === 'fail')) {
    console.log('\nMissing required prerequisites.');
    process.exit(1);
  }

  if (!report.chatReady || !report.runtimeReady) {
    console.log(
      '\nEnvironment is usable but not fully ready for first-run AI workflows.',
    );
    process.exit(1);
  }

  console.log('\n  All good!');
}
