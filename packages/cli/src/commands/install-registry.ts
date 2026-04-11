import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { PLUGINS_DIR, PROJECT_HOME } from './helpers.js';

function readConfiguredRegistryUrl(configPath: string): string | undefined {
  if (!existsSync(configPath)) return undefined;

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.registryUrl;
  } catch {
    return undefined;
  }
}

function saveRegistryUrl(configPath: string, registryUrl: string): void {
  mkdirSync(PROJECT_HOME, { recursive: true });
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {}
  }
  config.registryUrl = registryUrl;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ Registry URL saved: ${registryUrl}`);
}

export function showOrSaveRegistry(registryUrl?: string): void {
  const configPath = join(PROJECT_HOME, 'config.json');
  const url = registryUrl || readConfiguredRegistryUrl(configPath);

  if (!url) {
    console.error('No registry URL configured.');
    console.log('  Set one: stallion registry <url>');
    console.log('  Or add "registryUrl" to ~/.stallion-ai/config.json');
    process.exit(1);
  }

  if (registryUrl) {
    saveRegistryUrl(configPath, registryUrl);
    return;
  }

  console.log(`📋 Fetching registry from ${url}...\n`);
  try {
    const result = execSync(`curl -sf "${url}"`, {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const manifest = JSON.parse(result);
    const plugins = manifest.plugins || [];

    if (!plugins.length) {
      console.log('Registry is empty.');
      return;
    }

    const installed = new Set<string>();
    if (existsSync(PLUGINS_DIR)) {
      for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) installed.add(entry.name);
      }
    }

    console.log('Available Plugins:\n');
    for (const plugin of plugins) {
      const status = installed.has(plugin.id) ? ' [installed]' : '';
      console.log(
        `  ${plugin.displayName || plugin.id} (${plugin.id}@${plugin.version || '?'})${status}`,
      );
      if (plugin.description) console.log(`    ${plugin.description}`);
    }
    console.log(`\n  Install with: stallion install <source>`);
  } catch (error: any) {
    console.error(`Failed to fetch registry: ${error.message}`);
    process.exit(1);
  }
}
