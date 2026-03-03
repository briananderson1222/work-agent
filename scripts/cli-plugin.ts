#!/usr/bin/env node

/**
 * Stallion Plugin CLI
 * 
 * Commands:
 *   stallion plugin install <source>
 *   stallion plugin list
 *   stallion plugin remove <name>
 *   stallion plugin update <name>
 *   stallion plugin info <name>
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PLUGINS_DIR = '.stallion-ai/plugins';
const AGENTS_DIR = '.stallion-ai/agents';
const WORKSPACES_DIR = '.stallion-ai/workspaces';
const UI_WORKSPACES_DIR = 'src-ui/src/workspaces';

interface PluginManifest {
  name: string;
  version: string;
  type: string;
  displayName: string;
  agents?: Array<{ slug: string; source: string }>;
  workspace?: { slug: string; source: string };
}

class PluginManager {
  /**
   * Install plugin from git repo or local path
   */
  async install(source: string): Promise<void> {
    console.log(`📦 Installing plugin from ${source}...`);

    const pluginName = this.extractPluginName(source);
    const pluginDir = join(PLUGINS_DIR, pluginName);

    // Clone or copy plugin
    if (source.startsWith('github:') || source.startsWith('git@') || source.startsWith('https://')) {
      await this.cloneRepo(source, pluginDir);
    } else {
      await this.copyLocal(source, pluginDir);
    }

    // Read manifest
    const manifest = this.readManifest(pluginDir);
    
    // Install agents
    if (manifest.agents) {
      await this.installAgents(pluginDir, manifest);
    }

    // Install workspace
    if (manifest.workspace) {
      await this.installWorkspace(pluginDir, manifest);
    }

    // Install UI components
    await this.installUIComponents(pluginDir, manifest);

    console.log(`✅ Installed ${manifest.displayName} (${manifest.name}@${manifest.version})`);
  }

  /**
   * List installed plugins
   */
  list(): void {
    if (!existsSync(PLUGINS_DIR)) {
      console.log('No plugins installed');
      return;
    }

    const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const manifestPath = join(PLUGINS_DIR, d.name, 'plugin.json');
        if (!existsSync(manifestPath)) return null;
        
        const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        return {
          name: manifest.name,
          version: manifest.version,
          displayName: manifest.displayName,
          agents: manifest.agents?.length || 0,
          workspace: manifest.workspace ? '✓' : '✗',
        };
      })
      .filter(Boolean);

    if (plugins.length === 0) {
      console.log('No plugins installed');
      return;
    }

    console.log('\nInstalled Plugins:\n');
    plugins.forEach(p => {
      console.log(`  ${p!.displayName} (${p!.name}@${p!.version})`);
      console.log(`    Agents: ${p!.agents}, Workspace: ${p!.workspace}`);
    });
  }

  /**
   * Remove plugin
   */
  remove(name: string): void {
    console.log(`🗑️  Removing plugin ${name}...`);

    const pluginDir = join(PLUGINS_DIR, name);
    if (!existsSync(pluginDir)) {
      console.error(`Plugin ${name} not found`);
      process.exit(1);
    }

    const manifest = this.readManifest(pluginDir);

    // Remove agents (preserve memory/conversations data)
    if (manifest.agents) {
      manifest.agents.forEach(agent => {
        const agentSlug = `${name}:${agent.slug}`;
        const agentDir = join(AGENTS_DIR, agentSlug);
        if (existsSync(agentDir)) {
          // Only remove agent.json, keep memory/ intact
          const agentJson = join(agentDir, 'agent.json');
          if (existsSync(agentJson)) rmSync(agentJson);
          // Remove workflows/ if present
          const workflowsDir = join(agentDir, 'workflows');
          if (existsSync(workflowsDir)) rmSync(workflowsDir, { recursive: true });
          console.log(`  Removed agent: ${agentSlug} (memory preserved)`);
        }
      });
    }

    // Remove workspace
    if (manifest.workspace) {
      const workspaceDir = join(WORKSPACES_DIR, manifest.workspace.slug);
      if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true });
        console.log(`  Removed workspace: ${manifest.workspace.slug}`);
      }
    }

    // Remove UI components
    const uiDir = join(UI_WORKSPACES_DIR, name);
    if (existsSync(uiDir)) {
      rmSync(uiDir, { recursive: true });
      console.log(`  Removed UI components`);
    }

    // Remove plugin directory
    rmSync(pluginDir, { recursive: true });

    console.log(`✅ Removed ${manifest.displayName}`);
  }

  /**
   * Show plugin info
   */
  info(name: string): void {
    const pluginDir = join(PLUGINS_DIR, name);
    if (!existsSync(pluginDir)) {
      console.error(`Plugin ${name} not found`);
      process.exit(1);
    }

    const manifest = this.readManifest(pluginDir);

    console.log(`\n${manifest.displayName} (${manifest.name}@${manifest.version})`);
    console.log(`Type: ${manifest.type}`);
    
    if (manifest.agents) {
      console.log(`\nAgents (${manifest.agents.length}):`);
      manifest.agents.forEach(agent => {
        console.log(`  - ${name}:${agent.slug}`);
      });
    }

    if (manifest.workspace) {
      console.log(`\nWorkspace: ${manifest.workspace.slug}`);
    }
  }

  // Helper methods

  private extractPluginName(source: string): string {
    if (source.startsWith('github:')) {
      const parts = source.replace('github:', '').split('#');
      return parts[1] || parts[0].split('/').pop()!;
    }
    if (source.includes('/')) {
      return source.split('/').pop()!;
    }
    return source;
  }

  private async cloneRepo(source: string, targetDir: string): Promise<void> {
    mkdirSync(targetDir, { recursive: true });

    let gitUrl = source;
    let branch = 'main';

    if (source.startsWith('github:')) {
      const [repo, branchOrPath] = source.replace('github:', '').split('#');
      gitUrl = `https://github.com/${repo}.git`;
      branch = branchOrPath || 'main';
    }

    try {
      execSync(`git clone --depth 1 --branch ${branch} ${gitUrl} ${targetDir}`, {
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Failed to clone repository');
      throw error;
    }
  }

  private async copyLocal(source: string, targetDir: string): Promise<void> {
    if (!existsSync(source)) {
      throw new Error(`Source path does not exist: ${source}`);
    }

    mkdirSync(targetDir, { recursive: true });
    cpSync(source, targetDir, { recursive: true });
  }

  private readManifest(pluginDir: string): PluginManifest {
    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      throw new Error('plugin.json not found');
    }

    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  }

  private async installAgents(pluginDir: string, manifest: PluginManifest): Promise<void> {
    if (!manifest.agents) return;

    mkdirSync(AGENTS_DIR, { recursive: true });

    for (const agent of manifest.agents) {
      const agentSlug = `${manifest.name}:${agent.slug}`;
      const sourcePath = join(pluginDir, agent.source);
      const targetDir = join(AGENTS_DIR, agentSlug);

      if (!existsSync(sourcePath)) {
        console.warn(`  Warning: Agent source not found: ${agent.source}`);
        continue;
      }

      // Copy agent directory
      const sourceDir = join(pluginDir, 'agents', agent.slug);
      if (existsSync(sourceDir)) {
        cpSync(sourceDir, targetDir, { recursive: true });
        console.log(`  Installed agent: ${agentSlug}`);
      }
    }
  }

  private async installWorkspace(pluginDir: string, manifest: PluginManifest): Promise<void> {
    if (!manifest.workspace) return;

    mkdirSync(WORKSPACES_DIR, { recursive: true });

    const sourcePath = join(pluginDir, manifest.workspace.source);
    const targetDir = join(WORKSPACES_DIR, manifest.workspace.slug);

    if (!existsSync(sourcePath)) {
      console.warn(`  Warning: Workspace source not found: ${manifest.workspace.source}`);
      return;
    }

    // Copy workspace config
    mkdirSync(targetDir, { recursive: true });
    const wsConfig = JSON.parse(readFileSync(sourcePath, 'utf-8'));
    wsConfig.plugin = manifest.name;
    writeFileSync(join(targetDir, 'workspace.json'), JSON.stringify(wsConfig, null, 2));
    console.log(`  Installed workspace: ${manifest.workspace.slug}`);
  }

  private async installUIComponents(pluginDir: string, manifest: PluginManifest): Promise<void> {
    const srcDir = join(pluginDir, 'src');
    if (!existsSync(srcDir)) {
      console.warn('  Warning: No src/ directory found');
      return;
    }

    const targetDir = join(UI_WORKSPACES_DIR, manifest.name);
    mkdirSync(targetDir, { recursive: true });

    // Copy all source files
    cpSync(srcDir, targetDir, { recursive: true });

    // Copy plugin.json
    cpSync(join(pluginDir, 'plugin.json'), join(targetDir, 'plugin.json'));

    console.log(`  Installed UI components`);
  }
}

// CLI entry point
const manager = new PluginManager();
const [,, command, ...args] = process.argv;

switch (command) {
  case 'install':
    manager.install(args[0]).catch(err => {
      console.error('Installation failed:', err.message);
      process.exit(1);
    });
    break;

  case 'list':
    manager.list();
    break;

  case 'remove':
    manager.remove(args[0]);
    break;

  case 'info':
    manager.info(args[0]);
    break;

  default:
    console.log(`
Stallion Plugin Manager

Usage:
  stallion plugin install <source>   Install plugin from git or local path
  stallion plugin list                List installed plugins
  stallion plugin remove <name>       Remove plugin
  stallion plugin info <name>         Show plugin information

Examples:
  stallion plugin install github:org/my-plugin.git
  stallion plugin install ./my-plugin
  stallion plugin list
  stallion plugin remove work-workspace
    `);
}
