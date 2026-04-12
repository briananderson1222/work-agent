import { execFile as execFileCb } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RegistryItem } from '@stallion-ai/contracts/catalog';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { copyPluginIntegrations } from '@stallion-ai/shared/parsers';
import type { IPluginRegistryProvider } from '../providers/provider-interfaces.js';
import {
  getAgentRegistryProvider,
  getIntegrationRegistryProvider,
} from '../providers/registry.js';
import { ContextSafetyError } from '../services/context-safety.js';
import { readPluginManifestFile } from '../services/plugin-manifest-loader.js';
import { revokeAllGrants } from '../services/plugin-permissions.js';
import { scanPromptDirDetailed } from '../services/prompt-scanner.js';
import { pluginInstalls, pluginUninstalls } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import { loadPluginProviders } from './plugin-loader.js';
import { fetchPluginSource, installPluginDependency } from './plugin-source.js';
import { errorMessage } from './schemas.js';

const execFile = promisify(execFileCb);

export interface PluginLifecycleEventBus {
  emit: (event: string, data?: Record<string, unknown>) => void;
}

export interface PluginInstallSharedDeps {
  agentsDir: string;
  eventBus?: PluginLifecycleEventBus;
  logger: Logger;
  pluginsDir: string;
  projectHomeDir: string;
  buildPlugin: (pluginDir: string, name: string) => Promise<void>;
}

export interface InstalledPluginResult {
  success: true;
  plugin: {
    name: string;
    displayName?: string;
    version: string;
    hasBundle: boolean;
    agents: Array<{ slug: string }>;
  };
  layout?: { slug: string };
  tools: Array<{
    id: string;
    status: 'installed' | 'missing' | 'installed-now';
  }>;
  dependencies: Array<{
    id: string;
    status: string;
    error?: string;
  }>;
  permissions: {
    autoGranted: string[];
    pendingConsent: Array<{ permission: string; tier: string }>;
  };
}

const REGISTRY_INSTALLS_PATH = ['config', 'registry-installs.json'] as const;

function getRegistryInstallsPath(projectHomeDir: string): string {
  return join(projectHomeDir, ...REGISTRY_INSTALLS_PATH);
}

