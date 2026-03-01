/**
 * Configuration loader for reading and watching .work-agent/ files
 */

import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { createPinoLogger } from '@voltagent/logger';
import { type FSWatcher, watch } from 'chokidar';
import type { PluginOverrides } from '@stallion-ai/shared';
import type {
  ACPConfig,
  AgentMetadata,
  AgentSpec,
  AppConfig,
  ToolDef,
  ToolMetadata,
  WorkflowMetadata,
  WorkspaceConfig,
  WorkspaceMetadata,
} from './types.js';
import { validator } from './validator.js';

const logger = createPinoLogger({ name: 'config-loader' });

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
        defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        invokeModel: 'us.amazon.nova-2-lite-v1:0',
        structureModel: 'us.amazon.nova-micro-v1:0',
      };

      await this.saveAppConfig(defaultConfig);
      return defaultConfig;
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);

    // Migrate: add defaults for new required fields
    if (!data.invokeModel) data.invokeModel = 'us.amazon.nova-2-lite-v1:0';
    if (!data.structureModel) data.structureModel = 'us.amazon.nova-micro-v1:0';

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
   * Load plugin provider overrides
   */
  async loadPluginOverrides(): Promise<PluginOverrides> {
    const path = join(this.workAgentDir, 'config', 'plugin-overrides.json');
    if (!existsSync(path)) return {};
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save plugin provider overrides
   */
  async savePluginOverrides(overrides: PluginOverrides): Promise<void> {
    const configDir = join(this.workAgentDir, 'config');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'plugin-overrides.json'),
      JSON.stringify(overrides, null, 2),
      'utf-8',
    );
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
  async createAgent(
    spec: AgentSpec,
  ): Promise<{ slug: string; spec: AgentSpec }> {
    validator.validateAgentSpec(spec);

    // Generate slug from name
    const slug = spec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new Error(
        'Agent name must contain at least one alphanumeric character',
      );
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
  async updateAgent(
    slug: string,
    updates: Partial<AgentSpec>,
  ): Promise<AgentSpec> {
    // Load existing agent
    const existing = await this.loadAgent(slug);

    // Filter out metadata fields that aren't part of AgentSpec
    const {
      slug: _,
      updatedAt,
      description,
      workflowWarnings,
      ...cleanUpdates
    } = updates as Partial<AgentSpec> & {
      slug?: string;
      updatedAt?: string;
      description?: string;
      workflowWarnings?: string[];
    };

    // Remove only undefined values (allow null/empty to clear fields)
    const filteredUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(cleanUpdates)) {
      if (value === undefined) continue;
      filteredUpdates[key] = value;
    }

    // Merge updates
    const updated = { ...existing, ...filteredUpdates };

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

        const workflowWarnings = await this.validateWorkflowShortcuts(
          entry.name,
          spec.ui?.workflowShortcuts,
        );

        agents.push({
          slug: entry.name,
          name: spec.name,
          model: spec.model,
          updatedAt: stats.mtime.toISOString(),
          description: spec.prompt,
          ui: spec.ui,
          workflowWarnings:
            workflowWarnings.length > 0 ? workflowWarnings : undefined,
        });
      } catch (error: any) {
        logger.error('Failed to load agent', {
          agent: entry.name,
          error: error.message || error,
        });
        if (error.name === 'ValidationError') {
          logger.error('Validation errors', { errors: error.errors });
        }
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
  async createWorkflow(
    slug: string,
    filename: string,
    content: string,
  ): Promise<void> {
    // Validate filename extension
    const ext = extname(filename).toLowerCase();
    if (!['.ts', '.js', '.mjs', '.cjs'].includes(ext)) {
      throw new Error(
        'Workflow filename must end with .ts, .js, .mjs, or .cjs',
      );
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
    const path = join(
      this.workAgentDir,
      'agents',
      slug,
      'workflows',
      workflowId,
    );

    if (!existsSync(path)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    return await readFile(path, 'utf-8');
  }

  /**
   * Update an existing workflow file
   */
  async updateWorkflow(
    slug: string,
    workflowId: string,
    content: string,
  ): Promise<void> {
    const path = join(
      this.workAgentDir,
      'agents',
      slug,
      'workflows',
      workflowId,
    );

    if (!existsSync(path)) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }

    await writeFile(path, content, 'utf-8');
  }

  /**
   * Delete a workflow file
   */
  async deleteWorkflow(slug: string, workflowId: string): Promise<void> {
    const path = join(
      this.workAgentDir,
      'agents',
      slug,
      'workflows',
      workflowId,
    );

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

  private async validateWorkflowShortcuts(
    slug: string,
    shortcuts?: string[],
  ): Promise<string[]> {
    if (!shortcuts || shortcuts.length === 0) {
      return [];
    }

    try {
      const workflows = await this.listAgentWorkflows(slug);
      const knownIds = new Set(workflows.map((workflow) => workflow.id));
      const missing = shortcuts.filter((id) => !knownIds.has(id));

      if (missing.length > 0) {
        logger.warn(
          'Agent references missing workflows in ui.workflowShortcuts',
          {
            agent: slug,
            missing: missing.join(', '),
          },
        );
      }

      return missing;
    } catch (error) {
      logger.error('Failed to validate workflow shortcuts', {
        agent: slug,
        error,
      });
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
          description: def.description,
          transport: def.transport,
          source: def.command || def.endpoint,
        });
      } catch (error) {
        logger.error('Failed to load tool', { tool: entry.name, error });
      }
    }

    return tools;
  }

  /**
   * Build a map of tool ID → agent slugs that use it
   */
  async getToolAgentMap(): Promise<Record<string, string[]>> {
    const agentsDir = join(this.workAgentDir, 'agents');
    const map: Record<string, string[]> = {};
    if (!existsSync(agentsDir)) return map;

    const entries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const spec = await this.loadAgent(entry.name);
        for (const toolId of spec.tools?.mcpServers || []) {
          (map[toolId] ??= []).push(spec.name || entry.name);
        }
      } catch { /* skip broken agents */ }
    }
    return map;
  }

  /**
   * Load workspace configuration
   */
  async loadWorkspace(slug: string): Promise<WorkspaceConfig> {
    const path = join(this.workAgentDir, 'workspaces', slug, 'workspace.json');

    if (!existsSync(path)) {
      throw new Error(`Workspace '${slug}' not found at ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    validator.validateWorkspaceConfig(data);

    // Validate agent references
    for (const prompt of data.globalPrompts || []) {
      if (prompt.agent && !(await this.agentExists(prompt.agent))) {
        throw new Error(
          `Workspace '${slug}' references non-existent agent '${prompt.agent}'`,
        );
      }
    }
    for (const tab of data.tabs || []) {
      for (const prompt of tab.prompts || []) {
        if (prompt.agent && !(await this.agentExists(prompt.agent))) {
          throw new Error(
            `Workspace '${slug}' tab '${tab.id}' references non-existent agent '${prompt.agent}'`,
          );
        }
      }
    }

    return data;
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<WorkspaceMetadata[]> {
    const workspacesDir = join(this.workAgentDir, 'workspaces');

    if (!existsSync(workspacesDir)) {
      return [];
    }

    const entries = await readdir(workspacesDir, { withFileTypes: true });
    const workspaces: WorkspaceMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const workspacePath = join(workspacesDir, entry.name, 'workspace.json');
      if (!existsSync(workspacePath)) continue;

      try {
        const config = await this.loadWorkspace(entry.name);
        workspaces.push({
          slug: config.slug,
          name: config.name,
          icon: config.icon,
          description: config.description,
          plugin: config.plugin,
          tabCount: config.tabs?.length || 0,
        });
      } catch (error) {
        logger.error('Failed to load workspace', {
          workspace: entry.name,
          error,
        });
      }
    }

    return workspaces.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(config: WorkspaceConfig): Promise<void> {
    validator.validateWorkspaceConfig(config);

    if (await this.workspaceExists(config.slug)) {
      throw new Error(`Workspace with slug '${config.slug}' already exists`);
    }

    await this.saveWorkspace(config.slug, config);
  }

  /**
   * Update an existing workspace
   */
  async updateWorkspace(
    slug: string,
    updates: Partial<WorkspaceConfig>,
  ): Promise<WorkspaceConfig> {
    const existing = await this.loadWorkspace(slug);
    const updated = { ...existing, ...updates };
    await this.saveWorkspace(slug, updated);
    return updated;
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(slug: string): Promise<void> {
    const workspaceDir = join(this.workAgentDir, 'workspaces', slug);

    if (!existsSync(workspaceDir)) {
      throw new Error(`Workspace '${slug}' not found`);
    }

    await rm(workspaceDir, { recursive: true, force: true });
  }

  /**
   * Save workspace configuration
   */
  async saveWorkspace(slug: string, config: WorkspaceConfig): Promise<void> {
    validator.validateWorkspaceConfig(config);

    const workspaceDir = join(this.workAgentDir, 'workspaces', slug);
    await mkdir(workspaceDir, { recursive: true });

    const path = join(workspaceDir, 'workspace.json');
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Get all workspaces that reference a specific agent
   */
  async getWorkspacesUsingAgent(agentSlug: string): Promise<string[]> {
    const workspaces = await this.listWorkspaces();
    const using: string[] = [];

    for (const ws of workspaces) {
      try {
        const config = await this.loadWorkspace(ws.slug);

        // Check global prompts
        const hasGlobalRef = config.globalPrompts?.some(
          (p) => p.agent === agentSlug,
        );

        // Check tab prompts
        const hasTabRef = config.tabs.some((tab) =>
          tab.prompts?.some((p) => p.agent === agentSlug),
        );

        if (hasGlobalRef || hasTabRef) {
          using.push(ws.slug);
        }
      } catch (error) {
        logger.error('Error checking workspace', { workspace: ws.slug, error });
      }
    }

    return using;
  }

  /**
   * Check if agent exists
   */
  async agentExists(slug: string): Promise<boolean> {
    const path = join(this.workAgentDir, 'agents', slug, 'agent.json');
    return existsSync(path);
  }

  /**
   * Check if workspace exists
   */
  async workspaceExists(slug: string): Promise<boolean> {
    const path = join(this.workAgentDir, 'workspaces', slug, 'workspace.json');
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
      join(this.workAgentDir, 'tools', '*', 'tool.json'),
    ];

    this.watcher = watch(patterns, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', (path) => {
      this.notifyListeners('change', path);
    });

    this.watcher.on('add', (path) => {
      this.notifyListeners('add', path);
    });

    this.watcher.on('unlink', (path) => {
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
          logger.error('Error in config listener', { error });
        }
      }
    }
  }

  /**
   * Load ACP configuration (connections to external agents)
   */
  async loadACPConfig(): Promise<ACPConfig> {
    const path = join(this.workAgentDir, 'config', 'acp.json');
    if (!existsSync(path)) {
      const defaultConfig: ACPConfig = {
        connections: [
          {
            id: 'kiro',
            name: 'kiro-cli',
            command: 'kiro-cli',
            args: ['acp'],
            icon: '/kiro-icon.png',
            enabled: true,
          },
        ],
      };
      await mkdir(join(this.workAgentDir, 'config'), { recursive: true });
      await writeFile(path, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return defaultConfig;
    }
    return JSON.parse(await readFile(path, 'utf-8'));
  }

  /**
   * Save ACP configuration
   */
  async saveACPConfig(config: ACPConfig): Promise<void> {
    const path = join(this.workAgentDir, 'config', 'acp.json');
    await mkdir(join(this.workAgentDir, 'config'), { recursive: true });
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
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
