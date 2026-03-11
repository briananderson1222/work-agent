/**
 * Layout Service - handles layout CRUD operations
 */

import type { ConfigLoader } from '../domain/config-loader.js';
import { layoutOps } from '../telemetry/metrics.js';
import type {
  StandaloneLayoutConfig,
  StandaloneLayoutMetadata,
  WorkflowMetadata,
} from '../domain/types.js';

export class LayoutService {
  constructor(
    private configLoader: ConfigLoader,
    _logger: any,
  ) {}

  async listLayouts(): Promise<StandaloneLayoutMetadata[]> {
    return this.configLoader.listLayouts();
  }

  async getLayout(slug: string): Promise<StandaloneLayoutConfig> {
    return this.configLoader.loadLayout(slug);
  }

  async createLayout(config: StandaloneLayoutConfig): Promise<StandaloneLayoutConfig> {
    await this.configLoader.createLayout(config);
    layoutOps.add(1, { op: 'create' });
    return config;
  }

  async updateLayout(
    slug: string,
    updates: Partial<StandaloneLayoutConfig>,
  ): Promise<StandaloneLayoutConfig> {
    const result = await this.configLoader.updateLayout(slug, updates);
    layoutOps.add(1, { op: 'update' });
    return result;
  }

  async deleteLayout(slug: string): Promise<void> {
    await this.configLoader.deleteLayout(slug);
    layoutOps.add(1, { op: 'delete' });
  }

  // Workflow management (workflows are per-agent but related to layout functionality)
  async listAgentWorkflows(agentSlug: string): Promise<WorkflowMetadata[]> {
    return this.configLoader.listAgentWorkflows(agentSlug);
  }

  async getWorkflow(agentSlug: string, workflowId: string): Promise<string> {
    return this.configLoader.readWorkflow(agentSlug, workflowId);
  }

  async createWorkflow(
    agentSlug: string,
    filename: string,
    content: string,
  ): Promise<void> {
    await this.configLoader.createWorkflow(agentSlug, filename, content);
  }

  async updateWorkflow(
    agentSlug: string,
    workflowId: string,
    content: string,
  ): Promise<void> {
    await this.configLoader.updateWorkflow(agentSlug, workflowId, content);
  }

  async deleteWorkflow(agentSlug: string, workflowId: string): Promise<void> {
    await this.configLoader.deleteWorkflow(agentSlug, workflowId);
  }
}
