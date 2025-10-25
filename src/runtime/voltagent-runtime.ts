/**
 * VoltAgent runtime integration for Work Agent
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { Agent, Memory, VoltAgent, MCPConfiguration, type Tool } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { createPinoLogger } from '@voltagent/logger';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { cors } from 'hono/cors';
import { FileVoltAgentMemoryAdapter } from '../adapters/file/voltagent-memory-adapter.js';
import { ConfigLoader } from '../domain/config-loader.js';
import type { AgentSpec, ToolDef, AppConfig } from '../domain/types.js';

export interface WorkAgentRuntimeOptions {
  workAgentDir?: string;
  port?: number;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

/**
 * Main runtime for Work Agent system
 * Manages VoltAgent instances with dynamic agent loading
 */
export class WorkAgentRuntime {
  private configLoader: ConfigLoader;
  private appConfig!: AppConfig;
  private logger: ReturnType<typeof createPinoLogger>;
  private voltAgent?: VoltAgent;
  private mcpConfigs: Map<string, MCPConfiguration> = new Map();
  private activeAgents: Map<string, Agent> = new Map();
  private port: number;

  constructor(options: WorkAgentRuntimeOptions = {}) {
    const workAgentDir = options.workAgentDir || '.work-agent';
    this.port = options.port || 3141;

    this.configLoader = new ConfigLoader({
      workAgentDir,
      watchFiles: true,
    });

    this.logger = createPinoLogger({
      name: 'work-agent',
      level: options.logLevel || 'info',
    });
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Work Agent Runtime...');

    // Load app configuration
    this.appConfig = await this.configLoader.loadAppConfig();
    this.logger.info({ region: this.appConfig.region, model: this.appConfig.defaultModel }, 'App config loaded');

    // Load all agents
    const agentMetadataList = await this.configLoader.listAgents();
    this.logger.info({ count: agentMetadataList.length }, 'Found agents');

    // Create VoltAgent instances for each agent
    const agents: Record<string, Agent> = {};

    for (const meta of agentMetadataList) {
      try {
        const agent = await this.createVoltAgentInstance(meta.slug);
        agents[meta.slug] = agent;
        this.activeAgents.set(meta.slug, agent);
        this.logger.info({ agent: meta.slug }, 'Agent loaded');
      } catch (error) {
        this.logger.error({ agent: meta.slug, error }, 'Failed to load agent');
      }
    }

    // Initialize VoltAgent with all agents and server
    this.voltAgent = new VoltAgent({
      agents,
      logger: this.logger,
      server: honoServer({
        port: this.port,
        cors: {
          origin: (origin) => {
            // Allow any localhost port in development
            if (origin?.startsWith('http://localhost:') || origin?.startsWith('https://localhost:')) {
              return true;
            }
            // In production, check against whitelist from environment
            const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
            return allowed.includes(origin || '');
          },
          credentials: true,
        },
      }),
    });

    this.logger.info({ port: this.port }, 'Work Agent Runtime initialized');
  }

  /**
   * Create a VoltAgent Agent instance from agent spec
   */
  private async createVoltAgentInstance(agentSlug: string): Promise<Agent> {
    // Load agent spec
    const spec = await this.configLoader.loadAgent(agentSlug);

    // Create Bedrock provider
    const model = this.createBedrockModel(spec);

    // Create memory adapter
    const memory = new Memory({
      storage: new FileVoltAgentMemoryAdapter({
        workAgentDir: this.configLoader.getWorkAgentDir(),
      }),
    });

    // Load and configure tools (including MCP)
    const tools = await this.loadAgentTools(agentSlug, spec);

    // Create Agent instance
    const agent = new Agent({
      name: agentSlug,
      instructions: spec.prompt,
      model,
      memory,
      tools,
      ...(spec.guardrails && {
        temperature: spec.guardrails.temperature,
        maxOutputTokens: spec.guardrails.maxTokens,
        topP: spec.guardrails.topP,
      }),
    });

    return agent;
  }

  /**
   * Create Bedrock model instance
   */
  private createBedrockModel(spec: AgentSpec) {
    const model = spec.model || this.appConfig.defaultModel;
    const region = spec.region || this.appConfig.region;

    const bedrock = createAmazonBedrock({
      region,
      credentialProvider: fromNodeProviderChain(),
    });

    return bedrock(model);
  }

