/**
 * Configuration loader for reading and watching .stallion-ai/ files
 */

import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ACPConfig } from '@stallion-ai/contracts/acp';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { PluginOverrides } from '@stallion-ai/contracts/plugin';
import type { ToolDef, ToolMetadata } from '@stallion-ai/contracts/tool';
import { type FSWatcher, watch } from 'chokidar';
import { createLogger } from '../utils/logger.js';
import { resolveHomeDir } from '../utils/paths.js';
import {
  agentConfigExists,
  createAgentConfig,
  createAgentWorkflow,
  deleteAgentConfig,
  deleteAgentWorkflow,
  getAgentToolMap,
  listAgentConfigs,
  listAgentWorkflowMetadata,
  loadAgentConfig,
  readAgentWorkflow,
  saveAgentConfig,
  updateAgentConfig,
  updateAgentWorkflow,
} from './config-loader-agents.js';
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
  async loadAgent(slug: string) {
    return loadAgentConfig(this.projectHomeDir, slug);
  }

  /**
   * Create a new agent (generates slug from name)
   */
  async createAgent(spec: Parameters<typeof createAgentConfig>[1]) {
    return createAgentConfig(this.projectHomeDir, spec);
  }

  /**
   * Update an existing agent
   */
  async updateAgent(
    slug: string,
    updates: Parameters<typeof updateAgentConfig>[2],
  ) {
    return updateAgentConfig(this.projectHomeDir, slug, updates);
  }

  /**
   * Delete an agent and all its data
   */
  async deleteAgent(slug: string): Promise<void> {
    await deleteAgentConfig(this.projectHomeDir, slug);
  }

  /**
   * Save agent specification
   */
  async saveAgent(slug: string, spec: Parameters<typeof saveAgentConfig>[2]): Promise<void> {
    await saveAgentConfig(this.projectHomeDir, slug, spec);
  }

  /**
   * List all agents
   */
  async listAgents() {
    return listAgentConfigs(this.projectHomeDir);
  }

  async listAgentWorkflows(slug: string) {
    return listAgentWorkflowMetadata(this.projectHomeDir, slug);
  }

  /**
   * Create a new workflow file
   */
  async createWorkflow(
    slug: string,
    filename: string,
    content: string,
  ): Promise<void> {
    await createAgentWorkflow(this.projectHomeDir, slug, filename, content);
  }

  /**
   * Read workflow file content
   */
  async readWorkflow(slug: string, workflowId: string): Promise<string> {
    return readAgentWorkflow(this.projectHomeDir, slug, workflowId);
  }

  /**
   * Update an existing workflow file
   */
  async updateWorkflow(
    slug: string,
    workflowId: string,
    content: string,
  ): Promise<void> {
    await updateAgentWorkflow(this.projectHomeDir, slug, workflowId, content);
  }

  /**
   * Delete a workflow file
   */
  async deleteWorkflow(slug: string, workflowId: string): Promise<void> {
    await deleteAgentWorkflow(this.projectHomeDir, slug, workflowId);
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
   * List all tools in catalog
   */
  async listIntegrations(): Promise<ToolMetadata[]> {
    const integrationsDir = join(this.projectHomeDir, 'integrations');

    if (!existsSync(integrationsDir)) {
      return [];
    }

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
    return getAgentToolMap(this.projectHomeDir);
  }

  /**
   * Check if agent exists
   */
  async agentExists(slug: string): Promise<boolean> {
    return agentConfigExists(this.projectHomeDir, slug);
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
