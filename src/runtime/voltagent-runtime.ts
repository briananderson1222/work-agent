/**
 * VoltAgent runtime integration for Work Agent
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { Agent, Memory, VoltAgent, MCPConfiguration, type Tool } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { createPinoLogger } from '@voltagent/logger';
import { cors } from 'hono/cors';
import { FileVoltAgentMemoryAdapter } from '../adapters/file/voltagent-memory-adapter.js';
import { ConfigLoader } from '../domain/config-loader.js';
import { createBedrockProvider } from '../providers/bedrock.js';
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
    this.logger.info('App config loaded', {
      region: this.appConfig.region,
      model: this.appConfig.defaultModel,
    });

    // Load all agents
    const agentMetadataList = await this.configLoader.listAgents();
    this.logger.info('Found agents', { count: agentMetadataList.length });

    // Create VoltAgent instances for each agent
    const agents: Record<string, Agent> = {};

    for (const meta of agentMetadataList) {
      try {
        const agent = await this.createVoltAgentInstance(meta.slug);
        agents[meta.slug] = agent;
        this.activeAgents.set(meta.slug, agent);
        this.logger.info('Agent loaded', { agent: meta.slug });
      } catch (error) {
        this.logger.error('Failed to load agent', { agent: meta.slug, error });
      }
    }

    // Store agent metadata for enriching API responses
    const agentMetadataMap = new Map(
      agentMetadataList.map(meta => [meta.slug, meta])
    );

    // Initialize VoltAgent with all agents and server
    this.voltAgent = new VoltAgent({
      agents,
      logger: this.logger,
      server: honoServer({
        port: this.port,
        configureApp: (app) => {
          app.use(
            '*',
            cors({
              origin: (origin) => {
                if (!origin) return origin;
                if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
                  return origin;
                }
                const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
                return allowed.includes(origin) ? origin : null;
              },
              credentials: true,
            })
          );

          // Override /agents endpoint to include slug, pretty name, and UI metadata
          app.get('/agents', async (c) => {
            const coreAgents = await this.voltAgent!.getAgents();
            const enrichedAgents = coreAgents.map((agent: any) => {
              const metadata = agentMetadataMap.get(agent.id);  // agent.id is the slug
              return metadata ? {
                ...agent,
                slug: metadata.slug,
                name: metadata.name,  // Pretty name from spec
                updatedAt: metadata.updatedAt,
                ui: metadata.ui,
              } : agent;
            });
            return c.json({ success: true, data: enrichedAgents });
          });

          // === Agent CRUD Endpoints ===

          // Create new agent
          app.post('/agents', async (c) => {
            try {
              const body = await c.req.json();
              const { slug, spec } = await this.configLoader.createAgent(body);

              // Reload agents to include the new one
              await this.initialize();

              return c.json({ success: true, data: { slug, ...spec } }, 201);
            } catch (error: any) {
              this.logger.error('Failed to create agent', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Update existing agent
          app.put('/agents/:slug', async (c) => {
            try {
              const slug = c.req.param('slug');
              const updates = await c.req.json();

              const updated = await this.configLoader.updateAgent(slug, updates);

              // Reload agents to reflect changes
              await this.initialize();

              return c.json({ success: true, data: updated });
            } catch (error: any) {
              this.logger.error('Failed to update agent', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Delete agent
          app.delete('/agents/:slug', async (c) => {
            try {
              const slug = c.req.param('slug');

              // Drain agent if active
              if (this.activeAgents.has(slug)) {
                this.activeAgents.delete(slug);
              }

              await this.configLoader.deleteAgent(slug);

              // Reload agents
              await this.initialize();

              return c.json({ success: true }, 204);
            } catch (error: any) {
              this.logger.error('Failed to delete agent', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // === Tool Management Endpoints ===

          // List all tools
          app.get('/tools', async (c) => {
            try {
              const tools = await this.configLoader.listTools();
              return c.json({ success: true, data: tools });
            } catch (error: any) {
              this.logger.error('Failed to list tools', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Add tool to agent
          app.post('/agents/:slug/tools', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { toolId } = await c.req.json();

              const agent = await this.configLoader.loadAgent(slug);
              const tools = agent.tools || { use: [], allowed: ['*'] };

              if (!tools.use.includes(toolId)) {
                tools.use.push(toolId);
              }

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true, data: tools.use });
            } catch (error: any) {
              this.logger.error('Failed to add tool', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Remove tool from agent
          app.delete('/agents/:slug/tools/:toolId', async (c) => {
            try {
              const slug = c.req.param('slug');
              const toolId = c.req.param('toolId');

              const agent = await this.configLoader.loadAgent(slug);
              const tools = agent.tools || { use: [] };

              tools.use = tools.use.filter(id => id !== toolId);

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true }, 204);
            } catch (error: any) {
              this.logger.error('Failed to remove tool', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Update tool allow-list
          app.put('/agents/:slug/tools/allowed', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { allowed } = await c.req.json();

              const agent = await this.configLoader.loadAgent(slug);
              const tools = agent.tools || { use: [] };

              tools.allowed = allowed;

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true, data: tools });
            } catch (error: any) {
              this.logger.error('Failed to update allow-list', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Update tool aliases
          app.put('/agents/:slug/tools/aliases', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { aliases } = await c.req.json();

              const agent = await this.configLoader.loadAgent(slug);
              const tools = agent.tools || { use: [] };

              tools.aliases = aliases;

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true, data: tools });
            } catch (error: any) {
              this.logger.error('Failed to update aliases', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // === Workflow File Management Endpoints ===

          // List workflow files for agent
          app.get('/agents/:slug/workflows/files', async (c) => {
            try {
              const slug = c.req.param('slug');
              const workflows = await this.configLoader.listAgentWorkflows(slug);
              return c.json({ success: true, data: workflows });
            } catch (error: any) {
              this.logger.error('Failed to list workflows', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Get workflow file content
          app.get('/agents/:slug/workflows/:workflowId', async (c) => {
            try {
              const slug = c.req.param('slug');
              const workflowId = c.req.param('workflowId');
              const content = await this.configLoader.readWorkflow(slug, workflowId);
              return c.json({ success: true, data: { content } });
            } catch (error: any) {
              this.logger.error('Failed to read workflow', { error });
              return c.json({ success: false, error: error.message }, 404);
            }
          });

          // Create workflow file
          app.post('/agents/:slug/workflows', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { filename, content } = await c.req.json();

              await this.configLoader.createWorkflow(slug, filename, content);

              return c.json({ success: true, data: { filename } }, 201);
            } catch (error: any) {
              this.logger.error('Failed to create workflow', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Update workflow file
          app.put('/agents/:slug/workflows/:workflowId', async (c) => {
            try {
              const slug = c.req.param('slug');
              const workflowId = c.req.param('workflowId');
              const { content } = await c.req.json();

              await this.configLoader.updateWorkflow(slug, workflowId, content);

              return c.json({ success: true });
            } catch (error: any) {
              this.logger.error('Failed to update workflow', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // Delete workflow file
          app.delete('/agents/:slug/workflows/:workflowId', async (c) => {
            try {
              const slug = c.req.param('slug');
              const workflowId = c.req.param('workflowId');

              await this.configLoader.deleteWorkflow(slug, workflowId);

              return c.json({ success: true }, 204);
            } catch (error: any) {
              this.logger.error('Failed to delete workflow', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // === App Configuration Endpoints ===

          // Get app config
          app.get('/config/app', async (c) => {
            try {
              const config = await this.configLoader.loadAppConfig();
              return c.json({ success: true, data: config });
            } catch (error: any) {
              this.logger.error('Failed to load app config', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Update app config
          app.put('/config/app', async (c) => {
            try {
              const updates = await c.req.json();
              const updated = await this.configLoader.updateAppConfig(updates);

              // Note: Some config changes require restart to take effect
              this.logger.info('App config updated', { config: updated });

              return c.json({ success: true, data: updated });
            } catch (error: any) {
              this.logger.error('Failed to update app config', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });
        },
      }),
    });

    this.logger.info('Work Agent Runtime initialized', { port: this.port });
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
      name: agentSlug,  // Use slug for routing
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
    return createBedrockProvider({
      appConfig: this.appConfig,
      agentSpec: spec,
    });
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
        this.logger.error('Failed to load tool', { agent: agentSlug, toolId, error });
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

    this.logger.info('MCP tools loaded', { agent: agentSlug, tool: toolId, count: tools.length });

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
    this.logger.warn('Built-in tools not yet implemented', { tool: toolDef.id });
    return null;
  }

  /**
   * Switch to a different agent (for CLI usage)
   */
  async switchAgent(targetSlug: string): Promise<Agent> {
    this.logger.info('Switching agent', { from: 'current', to: targetSlug });

    // Check if agent already exists
    if (this.activeAgents.has(targetSlug)) {
      this.logger.info('Agent already loaded', { agent: targetSlug });
      return this.activeAgents.get(targetSlug)!;
    }

    // Load new agent
    const agent = await this.createVoltAgentInstance(targetSlug);
    this.activeAgents.set(targetSlug, agent);

    this.logger.info('Agent switched successfully', { agent: targetSlug });
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
        this.logger.info('MCP disconnected', { mcp: key });
      } catch (error) {
        this.logger.error('Failed to disconnect MCP', { mcp: key, error });
      }
    }

    this.mcpConfigs.clear();
    this.activeAgents.clear();

    // Dispose config loader
    await this.configLoader.dispose();

    this.logger.info('Shutdown complete');
  }
}
