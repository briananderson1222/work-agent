import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { PLUGINS_DIR, PROJECT_HOME } from './helpers.js';

function getRegistryInstallsPath(): string {
  return join(PROJECT_HOME, 'config', 'registry-installs.json');
}

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

function readRegistryInstallAliases(): Record<string, string> {
  const aliasesPath = getRegistryInstallsPath();
  if (!existsSync(aliasesPath)) return {};

  try {
    return JSON.parse(readFileSync(aliasesPath, 'utf-8')) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export function recordRegistryInstall(
  registryId: string,
  pluginName: string,
): void {
  if (!registryId || registryId === pluginName) {
    return;
  }

  const aliasesPath = getRegistryInstallsPath();
  mkdirSync(dirname(aliasesPath), { recursive: true });
  const aliases = readRegistryInstallAliases();
  aliases[registryId] = pluginName;
  writeFileSync(aliasesPath, JSON.stringify(aliases, null, 2));
}

function normalizeRegistrySource(source: string, registryUrl: string): string {
  if (
    source.startsWith('git@') ||
    source.startsWith('https://') ||
    source.startsWith('http://')
  ) {
    return source;
  }
  if (isAbsolute(source)) {
    return source;
  }
  if (registryUrl.startsWith('/') || registryUrl.startsWith('.')) {
    return resolve(dirname(registryUrl), source);
  }
  return new URL(source, registryUrl).toString();
}

async function fetchRegistryManifest(registryUrl: string): Promise<any> {
  if (registryUrl.startsWith('/') || registryUrl.startsWith('.')) {
    return JSON.parse(readFileSync(registryUrl, 'utf-8'));
  }

  const response = await fetch(registryUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

export async function resolveRegistryPluginSource(
  id: string | undefined,
): Promise<string> {
  if (!id) {
    throw new Error('registry install requires a plugin id');
  }

  const configPath = join(PROJECT_HOME, 'config.json');
  const registryUrl = readConfiguredRegistryUrl(configPath);
  if (!registryUrl) {
    throw new Error('No registry URL configured');
  }

  const manifest = await fetchRegistryManifest(registryUrl);
  const plugin = (manifest.plugins || []).find((entry: any) => entry.id === id);
  if (!plugin?.source) {
    throw new Error(`Plugin '${id}' not found in registry`);
  }

  return normalizeRegistrySource(plugin.source, registryUrl);
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
    const manifest =
      url.startsWith('/') || url.startsWith('.')
        ? JSON.parse(readFileSync(url, 'utf-8'))
        : JSON.parse(
            execSync(`curl -sf "${url}"`, {
              encoding: 'utf-8',
              timeout: 15000,
            }),
          );
    const plugins = manifest.plugins || [];

    if (!plugins.length) {
      console.log('Registry is empty.');
      return;
    }

    const installed = new Set<string>();
    const aliases = readRegistryInstallAliases();
    if (existsSync(PLUGINS_DIR)) {
      for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) installed.add(entry.name);
      }
    }

    console.log('Available Plugins:\n');
    for (const plugin of plugins) {
      const installedPluginName = aliases[plugin.id] || plugin.id;
      const status = installed.has(installedPluginName) ? ' [installed]' : '';
      console.log(
        `  ${plugin.displayName || plugin.id} (${plugin.id}@${plugin.version || '?'})${status}`,
      );
      if (plugin.description) console.log(`    ${plugin.description}`);
    }
    console.log(`\n  Install with: stallion registry install <id>`);
  } catch (error: any) {
    console.error(`Failed to fetch registry: ${error.message}`);
    process.exit(1);
  }
}