function readRegistryInstallAliases(
  projectHomeDir: string,
): Record<string, string> {
  const aliasesPath = getRegistryInstallsPath(projectHomeDir);
  if (!existsSync(aliasesPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(aliasesPath, 'utf-8')) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function writeRegistryInstallAliases(
  projectHomeDir: string,
  aliases: Record<string, string>,
): void {
  mkdirSync(join(projectHomeDir, 'config'), { recursive: true });
  writeFileSync(
    getRegistryInstallsPath(projectHomeDir),
    JSON.stringify(aliases, null, 2),
    'utf-8',
  );
}

function rememberRegistryInstall(
  projectHomeDir: string,
  registryId: string | undefined,
  pluginName: string,
): void {
  if (!registryId || registryId === pluginName) {
    return;
  }

  const aliases = readRegistryInstallAliases(projectHomeDir);
  aliases[registryId] = pluginName;
  writeRegistryInstallAliases(projectHomeDir, aliases);
}

function forgetRegistryInstallsForPlugin(
  projectHomeDir: string,
  pluginName: string,
  explicitRegistryId?: string,
): void {
  const aliases = readRegistryInstallAliases(projectHomeDir);
  let changed = false;

  for (const [registryId, installedPluginName] of Object.entries(aliases)) {
    if (
      registryId === explicitRegistryId ||
      registryId === pluginName ||
      installedPluginName === pluginName
    ) {
      delete aliases[registryId];
      changed = true;
    }
  }

  if (changed) {
    writeRegistryInstallAliases(projectHomeDir, aliases);
  }
}

function resolveInstalledPluginName(
  projectHomeDir: string,
  pluginsDir: string,
  pluginIdOrName: string,
): string | null {
  const directPath = join(pluginsDir, pluginIdOrName, 'plugin.json');
  if (existsSync(directPath)) {
    return pluginIdOrName;
  }

  const aliases = readRegistryInstallAliases(projectHomeDir);
  const aliasTarget = aliases[pluginIdOrName];
  if (aliasTarget && existsSync(join(pluginsDir, aliasTarget, 'plugin.json'))) {
    return aliasTarget;
  }

  return null;
}

async function readManifestForRemoval(
  manifestPath: string,
  fallbackName: string,
  logger: Logger,
): Promise<PluginManifest> {
  try {
    return await readPluginManifestFile(manifestPath);
  } catch (error) {
    if (!(error instanceof ContextSafetyError)) {
      throw error;
    }

    logger.warn('Unsafe plugin manifest encountered during uninstall', {
      manifestPath,
      findings: error.findings,
      source: error.source,
    });

    try {
      return JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
    } catch (parseError) {
      logger.warn('Failed to parse unsafe plugin manifest during uninstall', {
        manifestPath,
        error: errorMessage(parseError),
      });
      return {
        agents: [],
        name: fallbackName,
        version: 'unknown',
      } satisfies PluginManifest;
    }
  }
}

export async function installPluginFromSource(
  source: string,
  skip: string[] | undefined,
  deps: PluginInstallSharedDeps,
  options?: { registryId?: string },
): Promise<InstalledPluginResult> {
  const {
    agentsDir,
    buildPlugin,
    eventBus,
    logger,
    pluginsDir,
    projectHomeDir,
  } = deps;
  const skipSet = new Set<string>(skip || []);

  const result = await fetchPluginSource(source, pluginsDir, logger);
  if ('error' in result) {
    throw new Error(result.error);
  }

  const { tempDir, tempName } = result;
  try {
    const manifest = await readPluginManifestFile(join(tempDir, 'plugin.json'));
    const pluginName = manifest.name || tempName;
    const pluginDir = join(pluginsDir, pluginName);

    const dependencyResults: InstalledPluginResult['dependencies'] = [];
    for (const dependency of manifest.dependencies || []) {
      const dependencyResult = await installPluginDependency(
        dependency,
        pluginsDir,
        getAgentRegistryProvider,
        buildPlugin,
        logger,
      );
      dependencyResults.push({
        id: dependency.id,
        status: dependencyResult.success ? 'installed' : 'failed',
        error: dependencyResult.error,
      });
    }

    if (existsSync(pluginDir) && pluginDir !== tempDir) {
      rmSync(pluginDir, { recursive: true, force: true });
    }
    if (tempDir !== pluginDir) {
      cpSync(tempDir, pluginDir, { recursive: true });
    }

    if (manifest.agents) {
      mkdirSync(agentsDir, { recursive: true });
      for (const agent of manifest.agents) {
        const slug = `${pluginName}:${agent.slug}`;
        if (skipSet.has(`agent:${slug}`)) continue;
        const sourceDir = join(pluginDir, 'agents', agent.slug);
        if (existsSync(sourceDir)) {
          cpSync(sourceDir, join(agentsDir, slug), { recursive: true });
        }
      }
    }

    let installedLayoutSlug: string | null = null;
    if (manifest.layout && !skipSet.has(`layout:${manifest.layout.slug}`)) {
      const layoutSource = join(pluginDir, manifest.layout.source);
      if (existsSync(layoutSource)) {
        installedLayoutSlug = manifest.layout.slug;
      }
    }

    if (manifest.prompts?.source) {
      const promptsDir = join(pluginDir, manifest.prompts.source);
      const scanned = scanPromptDirDetailed(promptsDir, pluginName);
      if (scanned.blockedFiles.length > 0) {
        throw new ContextSafetyError({
          blocked: true,
          findings: scanned.blockedFiles.flatMap((entry) => entry.findings),
          source: `plugin '${pluginName}' prompt files`,
        });
      }
      if (scanned.prompts.length > 0) {
        const { PromptService } = await import('../services/prompt-service.js');
        new PromptService().registerPluginPrompts(scanned.prompts);
        logger.info(
          `Registered ${scanned.prompts.length} prompts from ${pluginName}`,
        );
      }
    }

    await buildPlugin(pluginDir, pluginName);

    const copiedIntegrations = copyPluginIntegrations(
      pluginDir,
      join(projectHomeDir, 'integrations'),
    );
    for (const integrationId of copiedIntegrations) {
      logger.info(`Copied tool config: ${integrationId}`);
    }

    for (const integrationId of copiedIntegrations) {
      try {
        const definitionPath = join(
          projectHomeDir,
          'integrations',
          integrationId,
          'integration.json',
        );
        if (!existsSync(definitionPath)) continue;
        const definition = JSON.parse(readFileSync(definitionPath, 'utf-8'));
        if (!definition.command) continue;

        try {
          await execFile(
            process.platform === 'win32' ? 'where' : 'which',
            [definition.command],
            { windowsHide: true },
          );
          continue;
        } catch (error) {
          logger.debug('Command not found, will attempt auto-install', {
            command: definition.command,
            error,
          });
        }

        const registry = getIntegrationRegistryProvider();
        if (registry.installByCommand) {
          const installResult = await registry.installByCommand(
            definition.command,
          );
          logger.info(
            `Auto-install ${definition.command}: ${installResult.success ? 'ok' : installResult.message}`,
          );
        }
      } catch (error: unknown) {
        logger.warn(`Failed to auto-install command for ${integrationId}`, {
          error: errorMessage(error),
        });
      }
    }

    if (manifest.providers) {
      const activeProviders = manifest.providers.filter(
        (provider) => !skipSet.has(`provider:${provider.type}`),
      );
      if (activeProviders.length > 0) {
        await loadPluginProviders(
          pluginsDir,
          pluginName,
          { ...manifest, providers: activeProviders },
          logger,
        );
      }
    }

    const toolsDir = join(projectHomeDir, 'integrations');
    const requiredTools = (manifest.integrations?.required || []).filter(
      (toolId: string) => !skipSet.has(`tool:${toolId}`),
    );
    const toolResults: InstalledPluginResult['tools'] = [];

    for (const toolId of requiredTools) {
      if (existsSync(join(toolsDir, toolId, 'integration.json'))) {
        toolResults.push({ id: toolId, status: 'installed' });
        continue;
      }

      try {
        const registry = getIntegrationRegistryProvider();
        const installResult = await registry.install(toolId);
        const toolDef = installResult.success
          ? await registry.getToolDef(toolId)
          : null;
        if (toolDef) {
          const toolDir = join(toolsDir, toolId);
          mkdirSync(toolDir, { recursive: true });
          writeFileSync(
            join(toolDir, 'integration.json'),
            JSON.stringify(toolDef, null, 2),
          );
        }
        toolResults.push({
          id: toolId,
          status: installResult.success ? 'installed-now' : 'missing',
        });
      } catch (error) {
        logger.debug('Failed to install required tool', { toolId, error });
        toolResults.push({ id: toolId, status: 'missing' });
      }
    }

    const { autoGranted, pendingConsent } = (
      await import('../services/plugin-permissions.js')
    ).processInstallPermissions(
      projectHomeDir,
      pluginName,
      manifest.permissions || [],
    );

    eventBus?.emit('plugins:installed', {
      name: pluginName,
      agents:
        manifest.agents?.map((agent) => `${pluginName}:${agent.slug}`) || [],
    });
    rememberRegistryInstall(projectHomeDir, options?.registryId, pluginName);
    pluginInstalls.add(1, { plugin: pluginName });

    return {
      success: true,
      plugin: {
        name: pluginName,
        displayName: manifest.displayName,
        version: manifest.version,
        hasBundle: existsSync(join(pluginDir, 'dist', 'bundle.js')),
        agents: (manifest.agents || []).map((agent) => ({
          slug: `${pluginName}:${agent.slug}`,
        })),
      },
      layout: installedLayoutSlug ? { slug: installedLayoutSlug } : undefined,
      tools: toolResults,
      dependencies: dependencyResults,
      permissions: { autoGranted, pendingConsent },
    };
  } finally {
    if (
      tempDir.startsWith(join(pluginsDir, '.preview-')) &&
      existsSync(tempDir)
    ) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export async function uninstallInstalledPlugin(
  name: string,
  deps: PluginInstallSharedDeps,
): Promise<{ success: true }> {
  const { agentsDir, eventBus, logger, pluginsDir, projectHomeDir } = deps;
  const installedPluginName =
    resolveInstalledPluginName(projectHomeDir, pluginsDir, name) || name;
  const pluginDir = join(pluginsDir, installedPluginName);

  if (!existsSync(pluginDir)) {
    throw new Error('Plugin not found');
  }

  const manifest = await readManifestForRemoval(
    join(pluginDir, 'plugin.json'),
    installedPluginName,
    logger,
  );

  if (manifest.agents) {
    for (const agent of manifest.agents) {
      const agentJson = join(
        agentsDir,
        `${manifest.name || name}:${agent.slug}`,
        'agent.json',
      );
      if (existsSync(agentJson)) {
        rmSync(agentJson, { force: true });
      }
    }
  }

  revokeAllGrants(projectHomeDir, manifest.name || name);
  rmSync(pluginDir, { recursive: true, force: true });
  forgetRegistryInstallsForPlugin(
    projectHomeDir,
    manifest.name || installedPluginName,
    name,
  );
  eventBus?.emit('plugins:removed', { name: manifest.name || name });
  pluginUninstalls.add(1, { plugin: manifest.name || name });
  logger.info('Plugin removed', { plugin: manifest.name || name });
  return { success: true };
}

export async function resolvePluginRegistrySource(
  id: string,
): Promise<string | null> {
  const entries = (
    await import('../providers/registry.js')
  ).getPluginRegistryProviders() as Array<{
    provider: IPluginRegistryProvider & {
      resolveSource?: (pluginId: string) => Promise<string | null>;
      listAvailable?: () => Promise<RegistryItem[]>;
    };
  }>;

  for (const entry of entries) {
    if (entry.provider.resolveSource) {
      const resolved = await entry.provider.resolveSource(id);
      if (resolved) return resolved;
    }
    if (entry.provider.listAvailable) {
      const items = await entry.provider.listAvailable();
      const match = items.find((item) => item.id === id);
      if (match?.source) return match.source;
    }
  }

  return null;
}

export async function readRegistryPluginAvailability() {
  const entries = (
    await import('../providers/registry.js')
  ).getPluginRegistryProviders();

  const [availableGroups, installedGroups] = await Promise.all([
    Promise.all(
      entries.map(async (entry) => {
        const items = await entry.provider.listAvailable();
        return items.map((item) => ({ ...item, source: entry.source }));
      }),
    ),
    Promise.all(entries.map(async (entry) => entry.provider.listInstalled())),
  ]);

  const installedIds = new Set(
    installedGroups.flat().map((item) => String(item.id)),
  );

  return availableGroups.flat().map((item) => ({
    ...item,
    installed: installedIds.has(String(item.id)),
  }));
}
