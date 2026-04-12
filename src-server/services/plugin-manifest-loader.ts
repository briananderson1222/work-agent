import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { assertSafeContextText } from './context-safety.js';

export async function readPluginManifestFile(
  manifestPath: string,
): Promise<PluginManifest> {
  const raw = await readFile(manifestPath, 'utf-8');
  return parsePluginManifest(raw, manifestPath);
}

export function readPluginManifestFileSync(
  manifestPath: string,
): PluginManifest {
  const raw = readFileSync(manifestPath, 'utf-8');
  return parsePluginManifest(raw, manifestPath);
}

function parsePluginManifest(
  raw: string,
  manifestPath: string,
): PluginManifest {
  assertSafeContextText(raw, {
    profile: 'hidden-only',
    source: `plugin manifest '${dirname(manifestPath)}/${basename(manifestPath)}'`,
  });
  return JSON.parse(raw) as PluginManifest;
}
