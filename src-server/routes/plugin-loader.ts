import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type {
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  IIntegrationRegistryProvider,
  ISettingsProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
} from '../providers/provider-interfaces.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage } from './schemas.js';

export async function loadPluginProviders(
  pluginsDir: string,
  pluginName: string,
  manifest: PluginManifest,
  logger: Logger,
): Promise<number> {
  if (!manifest.providers) return 0;

  const { ConfigLoader } = await import('../domain/config-loader.js');
  const configLoader = new ConfigLoader({
    projectHomeDir: dirname(pluginsDir),
  });
  const overrides = await configLoader.loadPluginOverrides();
  const pluginSettings = overrides[pluginName]?.settings || {};

  const {
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

  let loaded = 0;
  for (const provider of manifest.providers) {
    const modulePath = join(pluginsDir, pluginName, provider.module);
    if (!existsSync(modulePath)) continue;

    try {
      if (
        modulePath.endsWith('.json') &&
        (provider.type === 'agentRegistry' ||
          provider.type === 'integrationRegistry' ||
          provider.type === 'pluginRegistry')
      ) {
        const { JsonManifestRegistryProvider } = await import(
          '../providers/json-manifest-registry.js'
        );
        const instance = new JsonManifestRegistryProvider(
          modulePath,
          dirname(pluginsDir),
        );
        if (provider.type === 'agentRegistry') {
          registerAgentRegistryProvider(instance);
        } else if (provider.type === 'pluginRegistry') {
          registerPluginRegistryProvider(instance);
        } else {
          registerIntegrationRegistryProvider(instance);
        }
        loaded++;
        continue;
      }

      const fileUrl = `file://${modulePath}?t=${Date.now()}`;
      const mod = await import(fileUrl);
      const factory = mod.default || mod;
      let instance: unknown;
      try {
        instance =
          typeof factory === 'function' ? factory(pluginSettings) : factory;
      } catch (factoryError: unknown) {
        logger.error('Plugin provider factory threw', {
          plugin: pluginName,
          type: provider.type,
          error: errorMessage(factoryError),
        });
        continue;
      }

      if (provider.type === 'auth') {
        registerAuthProvider(instance as IAuthProvider);
      } else if (provider.type === 'userIdentity') {
        registerUserIdentityProvider(instance as IUserIdentityProvider);
      } else if (provider.type === 'userDirectory') {
        registerUserDirectoryProvider(instance as IUserDirectoryProvider);
      } else if (provider.type === 'agentRegistry') {
        registerAgentRegistryProvider(instance as IAgentRegistryProvider);
      } else if (provider.type === 'integrationRegistry') {
        registerIntegrationRegistryProvider(
          instance as IIntegrationRegistryProvider,
        );
      } else if (provider.type === 'branding') {
        registerBrandingProvider(instance as IBrandingProvider);
      } else if (provider.type === 'settings') {
        registerSettingsProvider(instance as ISettingsProvider);
      } else {
        registerProvider(provider.type, instance, {
          layout: provider.layout,
          source: pluginName,
        });
      }

      loaded++;
    } catch (error: unknown) {
      logger.error('Failed to load provider', {
        plugin: pluginName,
        type: provider.type,
        error: errorMessage(error),
      });
    }
  }

  return loaded;
}
