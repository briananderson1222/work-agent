import { execFile as execFileCb } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type { IAgentRegistryProvider } from '../providers/provider-interfaces.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage } from './schemas.js';

const execFile = promisify(execFileCb);

export interface PluginGitInfo {
  hash: string;
  branch: string;
  remote?: string;
}

export interface PluginConflict {
  type: string;
  id: string;
  existingSource?: string;
}

export interface ResolvedPluginDependency {
  id: string;
  source?: string;
  status: 'installed' | 'will-install' | 'missing';
  components?: Array<{ type: string; id: string }>;
  git?: PluginGitInfo;
}

export function extractPluginName(source: string): string {
  if (
    source.startsWith('git@') ||
    source.includes('.git') ||
    source.startsWith('https://')
  ) {
    const match = source.split('#')[0].match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  }
  return source.split('/').pop() || 'unknown';
}

export async function getPluginGitInfo(
  dir: string,
  logger: Logger,
): Promise<PluginGitInfo | undefined> {
  if (!existsSync(join(dir, '.git'))) return undefined;
  try {
    const { stdout: hash } = await execFile(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      { cwd: dir, encoding: 'utf-8', windowsHide: true },
    );
    const { stdout: branch } = await execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: dir, encoding: 'utf-8', windowsHide: true },
    );
    let remote: string | undefined;
    try {
      const { stdout } = await execFile(
        'git',
        ['remote', 'get-url', 'origin'],
        { cwd: dir, encoding: 'utf-8', windowsHide: true },
      );
      remote = stdout.trim();
    } catch (error) {
      logger.debug('Failed to get git remote URL for plugin', { error });
    }
    return { hash: hash.trim(), branch: branch.trim(), remote };
  } catch (error) {
    logger.debug('Failed to get git info for plugin', { error });
    return undefined;
  }
}

export async function fetchPluginSource(
  source: string,
  pluginsDir: string,
  logger: Logger,
): Promise<{ tempDir: string; tempName: string } | { error: string }> {
  const isGit =
    source.startsWith('git@') ||
    source.endsWith('.git') ||
    (source.startsWith('https://') &&
      (source.includes('.git') ||
        source.includes('gitlab') ||
        source.includes('github')));

  const tempName = extractPluginName(source);
  const tempDir = join(pluginsDir, `.preview-${tempName}`);

  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  if (isGit) {
    const [url, branch] = source.split('#');
    const cloneArgs = ['clone', '--depth', '1'];
    if (branch) cloneArgs.push('--branch', branch);
    cloneArgs.push(url, tempDir);
    try {
      await execFile('git', cloneArgs, { timeout: 30000, windowsHide: true });
    } catch (error) {
      logger.debug('Failed to clone with branch, retrying without', { error });
      rmSync(tempDir, { recursive: true, force: true });
      mkdirSync(tempDir, { recursive: true });
      try {
        await execFile('git', ['clone', '--depth', '1', url, tempDir], {
          timeout: 30000,
          windowsHide: true,
        });
      } catch (cloneError: unknown) {
        rmSync(tempDir, { recursive: true, force: true });
        return { error: `Failed to clone: ${errorMessage(cloneError)}` };
      }
    }
  } else {
    if (!existsSync(source)) {
      rmSync(tempDir, { recursive: true });
      return { error: `Source not found: ${source}` };
    }
    if (!existsSync(join(source, 'plugin.json'))) {
      rmSync(tempDir, { recursive: true });
      return { error: 'Not a valid plugin: plugin.json not found' };
    }
    cpSync(source, tempDir, { recursive: true });
  }

  if (!existsSync(join(tempDir, 'plugin.json'))) {
    rmSync(tempDir, { recursive: true, force: true });
    return { error: 'Not a valid plugin: plugin.json not found' };
  }

  return { tempDir, tempName };
}

export function detectPluginConflicts(
  manifest: PluginManifest,
  agentsDir: string,
  pluginsDir: string,
  logger: Logger,
): PluginConflict[] {
  const conflicts: PluginConflict[] = [];

  for (const agent of manifest.agents || []) {
    const slug = `${manifest.name}:${agent.slug}`;
    if (existsSync(join(agentsDir, slug, 'agent.json'))) {
      conflicts.push({
        type: 'agent',
        id: slug,
        existingSource: 'installed',
      });
    }
  }

  if (!manifest.layout) return conflicts;

  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const installedManifest = JSON.parse(
        readFileSync(join(pluginsDir, entry.name, 'plugin.json'), 'utf-8'),
      ) as PluginManifest;
      if (
        installedManifest.name !== manifest.name &&
        installedManifest.layout?.slug === manifest.layout.slug
      ) {
        conflicts.push({
          type: 'layout',
          id: manifest.layout.slug,
          existingSource: installedManifest.name,
        });
      }
    } catch (error) {
      logger.debug('Failed to inspect installed plugin for layout conflict', {
        plugin: entry.name,
        error,
      });
    }
  }

  return conflicts;
}

