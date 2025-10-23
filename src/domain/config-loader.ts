/**
 * Configuration loader for reading and watching .work-agent/ files
 */

import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { watch, type FSWatcher } from 'chokidar';
import type { AgentSpec, ToolDef, AppConfig, AgentMetadata, ToolMetadata } from './types.js';
import { validator } from './validator.js';

export interface ConfigLoaderOptions {
  workAgentDir?: string;
  watchFiles?: boolean;
}

export class ConfigLoader {
  private workAgentDir: string;
  private watcher?: FSWatcher;
  private listeners: Map<string, Set<(data: unknown) => void>>;

  constructor(options: ConfigLoaderOptions = {}) {
    this.workAgentDir = resolve(options.workAgentDir || '.work-agent');
    this.listeners = new Map();

    if (options.watchFiles) {
      this.setupFileWatcher();
    }
  }

  /**
   * Get the work agent directory path
   */
  getWorkAgentDir(): string {
    return this.workAgentDir;
  }

  /**
   * Load application configuration
   */
  async loadAppConfig(): Promise<AppConfig> {
    const path = join(this.workAgentDir, 'config', 'app.json');

    if (!existsSync(path)) {
      // Create default config on first run
      const defaultConfig: AppConfig = {
        region: 'us-east-1',
        defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
      };

      await this.saveAppConfig(defaultConfig);
      return defaultConfig;
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    validator.validateAppConfig(data);
    return data;
  }

  /**
   * Save application configuration
   */
  async saveAppConfig(config: AppConfig): Promise<void> {
    validator.validateAppConfig(config);

    const path = join(this.workAgentDir, 'config', 'app.json');
    await mkdir(join(this.workAgentDir, 'config'), { recursive: true });
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Load agent specification
   */
  async loadAgent(slug: string): Promise<AgentSpec> {
    const path = join(this.workAgentDir, 'agents', slug, 'agent.json');

    if (!existsSync(path)) {
      throw new Error(`Agent '${slug}' not found at ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    validator.validateAgentSpec(data);
    return data;
  }

  /**
   * Save agent specification
   */
  async saveAgent(slug: string, spec: AgentSpec): Promise<void> {
    validator.validateAgentSpec(spec);

    const agentDir = join(this.workAgentDir, 'agents', slug);
    await mkdir(agentDir, { recursive: true });

    // Also create memory and workflows directories
    await mkdir(join(agentDir, 'memory', 'sessions'), { recursive: true });
    await mkdir(join(agentDir, 'workflows'), { recursive: true });

    const path = join(agentDir, 'agent.json');
    await writeFile(path, JSON.stringify(spec, null, 2), 'utf-8');
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<AgentMetadata[]> {
    const agentsDir = join(this.workAgentDir, 'agents');

    if (!existsSync(agentsDir)) {
      return [];
    }

    const entries = await readdir(agentsDir, { withFileTypes: true });
    const agents: AgentMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentPath = join(agentsDir, entry.name, 'agent.json');
      if (!existsSync(agentPath)) continue;

      try {
        const spec = await this.loadAgent(entry.name);
        const stats = await stat(agentPath);

        agents.push({
          slug: entry.name,
          name: spec.name,
          model: spec.model,
          updatedAt: stats.mtime.toISOString()
        });
      } catch (error) {
        console.error(`Failed to load agent '${entry.name}':`, error);
      }
    }

    return agents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Load tool definition
   */
  async loadTool(id: string): Promise<ToolDef> {
    const path = join(this.workAgentDir, 'tools', id, 'tool.json');

    if (!existsSync(path)) {
      throw new Error(`Tool '${id}' not found at ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    validator.validateToolDef(data);
    return data;
  }

  /**
   * Save tool definition
   */
  async saveTool(id: string, def: ToolDef): Promise<void> {
    validator.validateToolDef(def);

    const toolDir = join(this.workAgentDir, 'tools', id);
    await mkdir(toolDir, { recursive: true });

    const path = join(toolDir, 'tool.json');
    await writeFile(path, JSON.stringify(def, null, 2), 'utf-8');
  }

  /**
   * List all tools in catalog
   */
  async listTools(): Promise<ToolMetadata[]> {
    const toolsDir = join(this.workAgentDir, 'tools');

    if (!existsSync(toolsDir)) {
      return [];
    }

    const entries = await readdir(toolsDir, { withFileTypes: true });
    const tools: ToolMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const toolPath = join(toolsDir, entry.name, 'tool.json');
      if (!existsSync(toolPath)) continue;

      try {
        const def = await this.loadTool(entry.name);
        tools.push({
          id: def.id,
          kind: def.kind,
          displayName: def.displayName,
          description: def.description
        });
      } catch (error) {
        console.error(`Failed to load tool '${entry.name}':`, error);
      }
    }

    return tools;
  }

  /**
   * Check if agent exists
   */
  async agentExists(slug: string): Promise<boolean> {
    const path = join(this.workAgentDir, 'agents', slug, 'agent.json');
    return existsSync(path);
  }

  /**
   * Check if tool exists
   */
  async toolExists(id: string): Promise<boolean> {
    const path = join(this.workAgentDir, 'tools', id, 'tool.json');
    return existsSync(path);
  }

  /**
   * Set up file watcher for configuration changes
   */
  private setupFileWatcher(): void {
    const patterns = [
      join(this.workAgentDir, 'config', '*.json'),
      join(this.workAgentDir, 'agents', '*', 'agent.json'),
      join(this.workAgentDir, 'tools', '*', 'tool.json')
    ];

    this.watcher = watch(patterns, {
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', (path) => {
      console.log(`Config file changed: ${path}`);
      this.notifyListeners('change', path);
    });

    this.watcher.on('add', (path) => {
      console.log(`Config file added: ${path}`);
      this.notifyListeners('add', path);
    });

    this.watcher.on('unlink', (path) => {
      console.log(`Config file removed: ${path}`);
      this.notifyListeners('remove', path);
    });
  }

  /**
   * Register a listener for config changes
   */
  on(event: string, listener: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Unregister a listener
   */
  off(event: string, listener: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * Notify all listeners for an event
   */
  private notifyListeners(event: string, data: unknown): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in config listener:`, error);
        }
      }
    }
  }

  /**
   * Stop file watching and clean up
   */
  async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    this.listeners.clear();
  }
}
