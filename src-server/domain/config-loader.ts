/**
 * Configuration loader for reading and watching .stallion-ai/ files
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
import type { PluginOverrides } from '@stallion-ai/shared';
import { type FSWatcher, watch } from 'chokidar';
import { createLogger } from '../utils/logger.js';
import { resolveHomeDir } from '../utils/paths.js';
import type {
  ACPConfig,
  AgentMetadata,
  AgentSpec,
  AppConfig,
  StandaloneLayoutConfig,
  StandaloneLayoutMetadata,
  ToolDef,
  ToolMetadata,
  WorkflowMetadata,
} from './types.js';
import { validator } from './validator.js';

const logger = createLogger({ name: 'config-loader' });

export const DEFAULT_SYSTEM_PROMPT = [
  'You are {{AGENT_NAME}}, a helpful AI assistant.',
  '',
  'Be concise and direct. When you lack information, say so rather than guessing.',
  '',
  '## Environment',
  'Date: {{date}}',
  'Time: {{time}}',
].join('\n');

const DEFAULT_TEMPLATE_VARIABLES = [
  { key: 'AGENT_NAME', type: 'static' as const, value: 'Stallion' },
];

export interface ConfigLoaderOptions {
  projectHomeDir?: string;
  watchFiles?: boolean;
}

export interface SkillConfig {
  name: string;
  description?: string;
  source: 'local' | 'registry' | 'plugin';
  installedAt: string;
  version?: string;
  path: string;
}

export class ConfigLoader {
  private projectHomeDir: string;
  private watcher?: FSWatcher;
  private listeners: Map<string, Set<(data: unknown) => void>>;

  constructor(options: ConfigLoaderOptions = {}) {
    this.projectHomeDir = resolve(options.projectHomeDir || resolveHomeDir());
    this.listeners = new Map();

    if (options.watchFiles) {
      this.setupFileWatcher();
    }
  }

  /**
   * Get the project home directory path
   */
  getProjectHomeDir(): string {
    return this.projectHomeDir;
  }

  /**
   * Load application configuration
   */
  async loadAppConfig(): Promise<AppConfig> {
    const path = join(this.projectHomeDir, 'config', 'app.json');

    if (!existsSync(path)) {
      // Create default config on first run
      const defaultConfig: AppConfig = {
        region: 'us-east-1',
        defaultModel: 'us.anthropic.claude-sonnet-4-6',
        invokeModel: 'us.amazon.nova-2-lite-v1:0',
        structureModel: 'us.amazon.nova-micro-v1:0',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        templateVariables: [...DEFAULT_TEMPLATE_VARIABLES],
      };

      await this.saveAppConfig(defaultConfig);
      return defaultConfig;
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);

    // Migrate: add defaults for new required fields
    if (!data.invokeModel) data.invokeModel = 'us.amazon.nova-2-lite-v1:0';
    if (!data.structureModel) data.structureModel = 'us.amazon.nova-micro-v1:0';
    if (!data.systemPrompt) {
      data.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      if (!data.templateVariables?.some((v: any) => v.key === 'AGENT_NAME')) {
        data.templateVariables = [
          ...(data.templateVariables || []),
          ...DEFAULT_TEMPLATE_VARIABLES,
        ];
      }
      await this.saveAppConfig(data);
    }

    validator.validateAppConfig(data);
    return data;
  }

  /**
   * Save application configuration
   */
  async saveAppConfig(config: AppConfig): Promise<void> {
    validator.validateAppConfig(config);

    const path = join(this.projectHomeDir, 'config', 'app.json');
    await mkdir(join(this.projectHomeDir, 'config'), { recursive: true });
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Load plugin provider overrides
   */
  async loadPluginOverrides(): Promise<PluginOverrides> {
    const path = join(this.projectHomeDir, 'config', 'plugin-overrides.json');
    if (!existsSync(path)) return {};
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save plugin provider overrides
   */
  async savePluginOverrides(overrides: PluginOverrides): Promise<void> {
    const configDir = join(this.projectHomeDir, 'config');
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
    const path = join(this.projectHomeDir, 'agents', slug, 'agent.json');

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
    // Use provided slug or generate from name
    const slug =
      (spec as any).slug?.trim() ||
      spec.name
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

    const { slug: _s, ...cleanSpec } = spec as any;
    await this.saveAgent(slug, cleanSpec);
    return { slug, spec: cleanSpec };
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
      workflowWarnings,
      ...cleanUpdates
    } = updates as Partial<AgentSpec> & {
      slug?: string;
      updatedAt?: string;
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
    const agentDir = join(this.projectHomeDir, 'agents', slug);

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

    const agentDir = join(this.projectHomeDir, 'agents', slug);
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
    const agentsDir = join(this.projectHomeDir, 'agents');

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

        // Plugin agents use 'pluginName:agentSlug' format
        const pluginName = entry.name.includes(':')
          ? entry.name.split(':')[0]
          : undefined;

        agents.push({
          slug: entry.name,
          name: spec.name,
          model: spec.model,
          updatedAt: stats.mtime.toISOString(),
          description: spec.prompt,
          plugin: pluginName,
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
    const workflowsDir = join(this.projectHomeDir, 'agents', slug, 'workflows');

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

    const workflowsDir = join(this.projectHomeDir, 'agents', slug, 'workflows');
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
      this.projectHomeDir,
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
      this.projectHomeDir,
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
      this.projectHomeDir,
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
  async loadIntegration(id: string): Promise<ToolDef> {
    const path = join(
      this.projectHomeDir,
      'integrations',
      id,
      'integration.json',
    );

    if (!existsSync(path)) {
      throw new Error(`Tool '${id}' not found at ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    return data;
  }

  /**
   * Build a resolved env map for an integration using the resolution chain:
   * legacy toolDef.env → plugin.json env defaults → agent-level tools.env overrides
   * Then validate toolDef.requiredEnv — warn on missing but don't throw.
   */
  async resolveEnvForIntegration(
    pluginDir: string,
    agentSpec: AgentSpec,
    toolDef: ToolDef,
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};

    // 1. Legacy: toolDef.env as base values
    if (toolDef.env) {
      Object.assign(resolved, toolDef.env);
    }

    // 2. Plugin.json env schema defaults
    const manifestPath = join(pluginDir, 'plugin.json');
    let pluginName: string | undefined;
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        pluginName = manifest.name;
        for (const [key, def] of Object.entries(manifest.env ?? {})) {
          const envDef = def as { default?: string };
          if (envDef.default !== undefined && !(key in resolved)) {
            resolved[key] = envDef.default;
          }
        }
      } catch (error) {
        logger.warn('Failed to read plugin.json env schema', {
          pluginDir,
          error,
        });
      }
    }

    // 3. Host config store (user-set values from install or settings UI)
    if (pluginName) {
      try {
        const overrides = await this.loadPluginOverrides();
        const pluginEnv = overrides[pluginName]?.env;
        if (pluginEnv) {
          Object.assign(resolved, pluginEnv);
        }
      } catch {}
    }

    // 4. Agent-level tools.env overrides
    if (agentSpec.tools?.env) {
      Object.assign(resolved, agentSpec.tools.env);
    }

    // 5. Validate requiredEnv
    if (toolDef.requiredEnv) {
      for (const key of toolDef.requiredEnv) {
        if (!(key in resolved)) {
          logger.warn('Missing required env var for integration', {
            integration: toolDef.id,
            key,
          });
        }
      }
    }

    return resolved;
  }

  /**
   * Save tool definition
   */
  async saveIntegration(id: string, def: ToolDef): Promise<void> {
    validator.validateToolDef(def);

    const integrationDir = join(this.projectHomeDir, 'integrations', id);
    await mkdir(integrationDir, { recursive: true });

    const path = join(integrationDir, 'integration.json');
    await writeFile(path, JSON.stringify(def, null, 2), 'utf-8');
  }

  async deleteIntegration(id: string): Promise<void> {
    const integrationDir = join(this.projectHomeDir, 'integrations', id);
    if (existsSync(integrationDir)) {
      await rm(integrationDir, { recursive: true, force: true });
    }
  }

  /**
   * List all tools in catalog.
   * If plugin.json has an explicit `integrations` array, read those paths.
   * Otherwise fall back to scanning the integrations/ directory.
   */
  async listIntegrations(): Promise<ToolMetadata[]> {
    // Try plugin.json explicit integrations list first
    const manifestPath = join(this.projectHomeDir, 'plugin.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        if (Array.isArray(manifest.integrations)) {
          return this.loadIntegrationsFromPaths(manifest.integrations);
        }
      } catch (error) {
        logger.warn('Failed to read plugin.json for integrations list', {
          error,
        });
      }
    }

    // Fall back to directory scan
    return this.scanIntegrationsDir();
  }

  private async loadIntegrationsFromPaths(
    paths: string[],
  ): Promise<ToolMetadata[]> {
    const tools: ToolMetadata[] = [];
    for (const relPath of paths) {
      const fullPath = join(this.projectHomeDir, relPath);
      if (!existsSync(fullPath)) {
        logger.warn('Integration path from plugin.json not found', {
          path: relPath,
        });
        continue;
      }
      try {
        const content = await readFile(fullPath, 'utf-8');
        const def: ToolDef = JSON.parse(content);
        tools.push({
          id: def.id,
          kind: def.kind,
          displayName: def.displayName,
          description: def.description,
          transport: def.transport,
          source: def.command || def.endpoint,
        });
      } catch (error) {
        logger.error('Failed to load integration from path', {
          path: relPath,
          error,
        });
      }
    }
    return tools;
  }

  private async scanIntegrationsDir(): Promise<ToolMetadata[]> {
    const integrationsDir = join(this.projectHomeDir, 'integrations');
    if (!existsSync(integrationsDir)) return [];

    const entries = await readdir(integrationsDir, { withFileTypes: true });
    const tools: ToolMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const integrationPath = join(
        integrationsDir,
        entry.name,
        'integration.json',
      );
      if (!existsSync(integrationPath)) continue;

      try {
        const def = await this.loadIntegration(entry.name);
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
    const agentsDir = join(this.projectHomeDir, 'agents');
    const map: Record<string, string[]> = {};
    if (!existsSync(agentsDir)) return map;

    const entries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const spec = await this.loadAgent(entry.name);
        for (const mcpEntry of spec.tools?.mcpServers || []) {
          const toolId = typeof mcpEntry === 'string' ? mcpEntry : mcpEntry.id;
          if (!map[toolId]) map[toolId] = [];
          map[toolId].push(spec.name || entry.name);
        }
      } catch (e) {
        logger.debug('Failed to load agent for tool map', {
          agent: entry.name,
          error: e,
        });
        /* skip broken agents */
      }
    }
    return map;
  }

  /**
   * Load layout configuration
   */
  async loadLayout(slug: string): Promise<StandaloneLayoutConfig> {
    const path = join(this.projectHomeDir, 'layouts', slug, 'layout.json');

    if (!existsSync(path)) {
      throw new Error(`Layout '${slug}' not found at ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);
    validator.validateLayoutConfig(data);

    // Validate agent references
    for (const tab of data.tabs || []) {
      for (const prompt of tab.prompts || []) {
        if (prompt.agent && !(await this.agentExists(prompt.agent))) {
          throw new Error(
            `Layout '${slug}' tab '${tab.id}' references non-existent agent '${prompt.agent}'`,
          );
        }
      }
    }

    return data;
  }

  /**
   * List all layouts
   */
  async listLayouts(): Promise<StandaloneLayoutMetadata[]> {
    const layoutsDir = join(this.projectHomeDir, 'layouts');

    if (!existsSync(layoutsDir)) {
      return [];
    }

    const entries = await readdir(layoutsDir, { withFileTypes: true });
    const layouts: StandaloneLayoutMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const layoutPath = join(layoutsDir, entry.name, 'layout.json');
      if (!existsSync(layoutPath)) continue;

      try {
        const config = await this.loadLayout(entry.name);
        layouts.push({
          slug: config.slug,
          name: config.name,
          icon: config.icon,
          description: config.description,
          plugin: config.plugin,
          tabCount: config.tabs?.length || 0,
        });
      } catch (error) {
        logger.error('Failed to load layout', {
          layout: entry.name,
          error,
        });
      }
    }

    return layouts.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Create a new layout
   */
  async createLayout(config: StandaloneLayoutConfig): Promise<void> {
    validator.validateLayoutConfig(config);

    if (await this.layoutExists(config.slug)) {
      throw new Error(`Layout with slug '${config.slug}' already exists`);
    }

    await this.saveLayout(config.slug, config);
  }

  /**
   * Update an existing layout
   */
  async updateLayout(
    slug: string,
    updates: Partial<StandaloneLayoutConfig>,
  ): Promise<StandaloneLayoutConfig> {
    const existing = await this.loadLayout(slug);
    const updated = { ...existing, ...updates };
    await this.saveLayout(slug, updated);
    return updated;
  }

  /**
   * Delete a layout
   */
  async deleteLayout(slug: string): Promise<void> {
    const layoutDir = join(this.projectHomeDir, 'layouts', slug);

    if (!existsSync(layoutDir)) {
      throw new Error(`Layout '${slug}' not found`);
    }

    await rm(layoutDir, { recursive: true, force: true });
  }

  /**
   * Save layout configuration
   */
  async saveLayout(
    slug: string,
    config: StandaloneLayoutConfig,
  ): Promise<void> {
    validator.validateLayoutConfig(config);

    const layoutDir = join(this.projectHomeDir, 'layouts', slug);
    await mkdir(layoutDir, { recursive: true });

    const path = join(layoutDir, 'layout.json');
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Get all layouts that reference a specific agent
   */
  async getLayoutsUsingAgent(agentSlug: string): Promise<string[]> {
    const layouts = await this.listLayouts();
    const using: string[] = [];

    for (const layout of layouts) {
      try {
        const config = await this.loadLayout(layout.slug);

        // Check tab prompts
        const hasTabRef = config.tabs.some((tab) =>
          tab.prompts?.some((p) => p.agent === agentSlug),
        );

        if (hasTabRef) {
          using.push(layout.slug);
        }
      } catch (error) {
        logger.error('Error checking layout', { layout: layout.slug, error });
      }
    }

    return using;
  }

  /**
   * Check if agent exists
   */
  async agentExists(slug: string): Promise<boolean> {
    const path = join(this.projectHomeDir, 'agents', slug, 'agent.json');
    return existsSync(path);
  }

  /**
   * Check if layout exists
   */
  async layoutExists(slug: string): Promise<boolean> {
    const path = join(this.projectHomeDir, 'layouts', slug, 'layout.json');
    return existsSync(path);
  }

  /**
   * Check if tool exists
   */
  async toolExists(id: string): Promise<boolean> {
    const path = join(
      this.projectHomeDir,
      'integrations',
      id,
      'integration.json',
    );
    return existsSync(path);
  }

  /**
   * Set up file watcher for configuration changes
   */
  private setupFileWatcher(): void {
    const patterns = [
      join(this.projectHomeDir, 'config', '*.json'),
      join(this.projectHomeDir, 'agents', '*', 'agent.json'),
      join(this.projectHomeDir, 'integrations', '*', 'integration.json'),
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

  // ── Skills ──────────────────────────────────────────────

  /**
   * List installed skills by scanning skill.json files
   */
  async listSkills(): Promise<SkillConfig[]> {
    const dir = join(this.projectHomeDir, 'skills');
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const results: SkillConfig[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const cfgPath = join(dir, entry.name, 'skill.json');
      if (!existsSync(cfgPath)) continue;
      try {
        results.push(JSON.parse(await readFile(cfgPath, 'utf-8')));
      } catch {
        logger.warn('Failed to read skill config', { path: cfgPath });
      }
    }
    return results;
  }

  /**
   * Load a single skill config
   */
  async loadSkill(name: string): Promise<SkillConfig> {
    const path = join(this.projectHomeDir, 'skills', name, 'skill.json');
    if (!existsSync(path)) throw new Error(`Skill '${name}' not found`);
    return JSON.parse(await readFile(path, 'utf-8'));
  }

  /**
   * Save a skill config
   */
  async saveSkill(name: string, config: SkillConfig): Promise<void> {
    const dir = join(this.projectHomeDir, 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'skill.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }

  /**
   * Delete a skill directory
   */
  async deleteSkill(name: string): Promise<void> {
    const dir = join(this.projectHomeDir, 'skills', name);
    if (!existsSync(dir)) throw new Error(`Skill '${name}' not found`);
    await rm(dir, { recursive: true, force: true });
  }

  /**
   * Check if a skill exists
   */
  async skillExists(name: string): Promise<boolean> {
    return existsSync(join(this.projectHomeDir, 'skills', name, 'skill.json'));
  }

  /**
   * Load ACP configuration (connections to external agents)
   */
  async loadACPConfig(): Promise<ACPConfig> {
    const path = join(this.projectHomeDir, 'config', 'acp.json');
    if (!existsSync(path)) return { connections: [] };
    return JSON.parse(await readFile(path, 'utf-8'));
  }

  /**
   * Save ACP configuration
   */
  async saveACPConfig(config: ACPConfig): Promise<void> {
    const path = join(this.projectHomeDir, 'config', 'acp.json');
    await mkdir(join(this.projectHomeDir, 'config'), { recursive: true });
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
