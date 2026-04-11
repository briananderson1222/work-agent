import { execFile as execFileCb } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { copyPluginIntegrations } from '@stallion-ai/shared/parsers';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { Hono } from 'hono';
import {
  getAgentRegistryProvider,
  getIntegrationRegistryProvider,
} from '../providers/registry.js';
import {
  getPermissionTier,
  getPluginGrants,
  processInstallPermissions,
} from '../services/plugin-permissions.js';
import { pluginInstalls } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import {
  errorMessage,
  getBody,
  pluginInstallSchema,
  pluginPreviewSchema,
  validate,
} from './schemas.js';
import { buildPlugin } from './plugin-bundles.js';
import { loadPluginProviders } from './plugin-loader.js';
import {
  detectPluginConflicts,
  fetchPluginSource,
  getPluginGitInfo,
  installPluginDependency,
  resolvePluginDependencies,
} from './plugin-source.js';

const execFile = promisify(execFileCb);

interface PluginInstallRouteDeps {
  agentsDir: string;
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
  logger: Logger;
  pluginsDir: string;
  projectHomeDir: string;
}

export function registerPluginInstallRoutes(
  app: Hono,
  deps: PluginInstallRouteDeps,
): void {
  const { agentsDir, eventBus, logger, pluginsDir, projectHomeDir } = deps;

  app.get('/', async (c) => {
    if (!existsSync(pluginsDir)) return c.json({ plugins: [] });

    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(pluginsDir, entry.name, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(
          await readFile(manifestPath, 'utf-8'),
        ) as PluginManifest;
        const bundlePath = join(pluginsDir, entry.name, 'dist', 'bundle.js');
        const pluginDir = join(pluginsDir, entry.name);
        const git = await getPluginGitInfo(pluginDir, logger);
        const declared = manifest.permissions || [];
        const granted = getPluginGrants(projectHomeDir, manifest.name);
        const missing = declared
          .filter((permission: string) => !granted.includes(permission))
          .map((permission: string) => ({
            permission,
            tier: getPermissionTier(permission),
          }));

        plugins.push({
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          description: manifest.description,
          hasBundle: existsSync(bundlePath),
          hasSettings:
            Array.isArray(manifest.settings) && manifest.settings.length > 0,
          layout: manifest.layout,
          agents: manifest.agents,
          providers: manifest.providers,
          links: manifest.links,
          git,
          permissions: { declared, granted, missing },
        });
      } catch (error: unknown) {
        logger.error('Failed to read plugin manifest', {
          plugin: entry.name,
          error: errorMessage(error),
        });
      }
    }

    return c.json({ plugins });
  });

  app.post('/preview', validate(pluginPreviewSchema), async (c) => {
    try {
      const { source } = getBody(c);
      if (!source) {
        return c.json(
          {
            valid: false,
            error: 'source is required',
            components: [],
            conflicts: [],
          },
          400,
        );
      }

      const result = await fetchPluginSource(source, pluginsDir, logger);
      if ('error' in result) {
        return c.json({
          valid: false,
          error: result.error,
          components: [],
          conflicts: [],
        });
      }

      const { tempDir } = result;
      try {
        const manifest = JSON.parse(
          await readFile(join(tempDir, 'plugin.json'), 'utf-8'),
        ) as PluginManifest;
        const conflicts = detectPluginConflicts(
          manifest,
          agentsDir,
          pluginsDir,
          logger,
        );
        const components: Array<{
          type: string;
          id: string;
          detail?: string;
          conflict?: (typeof conflicts)[0];
        }> = [];

        for (const agent of manifest.agents || []) {
          const slug = `${manifest.name}:${agent.slug}`;
          const conflict = conflicts.find(
            (entry) => entry.type === 'agent' && entry.id === slug,
          );
          components.push({
            type: 'agent',
            id: slug,
            detail: agent.source,
            conflict,
          });
        }

        if (manifest.layout) {
          const conflict = conflicts.find(
            (entry) =>
              entry.type === 'layout' && entry.id === manifest.layout?.slug,
          );
          components.push({
            type: 'layout',
            id: manifest.layout.slug,
            detail: manifest.layout.source,
            conflict,
          });
        }

        for (const provider of manifest.providers || []) {
          components.push({
            type: 'provider',
            id: provider.type,
            detail: provider.module,
          });
        }

        for (const toolId of manifest.integrations?.required || []) {
          const installed = existsSync(
            join(projectHomeDir, 'integrations', toolId, 'integration.json'),
          );
          components.push({
            type: 'tool',
            id: toolId,
            detail: installed ? 'already installed' : 'will install',
          });
        }

        const dependencies = await resolvePluginDependencies(
          manifest,
          pluginsDir,
          getAgentRegistryProvider,
          logger,
        );
        const git = await getPluginGitInfo(tempDir, logger);

        return c.json({
          valid: true,
          manifest,
          components,
          conflicts,
          dependencies,
          git,
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error: unknown) {
      return c.json(
        {
          valid: false,
          error: errorMessage(error),
          components: [],
          conflicts: [],
        },
        500,
      );
    }
  });

  app.post('/install', validate(pluginInstallSchema), async (c) => {
    try {
      const { source, skip } = getBody(c);
      const skipSet = new Set<string>(skip || []);

      const result = await fetchPluginSource(source, pluginsDir, logger);
      if ('error' in result) {
        return c.json({ success: false, error: result.error }, 400);
      }

      const { tempDir, tempName } = result;
      const manifest = JSON.parse(
        await readFile(join(tempDir, 'plugin.json'), 'utf-8'),
      ) as PluginManifest;
      const pluginName = manifest.name || tempName;
      const pluginDir = join(pluginsDir, pluginName);

      const dependencyResults: Array<{
        id: string;
        status: string;
        error?: string;
      }> = [];
      for (const dependency of manifest.dependencies || []) {
        const dependencyResult = await installPluginDependency(
          dependency,
          pluginsDir,
          getAgentRegistryProvider,
          (dir, name) => buildPlugin(dir, name, logger),
          logger,
        );
        dependencyResults.push({
          id: dependency.id,
          status: dependencyResult.success ? 'installed' : 'failed',
          error: dependencyResult.error,
        });
      }

      if (existsSync(pluginDir) && pluginDir !== tempDir) {
        rmSync(pluginDir, { recursive: true });
      }
      if (tempDir !== pluginDir) {
        cpSync(tempDir, pluginDir, { recursive: true });
        rmSync(tempDir, { recursive: true });
      }

      if (manifest.agents) {
        mkdirSync(agentsDir, { recursive: true });
        for (const agent of manifest.agents) {
          const slug = `${manifest.name}:${agent.slug}`;
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
        const { scanPromptDir } = await import('../services/prompt-scanner.js');
        const promptsDir = join(pluginDir, manifest.prompts.source);
        const scanned = scanPromptDir(promptsDir, pluginName);
        if (scanned.length > 0) {
          const { PromptService } = await import(
            '../services/prompt-service.js'
          );
          new PromptService().registerPluginPrompts(scanned);
          logger.info(`Registered ${scanned.length} prompts from ${pluginName}`);
        }
      }

      await buildPlugin(pluginDir, pluginName, logger);

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
            manifest.name,
            { ...manifest, providers: activeProviders },
            logger,
          );
        }
      }

      const toolsDir = join(projectHomeDir, 'integrations');
      const requiredTools = (manifest.integrations?.required || []).filter(
        (toolId: string) => !skipSet.has(`tool:${toolId}`),
      );
      const toolResults: Array<{
        id: string;
        status: 'installed' | 'missing' | 'installed-now';
      }> = [];

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

      const { autoGranted, pendingConsent } = processInstallPermissions(
        projectHomeDir,
        pluginName,
        manifest.permissions || [],
      );

      eventBus?.emit('plugins:installed', {
        name: pluginName,
        agents:
          manifest.agents?.map((agent) => `${pluginName}:${agent.slug}`) || [],
      });
      pluginInstalls.add(1, { plugin: pluginName });

      return c.json({
        success: true,
        plugin: {
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          hasBundle: existsSync(join(pluginDir, 'dist', 'bundle.js')),
          agents: (manifest.agents || []).map((agent) => ({
            slug: `${manifest.name}:${agent.slug}`,
          })),
        },
        layout: installedLayoutSlug ? { slug: installedLayoutSlug } : undefined,
        tools: toolResults,
        dependencies: dependencyResults,
        permissions: { autoGranted, pendingConsent },
      });
    } catch (error: unknown) {
      logger.error('Plugin install failed', { error: errorMessage(error) });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });
}
