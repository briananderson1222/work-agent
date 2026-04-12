import { existsSync, watch as fsWatch, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';

interface WatchSourceChangesContext {
  cwd: string;
  onRebuild: (filename: string) => Promise<void>;
}

interface WatchConfigChangesContext {
  cwd: string;
  manifest: PluginManifest;
  layoutPath: string | null;
  onReload: (label: string) => void;
}

export function watchSourceChanges({
  cwd,
  onRebuild,
}: WatchSourceChangesContext) {
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  const srcDir = join(cwd, 'src');
  if (!existsSync(srcDir)) {
    return;
  }

  fsWatch(srcDir, { recursive: true }, (_event, filename) => {
    if (!filename || filename.startsWith('.')) {
      return;
    }
    if (!['.ts', '.tsx', '.js', '.jsx', '.css'].includes(extname(filename))) {
      return;
    }
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }
    rebuildTimer = setTimeout(async () => {
      await onRebuild(filename);
    }, 200);
  });
}

export function getConfigWatchTargets(
  cwd: string,
  manifest: PluginManifest,
  layoutPath: string | null,
) {
  const configDirs: string[] = [];
  if (layoutPath) {
    configDirs.push(layoutPath);
  }
  if (manifest.prompts?.source) {
    const promptsDir = join(cwd, manifest.prompts.source);
    if (existsSync(promptsDir)) {
      configDirs.push(promptsDir);
    }
  }
  for (const agent of manifest.agents || []) {
    const agentPath = join(cwd, agent.source);
    if (existsSync(agentPath)) {
      configDirs.push(agentPath);
    }
  }
  return configDirs;
}

export function watchConfigChanges({
  cwd,
  manifest,
  layoutPath,
  onReload,
}: WatchConfigChangesContext) {
  let configTimer: ReturnType<typeof setTimeout> | null = null;
  const configDirs = getConfigWatchTargets(cwd, manifest, layoutPath);

  for (const target of configDirs) {
    const isDir = existsSync(target) && statSync(target).isDirectory();
    fsWatch(target, isDir ? { recursive: true } : {}, (_event, filename) => {
      if (configTimer) {
        clearTimeout(configTimer);
      }
      configTimer = setTimeout(() => {
        onReload(filename || target.replace(`${cwd}/`, ''));
      }, 200);
    });
  }

  return configDirs;
}
