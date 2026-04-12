/**
 * Configuration loader for reading and watching .stallion-ai/ files
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
import {
  loadAppConfigFile,
  saveAppConfigFile,
  updateAppConfigFile,
} from './config-loader-app.js';
import {
  deleteIntegrationConfig,
  deleteSkillConfig,
  listIntegrationMetadata,
  listSkillConfigs,
  loadACPConfigFile,
  loadIntegrationConfig,
  loadSkillConfig,
  type SkillConfigRecord,
  saveACPConfigFile,
  saveIntegrationConfig,
  saveSkillConfig,
  skillConfigExists,
} from './config-loader-storage.js';
import { validator } from './validator.js';

const logger = createLogger({ name: 'config-loader' });

export { DEFAULT_SYSTEM_PROMPT } from './config-loader-app.js';

export interface ConfigLoaderOptions {
  projectHomeDir?: string;
  watchFiles?: boolean;
}

export interface SkillConfig extends SkillConfigRecord {}

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
    return loadAppConfigFile(this.projectHomeDir);
  }

  /**
   * Save application configuration
   */
  async saveAppConfig(config: AppConfig): Promise<void> {
    await saveAppConfigFile(this.projectHomeDir, config);
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
    return updateAppConfigFile(this.projectHomeDir, updates);
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
  async saveAgent(
    slug: string,
    spec: Parameters<typeof saveAgentConfig>[2],
  ): Promise<void> {
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
    return loadIntegrationConfig(this.projectHomeDir, id);
  }

  /**
   * Save tool definition
   */
  async saveIntegration(id: string, def: ToolDef): Promise<void> {
    validator.validateToolDef(def);
    await saveIntegrationConfig(this.projectHomeDir, id, def);
  }

  async deleteIntegration(id: string): Promise<void> {
    await deleteIntegrationConfig(this.projectHomeDir, id);
  }

  /**
   * List all tools in catalog
   */
  async listIntegrations(): Promise<ToolMetadata[]> {
    return listIntegrationMetadata(this.projectHomeDir, logger);
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
    return listSkillConfigs(this.projectHomeDir, logger);
  }

  /**
   * Load a single skill config
   */
  async loadSkill(name: string): Promise<SkillConfig> {
    return loadSkillConfig(this.projectHomeDir, name);
  }

  /**
   * Save a skill config
   */
  async saveSkill(name: string, config: SkillConfig): Promise<void> {
    await saveSkillConfig(this.projectHomeDir, name, config);
  }

  /**
   * Delete a skill directory
   */
  async deleteSkill(name: string): Promise<void> {
    await deleteSkillConfig(this.projectHomeDir, name);
  }

  /**
   * Check if a skill exists
   */
  async skillExists(name: string): Promise<boolean> {
    return skillConfigExists(this.projectHomeDir, name);
  }

  /**
   * Load ACP configuration (connections to external agents)
   */
  async loadACPConfig(): Promise<ACPConfig> {
    return loadACPConfigFile(this.projectHomeDir);
  }

  /**
   * Save ACP configuration
   */
  async saveACPConfig(config: ACPConfig): Promise<void> {
    await saveACPConfigFile(this.projectHomeDir, config);
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
