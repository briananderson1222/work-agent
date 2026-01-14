/**
 * Workspace Service - handles workspace CRUD operations
 */

import type { ConfigLoader } from '../domain/config-loader.js';
import type { WorkspaceConfig, WorkspaceMetadata, WorkflowMetadata } from '../domain/types.js';

export class WorkspaceService {
  constructor(
    private configLoader: ConfigLoader,
    private logger: any
  ) {}

  async listWorkspaces(): Promise<WorkspaceMetadata[]> {
    return this.configLoader.listWorkspaces();
  }

  async getWorkspace(slug: string): Promise<WorkspaceConfig> {
    return this.configLoader.loadWorkspace(slug);
  }

  async createWorkspace(config: WorkspaceConfig): Promise<WorkspaceConfig> {
    await this.configLoader.createWorkspace(config);
    return config;
  }

  async updateWorkspace(slug: string, updates: Partial<WorkspaceConfig>): Promise<WorkspaceConfig> {
    return this.configLoader.updateWorkspace(slug, updates);
  }

  async deleteWorkspace(slug: string): Promise<void> {
    await this.configLoader.deleteWorkspace(slug);
  }

  // Workflow management (workflows are per-agent but related to workspace functionality)
  async listAgentWorkflows(agentSlug: string): Promise<WorkflowMetadata[]> {
    return this.configLoader.listAgentWorkflows(agentSlug);
  }

  async getWorkflow(agentSlug: string, workflowId: string): Promise<string> {
    return this.configLoader.readWorkflow(agentSlug, workflowId);
  }

  async createWorkflow(agentSlug: string, filename: string, content: string): Promise<void> {
    await this.configLoader.createWorkflow(agentSlug, filename, content);
  }

  async updateWorkflow(agentSlug: string, workflowId: string, content: string): Promise<void> {
    await this.configLoader.updateWorkflow(agentSlug, workflowId, content);
  }

  async deleteWorkflow(agentSlug: string, workflowId: string): Promise<void> {
    await this.configLoader.deleteWorkflow(agentSlug, workflowId);
  }
}
