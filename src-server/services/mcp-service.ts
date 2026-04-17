/**
 * MCP Service - handles MCP tool management and connection status
 */

type MCPConfiguration = any;
type Tool<_T = any> = any;

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { AgentSpec, ToolDef, ToolMetadata } from '../domain/types.js';
import { mcpLifecycle } from '../telemetry/metrics.js';

// Type extensions for MCP service
interface MCPConfigurationWithClose extends MCPConfiguration {
  close?: () => Promise<void>;
}

export interface MCPConnectionStatus {
  connected: boolean;
  error?: string;
}

export interface IntegrationMetadata {
  type: string;
  transport?: string;
  toolCount?: number;
}

export interface ToolInfo {
  id: string;
  name: string;
  originalName: string;
  server: string | null;
  toolName: string;
  description?: string;
  parameters?: any;
}

export class MCPService {
  constructor(
    private configLoader: ConfigLoader,
    private mcpConfigs: Map<string, MCPConfiguration>,
    private mcpConnectionStatus: Map<string, MCPConnectionStatus>,
    private integrationMetadata: Map<string, IntegrationMetadata>,
    private agentTools: Map<string, Tool<any>[]>,
    private toolNameMapping: Map<
      string,
      {
        original: string;
        normalized: string;
        server: string | null;
        tool: string;
      }
    >,
    private logger: any,
  ) {}

  async listIntegrations(): Promise<ToolMetadata[]> {
    return this.configLoader.listIntegrations();
  }

  async getToolAgentMap(): Promise<Record<string, string[]>> {
    return this.configLoader.getToolAgentMap();
  }

  async saveIntegration(def: ToolDef): Promise<void> {
    await this.configLoader.saveIntegration(def.id, def);
  }

  async getIntegration(id: string): Promise<ToolDef> {
    return this.configLoader.loadIntegration(id);
  }

  async deleteIntegration(id: string): Promise<void> {
    await this.configLoader.deleteIntegration(id);
  }

  getAgentTools(slug: string): ToolInfo[] {
    const tools = this.agentTools.get(slug) || [];
    return tools.map((tool: Tool<any> & { description?: string }) => {
      const mapping = this.toolNameMapping.get(tool.name);

      // Convert Zod schema to JSON schema if parameters is a Zod object
      let parameters = tool.parameters;
      if (
        parameters &&
        typeof parameters === 'object' &&
        '_def' in parameters
      ) {
        try {
          parameters = zodToJsonSchema(parameters);
        } catch (error) {
          this.logger.warn('Failed to convert Zod schema to JSON schema', {
            tool: tool.name,
            error,
          });
        }
      }

      return {
        id: tool.id || tool.name,
        name: tool.name,
        originalName: mapping?.original || tool.name,
        server: mapping?.server || null,
        toolName: mapping?.tool || tool.name,
        description: tool.description,
        parameters,
      };
    });
  }

  async addToolToAgent(slug: string, toolId: string): Promise<string[]> {
    const agent = await this.configLoader.loadAgent(slug);
    const tools = agent.tools || { mcpServers: [], available: ['*'] };

    if (
      !tools.mcpServers.some(
        (e) => (typeof e === 'string' ? e : e.id) === toolId,
      )
    ) {
      tools.mcpServers.push(toolId);
    }

    await this.configLoader.updateAgent(slug, { tools });
    return tools.mcpServers.map((e) => (typeof e === 'string' ? e : e.id));
  }

  async removeToolFromAgent(slug: string, toolId: string): Promise<void> {
    const agent = await this.configLoader.loadAgent(slug);
    const tools = agent.tools || { mcpServers: [] };

    tools.mcpServers = tools.mcpServers.filter(
      (e) => (typeof e === 'string' ? e : e.id) !== toolId,
    );

    await this.configLoader.updateAgent(slug, { tools });
  }

  async updateAllowedTools(
    slug: string,
    allowed: string[],
  ): Promise<AgentSpec['tools']> {
    const agent = await this.configLoader.loadAgent(slug);
    const tools = agent.tools || { mcpServers: [] };

    tools.available = allowed;

    await this.configLoader.updateAgent(slug, { tools });
    return tools;
  }

  async updateToolAliases(
    slug: string,
    aliases: Record<string, string>,
  ): Promise<AgentSpec['tools']> {
    const agent = await this.configLoader.loadAgent(slug);
    const tools = agent.tools || { mcpServers: [] };

    tools.aliases = aliases;

    await this.configLoader.updateAgent(slug, { tools });
    return tools;
  }

  getConnectionStatus(
    agentSlug: string,
    toolId: string,
  ): MCPConnectionStatus | undefined {
    const key = `${agentSlug}:${toolId}`;
    return this.mcpConnectionStatus.get(key);
  }

  getIntegrationMetadata(
    agentSlug: string,
    toolId: string,
  ): IntegrationMetadata | undefined {
    const key = `${agentSlug}:${toolId}`;
    return this.integrationMetadata.get(key);
  }

  async cleanupAgentMCPConfigs(agentSlug: string): Promise<void> {
    for (const [key, config] of this.mcpConfigs.entries()) {
      if (key.startsWith(`${agentSlug}:`)) {
        await (config as MCPConfigurationWithClose).close?.();
        mcpLifecycle.add(1, {
          event: 'disconnect',
          server: key.slice(agentSlug.length + 1),
        });
        this.mcpConfigs.delete(key);
        this.mcpConnectionStatus.delete(key);
        this.integrationMetadata.delete(key);
      }
    }
  }
}
