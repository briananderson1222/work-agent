/**
 * JSON Manifest Registry Provider
 * Implements registry lookups for plugins and integrations from a remote or local JSON manifest.
 * by fetching a remote JSON manifest.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import { readPluginManifestFileSync } from '../services/plugin-manifest-loader.js';
import type { InstallResult, RegistryItem } from './provider-contracts.js';
import type {
  IAgentRegistryProvider,
  IIntegrationRegistryProvider,
  IPluginRegistryProvider,
} from './provider-interfaces.js';

interface ManifestPlugin {
  id: string;
  displayName: string;
  description: string;
  version: string;
  source: string;
  type: string;
}

interface ManifestTool {
  id: string;
  displayName: string;
  description: string;
  version: string;
  source: string;
}

interface Manifest {
  version: number;
  plugins: ManifestPlugin[];
  tools: ManifestTool[];
}

export class JsonManifestRegistryProvider
  implements
    IAgentRegistryProvider,
    IIntegrationRegistryProvider,
    IPluginRegistryProvider
{
  private manifestCache: Manifest | null = null;
  private cacheExpiry = 0;
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly manifestUrl: string,
    private readonly projectHomeDir: string,
  ) {}

  private async fetchManifest(): Promise<Manifest> {
    const now = Date.now();
    if (this.manifestCache && now < this.cacheExpiry) {
      return this.manifestCache;
    }

    // Support both URLs and local file paths
    if (this.manifestUrl.startsWith('/') || this.manifestUrl.startsWith('.')) {
      const raw = readFileSync(this.manifestUrl, 'utf-8');
      this.manifestCache = JSON.parse(raw) as Manifest;
    } else {
      const response = await fetch(this.manifestUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch manifest: ${response.status} ${response.statusText}`,
        );
      }
      this.manifestCache = (await response.json()) as Manifest;
    }

    this.cacheExpiry = now + this.cacheTimeout;
    return this.manifestCache!;
  }

  private getPluginsDir(): string {
    return join(this.projectHomeDir, 'plugins');
  }

  private resolveManifestSource(source: string): string {
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

    if (this.manifestUrl.startsWith('/') || this.manifestUrl.startsWith('.')) {
      return resolve(dirname(this.manifestUrl), source);
    }

    try {
      return new URL(source, this.manifestUrl).toString();
    } catch {
      return source;
    }
  }

  private readInstalledPlugins(): RegistryItem[] {
    const pluginsDir = this.getPluginsDir();
    if (!existsSync(pluginsDir)) return [];

    const items: RegistryItem[] = [];
    const entries = readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(pluginsDir, entry.name, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = readPluginManifestFileSync(manifestPath);
        items.push({
          id: manifest.name || entry.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          installed: true,
        });
      } catch (e) {
        console.debug(
          'Failed to read installed plugin manifest:',
          entry.name,
          e,
        );
        // Skip invalid manifests
      }
    }

    return items;
  }

  private readRegistryInstallAliases(): Record<string, string> {
    const aliasesPath = join(
      this.projectHomeDir,
      'config',
      'registry-installs.json',
    );
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

  private async installFromSource(
    _id: string,
    source: string,
    targetDir: string,
  ): Promise<void> {
    const resolvedSource = this.resolveManifestSource(source);
    const isGit =
      resolvedSource.startsWith('git@') ||
      resolvedSource.endsWith('.git') ||
      (resolvedSource.startsWith('https://') &&
        (resolvedSource.includes('.git') ||
          resolvedSource.includes('gitlab') ||
          resolvedSource.includes('github')));

    if (isGit) {
      const [url, branch] = resolvedSource.split('#');
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) cloneArgs.push('--branch', branch);
      cloneArgs.push(url, targetDir);

      execFileSync('git', cloneArgs, { timeout: 30000, windowsHide: true });
    } else {
      if (!existsSync(resolvedSource)) {
        throw new Error(`Source not found: ${resolvedSource}`);
      }
      cpSync(resolvedSource, targetDir, { recursive: true });
    }
  }

  // IAgentRegistryProvider implementation

  async listAvailable(): Promise<RegistryItem[]> {
    const manifest = await this.fetchManifest();
    return manifest.plugins.map((plugin) => ({
      id: plugin.id,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      source: this.resolveManifestSource(plugin.source),
      installed: false,
    }));
  }

  async listInstalled(): Promise<RegistryItem[]> {
    const manifest = await this.fetchManifest();
    const installedPluginNames = new Set(
      this.readInstalledPlugins().map((item) => String(item.id)),
    );
    const aliases = this.readRegistryInstallAliases();

    return manifest.plugins
      .filter((plugin) => {
        const installedPluginName = aliases[plugin.id] || plugin.id;
        return installedPluginNames.has(installedPluginName);
      })
      .map((plugin) => ({
        id: plugin.id,
        displayName: plugin.displayName,
        description: plugin.description,
        version: plugin.version,
        source: this.resolveManifestSource(plugin.source),
        installed: true,
      }));
  }

  async install(id: string): Promise<InstallResult> {
    try {
      const manifest = await this.fetchManifest();
      const plugin = manifest.plugins.find((p) => p.id === id);

      if (!plugin) {
        return {
          success: false,
          message: `Plugin '${id}' not found in registry`,
        };
      }

      const pluginsDir = this.getPluginsDir();
      const targetDir = join(pluginsDir, id);

      await this.installFromSource(id, plugin.source, targetDir);

      return {
        success: true,
        message: `Plugin '${id}' installed successfully`,
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async uninstall(id: string): Promise<InstallResult> {
    try {
      const pluginsDir = this.getPluginsDir();
      const targetDir = join(pluginsDir, id);

      if (!existsSync(targetDir)) {
        return { success: false, message: `Plugin '${id}' not found` };
      }

      rmSync(targetDir, { recursive: true, force: true });
      return {
        success: true,
        message: `Plugin '${id}' uninstalled successfully`,
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async resolveSource(id: string): Promise<string | null> {
    const manifest = await this.fetchManifest();
    const plugin = manifest.plugins.find((entry) => entry.id === id);
    return plugin ? this.resolveManifestSource(plugin.source) : null;
  }

  // IIntegrationRegistryProvider implementation

  async getToolDef(_id: string): Promise<ToolDef | null> {
    return null; // Not implemented for now
  }

  async sync(): Promise<void> {
    // No-op for now
  }
}
