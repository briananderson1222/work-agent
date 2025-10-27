/**
 * Configuration loader for reading and watching .work-agent/ files
 */

import { readFile, readdir, stat, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { watch, type FSWatcher } from 'chokidar';
import type {
  AgentSpec,
  ToolDef,
  AppConfig,
  AgentMetadata,
  ToolMetadata,
  WorkflowMetadata,
} from './types.js';
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
   * Update application configuration (alias for saveAppConfig)
   */
  async updateAppConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    const existing = await this.loadAppConfig();
    const updated = { ...existing, ...updates };
    await this.saveAppConfig(updated);
    return updated;
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
   * Create a new agent (generates slug from name)
   */
  async createAgent(spec: AgentSpec): Promise<{ slug: string; spec: AgentSpec }> {
    validator.validateAgentSpec(spec);

    // Generate slug from name
    const slug = spec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new Error('Agent name must contain at least one alphanumeric character');
    }

    // Check if agent already exists
    if (await this.agentExists(slug)) {
      throw new Error(`Agent with slug '${slug}' already exists`);
    }

    await this.saveAgent(slug, spec);
    return { slug, spec };
  }

  /**
   * Update an existing agent
   */
  async updateAgent(slug: string, updates: Partial<AgentSpec>): Promise<AgentSpec> {
    // Load existing agent
    const existing = await this.loadAgent(slug);

    // Merge updates
    const updated = { ...existing, ...updates };

    // Validate and save
    await this.saveAgent(slug, updated);

    return updated;
  }

  /**
   * Delete an agent and all its data
   */
  async deleteAgent(slug: string): Promise<void> {
    const agentDir = join(this.workAgentDir, 'agents', slug);

    if (!existsSync(agentDir)) {
      throw new Error(`Agent '${slug}' not found`);
    }

    // Remove entire agent directory (includes config, memory, workflows)
    await rm(agentDir, { recursive: true, force: true });
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

        const workflowWarnings = await this.validateWorkflowShortcuts(entry.name, spec.ui?.workflowShortcuts);

        agents.push({
          slug: entry.name,
          name: spec.name,
          model: spec.model,
          updatedAt: stats.mtime.toISOString(),
          description: spec.prompt,
          ui: spec.ui,
          workflowWarnings: workflowWarnings.length > 0 ? workflowWarnings : undefined
        });
      } catch (error) {
        console.error(`Failed to load agent '${entry.name}':`, error);
      }
    }

    return agents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAgentWorkflows(slug: string): Promise<WorkflowMetadata[]> {
    const workflowsDir = join(this.workAgentDir, 'agents', slug, 'workflows');

    if (!existsSync(workflowsDir)) {
      return [];
    }

    const entries = await readdir(workflowsDir, { withFileTypes: true });
    const workflows: WorkflowMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      if (!['.ts', '.js', '.mjs', '.cjs'].includes(ext)) continue;

      const id = entry.name;
      const filePath = join(workflowsDir, entry.name);
      const stats = await stat(filePath);

      workflows.push({
        id,
        label: this.deriveWorkflowLabel(id),
        filename: entry.name,
        lastModified: stats.mtime.toISOString(),
      });
    }

    return workflows.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Create a new workflow file
   */
  async createWorkflow(slug: string, filename: string, content: string): Promise<void> {
    // Validate filename extension
    const ext = extname(filename).toLowerCase();
    if (!['.ts', '.js', '.mjs', '.cjs'].includes(ext)) {
      throw new Error('Workflow filename must end with .ts, .js, .mjs, or .cjs');
    }

    const workflowsDir = join(this.workAgentDir, 'agents', slug, 'workflows');
    await mkdir(workflowsDir, { recursive: true });

    const path = join(workflowsDir, filename);

    if (existsSync(path)) {
      throw new Error(`Workflow '${filename}' already exists`);
    }

    await writeFile(path, content, 'utf-8');
  }

  /**
   * Read workflow file content
   */
  async readWorkflow(slug: string, workflowId: string): Promise<string> {
    const path = join(this.workAgentDir, 'agents', slug, 'workflows', workflowId);

    if (!existsSync(path)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    return await readFile(path, 'utf-8');
  }

  /**
   * Update an existing workflow file
   */
  async updateWorkflow(slug: string, workflowId: string, content: string): Promise<void> {
    const path = join(this.workAgentDir, 'agents', slug, 'workflows', workflowId);

    if (!existsSync(path)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    await writeFile(path, content, 'utf-8');
  }

  /**
   * Delete a workflow file
   */
  async deleteWorkflow(slug: string, workflowId: string): Promise<void> {
    const path = join(this.workAgentDir, 'agents', slug, 'workflows', workflowId);

    if (!existsSync(path)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    await rm(path, { force: true });
  }

  private deriveWorkflowLabel(filename: string): string {
    const name = basename(filename, extname(filename));
    return name
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private async validateWorkflowShortcuts(slug: string, shortcuts?: string[]): Promise<string[]> {
    if (!shortcuts || shortcuts.length === 0) {
      return [];
    }

    try {
      const workflows = await this.listAgentWorkflows(slug);
      const knownIds = new Set(workflows.map((workflow) => workflow.id));
      const missing = shortcuts.filter((id) => !knownIds.has(id));

      if (missing.length > 0) {
        console.warn(
          `Agent '${slug}' references missing workflows in ui.workflowShortcuts: ${missing.join(', ')}`
        );
      }

      return missing;
    } catch (error) {
      console.error(`Failed to validate workflow shortcuts for agent '${slug}':`, error);
      return shortcuts;
    }
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
