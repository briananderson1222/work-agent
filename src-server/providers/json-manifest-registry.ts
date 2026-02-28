/**
 * JSON Manifest Registry Provider
 * Implements both IAgentRegistryProvider and IToolRegistryProvider
 * by fetching a remote JSON manifest.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { IAgentRegistryProvider, IToolRegistryProvider, RegistryItem, InstallResult } from './types.js';
import type { ToolDef } from '../domain/types.js';

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

export class JsonManifestRegistryProvider implements IAgentRegistryProvider, IToolRegistryProvider {
  private manifestCache: Manifest | null = null;
  private cacheExpiry = 0;
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly manifestUrl: string,
    private readonly workAgentDir: string
  ) {}

  private async fetchManifest(): Promise<Manifest> {
    const now = Date.now();
    if (this.manifestCache && now < this.cacheExpiry) {
      return this.manifestCache;
    }

    const response = await fetch(this.manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
    }

    this.manifestCache = await response.json();
    this.cacheExpiry = now + this.cacheTimeout;
    return this.manifestCache;
  }

  private getPluginsDir(): string {
    return join(this.workAgentDir, 'plugins');
  }

  private getToolsDir(): string {
    return join(this.workAgentDir, 'tools');
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
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        items.push({
          id: manifest.name || entry.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          installed: true,
        });
      } catch {
        // Skip invalid manifests
      }
    }

    return items;
  }

  private readInstalledTools(): RegistryItem[] {
    const toolsDir = this.getToolsDir();
    if (!existsSync(toolsDir)) return [];

    const items: RegistryItem[] = [];
    const entries = readdirSync(toolsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const toolPath = join(toolsDir, entry.name, 'tool.json');
      if (!existsSync(toolPath)) continue;

      try {
        const tool = JSON.parse(readFileSync(toolPath, 'utf-8'));
        items.push({
          id: tool.id || entry.name,
          displayName: tool.displayName,
          description: tool.description,
          version: tool.version,
          installed: true,
        });
      } catch {
        // Skip invalid tools
      }
    }

    return items;
  }

  private async installFromSource(id: string, source: string, targetDir: string): Promise<void> {
    const isGit = source.startsWith('git@') || source.endsWith('.git') ||
      (source.startsWith('https://') && (source.includes('.git') || source.includes('gitlab') || source.includes('github')));

    if (isGit) {
      const [url, branch] = source.split('#');
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) cloneArgs.push('--branch', branch);
      cloneArgs.push(url, targetDir);
      
      execSync(['git', ...cloneArgs].map(a => `"${a}"`).join(' '), { timeout: 30000 });
    } else {
      throw new Error('Only git sources are supported');
    }
  }

  // IAgentRegistryProvider implementation

  async listAvailable(): Promise<RegistryItem[]> {
    const manifest = await this.fetchManifest();
    return manifest.plugins.map(plugin => ({
      id: plugin.id,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      installed: false,
    }));
  }

  async listInstalled(): Promise<RegistryItem[]> {
    return this.readInstalledPlugins();
  }

  async install(id: string): Promise<InstallResult> {
    try {
      const manifest = await this.fetchManifest();
      const plugin = manifest.plugins.find(p => p.id === id);
      
      if (!plugin) {
        return { success: false, message: `Plugin '${id}' not found in registry` };
      }

      const pluginsDir = this.getPluginsDir();
      const targetDir = join(pluginsDir, id);

      await this.installFromSource(id, plugin.source, targetDir);

      return { success: true, message: `Plugin '${id}' installed successfully` };
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

      execSync(`rm -rf "${targetDir}"`);
      return { success: true, message: `Plugin '${id}' uninstalled successfully` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // IToolRegistryProvider implementation

  async getToolDef(id: string): Promise<ToolDef | null> {
    return null; // Not implemented for now
  }

  async sync(): Promise<void> {
    // No-op for now
  }
}