  /**
   * Load tools for an agent (regular tools + MCP tools)
   */
  private async loadAgentTools(agentSlug: string, spec: AgentSpec): Promise<Tool<any>[]> {
    const tools: Tool<any>[] = [];

    if (!spec.tools || !spec.tools.use || spec.tools.use.length === 0) {
      return tools;
    }

    // Load each tool from catalog
    for (const toolId of spec.tools.use) {
      try {
        const toolDef = await this.configLoader.loadTool(toolId);

        if (toolDef.kind === 'mcp') {
          // Create MCP configuration for this tool
          const mcpTools = await this.createMCPTools(agentSlug, toolId, toolDef);
          tools.push(...mcpTools);
        } else if (toolDef.kind === 'builtin') {
          // Create built-in tool
          const builtinTool = this.createBuiltinTool(toolDef);
          if (builtinTool) {
            tools.push(builtinTool);
          }
        }
      } catch (error) {
        this.logger.error({ agent: agentSlug, toolId, error }, 'Failed to load tool');
      }
    }

    // Apply allow-list filtering if specified
    if (spec.tools.allowed && !spec.tools.allowed.includes('*')) {
      const allowedSet = new Set(spec.tools.allowed);
      return tools.filter(tool => allowedSet.has(tool.name));
    }

    return tools;
  }

  /**
   * Create MCP tools for a tool definition
   */
  private async createMCPTools(
    agentSlug: string,
    toolId: string,
    toolDef: ToolDef
  ): Promise<Tool<any>[]> {
    const mcpKey = `${agentSlug}:${toolId}`;

    // Check if MCP config already exists
    if (this.mcpConfigs.has(mcpKey)) {
      const mcpConfig = this.mcpConfigs.get(mcpKey)!;
      return await mcpConfig.getTools();
    }

    // Create new MCP configuration
    const serverConfig: any = {
      [toolId]: this.createMCPServerConfig(toolDef),
    };

    const mcpConfig = new MCPConfiguration({
      servers: serverConfig,
    });

    this.mcpConfigs.set(mcpKey, mcpConfig);

    // Get tools from MCP server
    const tools = await mcpConfig.getTools();

    this.logger.info(
      { agent: agentSlug, tool: toolId, count: tools.length },
      'MCP tools loaded'
    );

    return tools;
  }

  /**
   * Create MCP server configuration from tool definition
   */
  private createMCPServerConfig(toolDef: ToolDef): any {
    if (toolDef.transport === 'stdio' || toolDef.transport === 'process') {
      return {
        type: 'stdio',
        command: toolDef.command,
        args: toolDef.args || [],
        env: toolDef.env,
        timeout: toolDef.timeouts?.startupMs,
      };
    } else if (toolDef.transport === 'ws') {
      return {
        type: 'streamable-http',
        url: toolDef.endpoint,
        timeout: toolDef.timeouts?.startupMs,
      };
    } else if (toolDef.transport === 'tcp') {
      return {
        type: 'http',
        url: toolDef.endpoint,
        timeout: toolDef.timeouts?.startupMs,
      };
    }

    throw new Error(`Unsupported transport: ${toolDef.transport}`);
  }

  /**
   * Create a built-in tool from definition
   */
  private createBuiltinTool(toolDef: ToolDef): Tool<any> | null {
    // Built-in tools would be implemented here
    // For now, returning null as they need specific implementations
    this.logger.warn({ tool: toolDef.id }, 'Built-in tools not yet implemented');
    return null;
  }

  /**
   * Switch to a different agent (for CLI usage)
   */
  async switchAgent(targetSlug: string): Promise<Agent> {
    this.logger.info({ from: 'current', to: targetSlug }, 'Switching agent');

    // Check if agent already exists
    if (this.activeAgents.has(targetSlug)) {
      this.logger.info({ agent: targetSlug }, 'Agent already loaded');
      return this.activeAgents.get(targetSlug)!;
    }

    // Load new agent
    const agent = await this.createVoltAgentInstance(targetSlug);
    this.activeAgents.set(targetSlug, agent);

    this.logger.info({ agent: targetSlug }, 'Agent switched successfully');
    return agent;
  }

  /**
   * Get an agent by slug
   */
  getAgent(slug: string): Agent | undefined {
    return this.activeAgents.get(slug);
  }

  /**
   * List all loaded agents
   */
  listAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /**
   * Shutdown the runtime
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Work Agent Runtime...');

    // Disconnect all MCP configurations
    for (const [key, mcpConfig] of this.mcpConfigs.entries()) {
      try {
        await mcpConfig.disconnect();
        this.logger.info({ mcp: key }, 'MCP disconnected');
      } catch (error) {
        this.logger.error({ mcp: key, error }, 'Failed to disconnect MCP');
      }
    }

    this.mcpConfigs.clear();
    this.activeAgents.clear();

    // Dispose config loader
    await this.configLoader.dispose();

    this.logger.info('Shutdown complete');
  }
}