export async function resolvePluginDependencies(
  manifest: PluginManifest,
  pluginsDir: string,
  getAgentRegistryProvider: () => IAgentRegistryProvider,
  logger: Logger,
  seen: Set<string> = new Set(),
): Promise<ResolvedPluginDependency[]> {
  const dependencies: ResolvedPluginDependency[] = [];
  if (!manifest.dependencies?.length) return dependencies;

  for (const dependency of manifest.dependencies) {
    if (seen.has(dependency.id)) continue;
    seen.add(dependency.id);

    let depManifest: PluginManifest | null = null;
    let depGit: PluginGitInfo | undefined;
    let status: ResolvedPluginDependency['status'] = 'missing';

    const dependencyDir = join(pluginsDir, dependency.id);
    if (existsSync(join(dependencyDir, 'plugin.json'))) {
      status = 'installed';
      try {
        depManifest = JSON.parse(
          readFileSync(join(dependencyDir, 'plugin.json'), 'utf-8'),
        );
      } catch (error) {
        logger.debug('Failed to read installed dependency manifest', {
          dep: dependency.id,
          error,
        });
      }
      depGit = await getPluginGitInfo(dependencyDir, logger);
    } else if (dependency.source) {
      status = 'will-install';
      const result = await fetchPluginSource(dependency.source, pluginsDir, logger);
      if (!('error' in result)) {
        try {
          depManifest = JSON.parse(
            readFileSync(join(result.tempDir, 'plugin.json'), 'utf-8'),
          );
        } catch (error) {
          logger.debug('Failed to read fetched dependency manifest', {
            dep: dependency.id,
            error,
          });
        }
        depGit = await getPluginGitInfo(result.tempDir, logger);
        rmSync(result.tempDir, { recursive: true, force: true });
      }
    } else {
      try {
        const available = await getAgentRegistryProvider().listAvailable();
        if (available.find((entry) => entry.id === dependency.id)) {
          status = 'will-install';
        }
      } catch (error) {
        logger.debug('Failed to check registry for dependency', {
          dep: dependency.id,
          error,
        });
      }
    }

    const components: Array<{ type: string; id: string }> = [];
    if (depManifest) {
      for (const agent of depManifest.agents || []) {
        components.push({
          type: 'agent',
          id: `${depManifest.name}:${agent.slug}`,
        });
      }
      if (depManifest.layout) {
        components.push({ type: 'layout', id: depManifest.layout.slug });
      }
      for (const provider of depManifest.providers || []) {
        components.push({ type: 'provider', id: provider.type });
      }
    }

    dependencies.push({
      id: dependency.id,
      source: dependency.source,
      status,
      components: components.length ? components : undefined,
      git: depGit,
    });

    if (depManifest) {
      dependencies.push(
        ...(await resolvePluginDependencies(
          depManifest,
          pluginsDir,
          getAgentRegistryProvider,
          logger,
          seen,
        )),
      );
    }
  }

  return dependencies;
}

export async function installPluginDependency(
  dependency: { id: string; source?: string },
  pluginsDir: string,
  getAgentRegistryProvider: () => IAgentRegistryProvider,
  buildPlugin: (pluginDir: string, name: string) => Promise<void>,
  logger: Logger,
): Promise<{ success: boolean; error?: string }> {
  if (existsSync(join(pluginsDir, dependency.id, 'plugin.json'))) {
    return { success: true };
  }

  if (dependency.source) {
    const result = await fetchPluginSource(dependency.source, pluginsDir, logger);
    if ('error' in result) return { success: false, error: result.error };
    const { tempDir } = result;
    const targetDir = join(pluginsDir, dependency.id);
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
    cpSync(tempDir, targetDir, { recursive: true });
    rmSync(tempDir, { recursive: true, force: true });
    await buildPlugin(targetDir, dependency.id);
    try {
      const depManifest = JSON.parse(
        readFileSync(join(targetDir, 'plugin.json'), 'utf-8'),
      ) as PluginManifest;
      for (const transitive of depManifest.dependencies || []) {
        await installPluginDependency(
          transitive,
          pluginsDir,
          getAgentRegistryProvider,
          buildPlugin,
          logger,
        );
      }
    } catch (error) {
      logger.debug(
        'Failed to read transitive dependencies after source install',
        { dep: dependency.id, error },
      );
    }
    return { success: true };
  }

  try {
    const registryResult = await getAgentRegistryProvider().install(dependency.id);
    if (!registryResult.success) {
      return { success: false, error: registryResult.message };
    }
    const dependencyDir = join(pluginsDir, dependency.id);
    if (existsSync(join(dependencyDir, 'plugin.json'))) {
      try {
        const depManifest = JSON.parse(
          readFileSync(join(dependencyDir, 'plugin.json'), 'utf-8'),
        ) as PluginManifest;
        for (const transitive of depManifest.dependencies || []) {
          await installPluginDependency(
            transitive,
            pluginsDir,
            getAgentRegistryProvider,
            buildPlugin,
            logger,
          );
        }
      } catch (error) {
        logger.debug(
          'Failed to read transitive dependencies after registry install',
          { dep: dependency.id, error },
        );
      }
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}
