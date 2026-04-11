import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { readPluginManifest } from '@stallion-ai/shared/parsers';

export const PROJECT_HOME =
  process.env.STALLION_AI_DIR || join(homedir(), '.stallion-ai');
export const PLUGINS_DIR = join(PROJECT_HOME, 'plugins');
export const AGENTS_DIR = join(PROJECT_HOME, 'agents');
export const CWD = process.cwd();
export const PIDFILE = join(CWD, '.stallion.pids');

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
