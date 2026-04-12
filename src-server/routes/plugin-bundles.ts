import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { buildPlugin as buildPluginBundle } from '@stallion-ai/shared/build';
import type { Logger } from '../utils/logger.js';
import { errorMessage } from './schemas.js';

/** Resolve a plugin bundle file by manifest name (not folder name). */
export function resolvePluginBundle(
  pluginsDir: string,
  name: string,
  file: string,
  logger: Logger,
): string | null {
  const direct = join(pluginsDir, name, 'dist', file);
  if (existsSync(direct)) return direct;
  if (!existsSync(pluginsDir)) return null;

  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    try {
      const manifest = JSON.parse(
        readFileSync(join(pluginsDir, entry.name, 'plugin.json'), 'utf-8'),
      ) as PluginManifest;
      if (manifest.name === name) {
        const bundlePath = join(pluginsDir, entry.name, 'dist', file);
        return existsSync(bundlePath) ? bundlePath : null;
      }
    } catch (error) {
      logger.debug('Failed to read plugin manifest for bundle resolution', {
        error,
      });
    }
  }

  return null;
}

/** Run plugin build if build script or entrypoint exists. */
export async function buildPlugin(
  pluginDir: string,
  name: string,
  logger: Logger,
): Promise<void> {
  try {
    const result = await buildPluginBundle(pluginDir);
    if (result.built) {
      logger.info(`Plugin ${name}: build complete`);
    }
  } catch (error: unknown) {
    logger.error(`Plugin ${name}: build failed`, {
      error: errorMessage(error),
    });
    throw new Error(`Build failed: ${errorMessage(error)}`);
  }
}
