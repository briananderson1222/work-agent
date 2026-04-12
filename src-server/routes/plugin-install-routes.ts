import { existsSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getAgentRegistryProvider } from '../providers/registry.js';
import { isContextSafetyError } from '../services/context-safety.js';
import { readPluginManifestFile } from '../services/plugin-manifest-loader.js';
import {
  getPermissionTier,
  getPluginGrants,
} from '../services/plugin-permissions.js';
import { scanPromptDirDetailed } from '../services/prompt-scanner.js';
import type { Logger } from '../utils/logger.js';
import { buildPlugin } from './plugin-bundles.js';
import { installPluginFromSource } from './plugin-install-shared.js';
import {
  detectPluginConflicts,
  fetchPluginSource,
  getPluginGitInfo,
  resolvePluginDependencies,
} from './plugin-source.js';
import {
  errorMessage,
  getBody,
  pluginInstallSchema,
  pluginPreviewSchema,
  validate,
} from './schemas.js';

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
        const manifest = await readPluginManifestFile(manifestPath);
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
        const manifest = await readPluginManifestFile(
          join(tempDir, 'plugin.json'),
        );
        const promptScan =
          manifest.prompts?.source != null
            ? scanPromptDirDetailed(
                join(tempDir, manifest.prompts.source),
                manifest.name,
              )
            : null;
        if (promptScan && promptScan.blockedFiles.length > 0) {
          return c.json(
            {
              valid: false,
              error: `Blocked potentially unsafe context in prompt files for plugin '${manifest.name}'.`,
              findings: promptScan.blockedFiles,
              components: [],
              conflicts: [],
            },
            400,
          );
        }
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
      if (isContextSafetyError(error)) {
        return c.json(
          {
            valid: false,
            error: error.message,
            findings: error.findings,
            components: [],
            conflicts: [],
          },
          400,
        );
      }
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
      const installed = await installPluginFromSource(source, skip, {
        agentsDir,
        buildPlugin: (pluginDir, name) => buildPlugin(pluginDir, name, logger),
        eventBus,
        logger,
        pluginsDir,
        projectHomeDir,
      });
      return c.json(installed);
    } catch (error: unknown) {
      if (isContextSafetyError(error)) {
        return c.json(
          {
            success: false,
            error: error.message,
            findings: error.findings,
          },
          400,
        );
      }
      logger.error('Plugin install failed', { error: errorMessage(error) });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });
}
