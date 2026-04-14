import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { readPluginManifest } from '@stallion-ai/shared/parsers';

export const DEFAULT_SERVER_PORT = 3141;
export const DEFAULT_UI_PORT = 3000;
export const DEFAULT_INSTANCE_ID = 'default';
export const DEFAULT_PROJECT_HOME = join(homedir(), '.stallion-ai');
export const PROJECT_HOME = resolve(
  process.env.STALLION_AI_DIR || DEFAULT_PROJECT_HOME,
);
export const PLUGINS_DIR = join(PROJECT_HOME, 'plugins');
export const AGENTS_DIR = join(PROJECT_HOME, 'agents');
export const CWD = process.cwd();
export const PIDFILE = join(CWD, '.stallion.pids');
export const INSTANCE_STATE_DIR = join(CWD, '.stallion', 'instances');

export type LifecycleHomeSource = 'env' | '--base' | '--temp-home' | 'default';

export interface LifecycleHomeTarget {
  projectHome: string;
  isDefaultHome: boolean;
  source: LifecycleHomeSource;
}

export interface LifecycleHomeOptions {
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  tempHome?: boolean;
}

export interface LifecycleInstanceIdentityOptions {
  cwd?: string;
  instanceName?: string;
  projectHome?: string;
  serverPort?: number;
  uiPort?: number;
}

export function getDefaultProjectHome(): string {
  return DEFAULT_PROJECT_HOME;
}

export function normalizeHomePath(path: string): string {
  return resolve(path);
}

export function resolveLifecycleHomeTarget(
  options: LifecycleHomeOptions = {},
): LifecycleHomeTarget {
  const env = options.env ?? process.env;

  if (options.tempHome) {
    const projectHome = mkdtempSync(join(tmpdir(), 'stallion-dev-home-'));
    return {
      projectHome,
      isDefaultHome: false,
      source: '--temp-home',
    };
  }

  if (options.baseDir) {
    const projectHome = normalizeHomePath(options.baseDir);
    return {
      projectHome,
      isDefaultHome: projectHome === DEFAULT_PROJECT_HOME,
      source: '--base',
    };
  }

  if (env.STALLION_AI_DIR) {
    const projectHome = normalizeHomePath(env.STALLION_AI_DIR);
    return {
      projectHome,
      isDefaultHome: projectHome === DEFAULT_PROJECT_HOME,
      source: 'env',
    };
  }

  return {
    projectHome: DEFAULT_PROJECT_HOME,
    isDefaultHome: true,
    source: 'default',
  };
}

export function normalizeInstanceName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || DEFAULT_INSTANCE_ID;
}

export function resolveLifecycleInstanceId(
  options: LifecycleInstanceIdentityOptions = {},
): string {
  if (options.instanceName?.trim()) {
    return normalizeInstanceName(options.instanceName);
  }

  const projectHome = normalizeHomePath(
    options.projectHome || DEFAULT_PROJECT_HOME,
  );
  const serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
  const uiPort = options.uiPort ?? DEFAULT_UI_PORT;

  if (
    projectHome === DEFAULT_PROJECT_HOME &&
    serverPort === DEFAULT_SERVER_PORT &&
    uiPort === DEFAULT_UI_PORT
  ) {
    return DEFAULT_INSTANCE_ID;
  }

  const hash = createHash('sha1')
    .update(
      JSON.stringify({
        cwd: options.cwd || CWD,
        projectHome,
        serverPort,
        uiPort,
      }),
    )
    .digest('hex')
    .slice(0, 12);

  return `instance-${hash}`;
}

export function getInstanceStatePath(instanceId: string, cwd = CWD): string {
  return join(cwd, '.stallion', 'instances', `${instanceId}.json`);
}

export function readManifest(dir = CWD): PluginManifest {
  return readPluginManifest(dir);
}

export function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.endsWith('.git') ||
    (source.startsWith('https://') &&
      (source.includes('.git') ||
        source.includes('gitlab') ||
        source.includes('github')))
  );
}

export function parseGitSource(source: string): {
  url: string;
  branch: string;
} {
  const [url, branch] = source.split('#');
  return { url, branch: branch || 'main' };
}

export function extractPluginName(source: string): string {
  if (isGitUrl(source)) {
    const { url } = parseGitSource(source);
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : url.split('/').pop()!.replace('.git', '');
  }
  return basename(source.replace(/\\/g, '/'));
}

/** Scan installed plugins for registry.json files and look up a dep by id */
export function lookupDepInRegistries(id: string): string | null {
  if (!existsSync(PLUGINS_DIR)) return null;
  for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(PLUGINS_DIR, entry.name, 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      for (const p of manifest.providers || []) {
        if (
          p.module?.endsWith('.json') &&
          (p.type === 'agentRegistry' || p.type === 'toolRegistry')
        ) {
          const regPath = join(PLUGINS_DIR, entry.name, p.module);
          if (!existsSync(regPath)) continue;
          const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
          const found = (reg.plugins || []).find((pl: any) => pl.id === id);
          if (found?.source) return found.source;
        }
      }
    } catch {}
  }
  return null;
}
