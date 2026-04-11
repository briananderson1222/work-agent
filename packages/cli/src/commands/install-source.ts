import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { isGitUrl, parseGitSource } from './helpers.js';

export function preparePluginSource(
  source: string,
  pluginDir: string,
  stdio: 'pipe' | 'inherit',
): void {
  if (existsSync(pluginDir)) rmSync(pluginDir, { recursive: true, force: true });

  if (isGitUrl(source)) {
    const { url, branch } = parseGitSource(source);
    mkdirSync(pluginDir, { recursive: true });
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${url} ${pluginDir}`, {
        stdio,
      });
      return;
    } catch {
      rmSync(pluginDir, { recursive: true, force: true });
      mkdirSync(pluginDir, { recursive: true });
      execSync(`git clone --depth 1 ${url} ${pluginDir}`, { stdio });
      return;
    }
  }

  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }
  mkdirSync(pluginDir, { recursive: true });
  cpSync(sourcePath, pluginDir, { recursive: true });
}

export function installPluginPackageDependencies(pluginDir: string): void {
  if (!existsSync(`${pluginDir}/package.json`)) return;

  try {
    execSync('npm install --production --ignore-scripts', {
      cwd: pluginDir,
      stdio: 'pipe',
    });
  } catch {}
}

export function canonicalizePluginDirectory(
  pluginDir: string,
  canonicalDir: string,
): string {
  if (pluginDir === canonicalDir) {
    return canonicalDir;
  }

  if (existsSync(canonicalDir)) rmSync(canonicalDir, { recursive: true });
  cpSync(pluginDir, canonicalDir, { recursive: true });
  rmSync(pluginDir, { recursive: true });
  return canonicalDir;
}
