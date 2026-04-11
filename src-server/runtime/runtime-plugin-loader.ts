import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface RuntimeLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

interface RuntimePluginLoaderContext {
  logger: RuntimeLogger;
  projectHomeDir: string;
  loadPluginOverrides: () => Promise<any>;
}

export async function loadRuntimePluginPrompts(
  context: Pick<RuntimePluginLoaderContext, 'projectHomeDir'>,
): Promise<void> {
  const pluginsDir = join(context.projectHomeDir, 'plugins');
  if (!existsSync(pluginsDir)) return;

  const { scanPromptDir } = await import('../services/prompt-scanner.js');
  const { PromptService } = await import('../services/prompt-service.js');
  const promptService = new PromptService();

  for (const name of readdirSync(pluginsDir)) {
    const manifestPath = join(pluginsDir, name, 'plugin.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (!manifest.prompts?.source) {
        continue;
      }
      const promptsDir = join(pluginsDir, name, manifest.prompts.source);
      const scannedPrompts = scanPromptDir(promptsDir, name);
      if (scannedPrompts.length > 0) {
        promptService.registerPluginPrompts(scannedPrompts);
      }
    } catch {}
  }
}

export async function loadRuntimePluginProviders(
  context: RuntimePluginLoaderContext,
): Promise<void> {
  const pluginsDir = join(context.projectHomeDir, 'plugins');
  if (!existsSync(pluginsDir)) return;

  const { resolvePluginProviders } = await import('../providers/resolver.js');
  const {
    clearAll,
    registerProvider,
    registerBrandingProvider,
    registerSettingsProvider,
    registerAuthProvider,
    registerUserIdentityProvider,
    registerUserDirectoryProvider,
    registerAgentRegistryProvider,
    registerIntegrationRegistryProvider,
    registerPluginRegistryProvider,
  } = await import('../providers/registry.js');

  clearAll();
  const overrides = await context.loadPluginOverrides();
  const { resolved, conflicts } = resolvePluginProviders(pluginsDir, overrides);

  for (const conflict of conflicts) {
    context.logger.warn(
      'Provider conflict — multiple plugins provide singleton type',
      {
        type: conflict.type,
        layout: conflict.layout,
        candidates: conflict.candidates,
      },
    );
  }

  for (const entry of resolved) {
    const modulePath = join(pluginsDir, entry.pluginName, entry.module);
    if (!existsSync(modulePath)) {
      context.logger.warn('Plugin provider module not found', {
        plugin: entry.pluginName,
        module: entry.module,
      });
      continue;
    }
    try {
      if (
        modulePath.endsWith('.json') &&
        (entry.type === 'agentRegistry' ||
          entry.type === 'integrationRegistry' ||
          entry.type === 'pluginRegistry')
      ) {
        const { JsonManifestRegistryProvider } = await import(
          '../providers/json-manifest-registry.js'
        );
        const instance = new JsonManifestRegistryProvider(
          modulePath,
          dirname(pluginsDir),
        );
        if (entry.type === 'agentRegistry') {
          registerAgentRegistryProvider(instance);
        } else if (entry.type === 'pluginRegistry') {
          registerPluginRegistryProvider(instance, entry.pluginName);
        } else {
          registerIntegrationRegistryProvider(instance);
        }
        context.logger.info('Registered plugin provider (JSON manifest)', {
          plugin: entry.pluginName,
          type: entry.type,
        });
        continue;
      }

      const fileUrl = `file://${modulePath}?t=${Date.now()}`;
      const mod = await import(fileUrl);
      const factory = mod.default || mod;
      const instance = typeof factory === 'function' ? factory() : factory;

      if (entry.type === 'auth') {
        registerAuthProvider(instance);
      } else if (entry.type === 'userIdentity') {
        registerUserIdentityProvider(instance);
      } else if (entry.type === 'userDirectory') {
        registerUserDirectoryProvider(instance);
      } else if (entry.type === 'agentRegistry') {
        registerAgentRegistryProvider(instance);
      } else if (entry.type === 'integrationRegistry') {
        registerIntegrationRegistryProvider(instance);
      } else if (entry.type === 'pluginRegistry') {
        registerPluginRegistryProvider(instance, entry.pluginName);
      } else if (entry.type === 'branding') {
        registerBrandingProvider(instance);
      } else if (entry.type === 'settings') {
        registerSettingsProvider(instance);
      } else {
        registerProvider(entry.type, instance, {
          layout: entry.layout,
          source: entry.pluginName,
        });
      }

      context.logger.info('Registered plugin provider', {
        plugin: entry.pluginName,
        type: entry.type,
      });
    } catch (error: any) {
      context.logger.error('Failed to load plugin provider', {
        plugin: entry.pluginName,
        type: entry.type,
        error: error.message,
      });
    }
  }
}
