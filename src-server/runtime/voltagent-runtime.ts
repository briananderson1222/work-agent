/**
 * VoltAgent runtime integration for Work Agent
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { Agent, Memory, VoltAgent, MCPConfiguration, createHooks, type Tool } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { createPinoLogger } from '@voltagent/logger';
import { jsonSchema } from 'ai';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { EventEmitter } from 'events';
import { mkdir, appendFile, readdir, readFile } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { FileVoltAgentMemoryAdapter } from '../adapters/file/voltagent-memory-adapter.js';
import { ConfigLoader } from '../domain/config-loader.js';
import { createBedrockProvider } from '../providers/bedrock.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { UsageAggregator } from '../analytics/usage-aggregator.js';
import { normalizeToolName, parseToolName } from '../utils/tool-name-normalizer.js';
import { StreamPipeline } from './streaming/StreamPipeline.js';
import { ReasoningHandler } from './streaming/handlers/ReasoningHandler.js';
import { ElicitationHandler } from './streaming/handlers/ElicitationHandler.js';
import { TextDeltaHandler } from './streaming/handlers/TextDeltaHandler.js';
import { ToolCallHandler } from './streaming/handlers/ToolCallHandler.js';
import { CompletionHandler } from './streaming/handlers/CompletionHandler.js';
import { MetadataHandler } from './streaming/handlers/MetadataHandler.js';
import type { AgentSpec, ToolDef, AppConfig } from '../domain/types.js';
import { InjectableStream } from './streaming/InjectableStream.js';
import { AgentService } from '../services/agent-service.js';
import { MCPService } from '../services/mcp-service.js';
import { WorkspaceService } from '../services/workspace-service.js';
import { createAgentRoutes } from '../routes/agents.js';
import { createToolRoutes } from '../routes/tools.js';
import { createWorkspaceRoutes, createWorkflowRoutes } from '../routes/workspaces.js';
import { createAnalyticsRoutes } from '../routes/analytics.js';
import { createConfigRoutes } from '../routes/config.js';
import { createBedrockRoutes } from '../routes/bedrock.js';
import { createMonitoringRoutes } from '../routes/monitoring.js';
import { createConversationRoutes } from '../routes/conversations.js';
import { createSchedulerRoutes } from '../routes/scheduler.js';
import { SchedulerService } from '../scheduler/index.js';
import { isAuthError } from '../utils/auth-errors.js';

/**
 * Check if tool name matches any auto-approve pattern
 * Supports wildcards: "tool_*" matches "tool_read", "tool_write", etc.
 */
function isAutoApproved(toolName: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (pattern === '*') return true;
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(toolName);
  });
}

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
  private mcpConnectionStatus: Map<string, { connected: boolean; error?: string }> = new Map();
  private integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }> = new Map();
  private activeAgents: Map<string, Agent> = new Map();
  private agentMetadataMap: Map<string, any> = new Map();
  private agentSpecs: Map<string, AgentSpec> = new Map(); // Cache agent specs
  private memoryAdapters: Map<string, FileVoltAgentMemoryAdapter> = new Map();
  private agentTools: Map<string, Tool<any>[]> = new Map(); // Cache loaded tools per agent
  private globalToolRegistry: Map<string, Tool<any>> = new Map(); // All unique tools by name
  private agentFixedTokens: Map<string, { systemPromptTokens: number; mcpServerTokens: number }> = new Map(); // Cache fixed token counts per agent
  private toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }> = new Map(); // Tool name mapping with parsed data
  private toolNameReverseMapping: Map<string, string> = new Map(); // Original -> Normalized for O(1) lookup
  private monitoringEvents = new EventEmitter();
  private agentStats = new Map<string, { conversationCount: number; messageCount: number; lastUpdated: number }>();
  private agentStatus = new Map<string, 'idle' | 'running'>();
  private metricsLog: Array<{ timestamp: number; agentSlug: string; event: string; conversationId?: string; messageCount?: number; cost?: number }> = [];
  private eventLogPath: string;
  private persistedEvents: Array<any> = [];
  private modelCatalog?: BedrockModelCatalog;
  private usageAggregator?: UsageAggregator;
  private port: number;
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // Services
  private agentService!: AgentService;
  private mcpService!: MCPService;
  private workspaceService!: WorkspaceService;
  private scheduler!: SchedulerService;

  constructor(options: WorkAgentRuntimeOptions = {}) {
    const workAgentDir = options.workAgentDir || '.work-agent';
    this.port = options.port || 3141;
    this.eventLogPath = `${workAgentDir}/monitoring`;

    this.configLoader = new ConfigLoader({
      workAgentDir,
      watchFiles: true,
    });

    this.logger = createPinoLogger({
      name: 'work-agent',
      level: options.logLevel || 'info',
    });

    // Initialize services
    this.agentService = new AgentService(
      this.configLoader,
      this.activeAgents,
      this.agentMetadataMap,
      this.agentSpecs,
      this.logger
    );
    this.mcpService = new MCPService(
      this.configLoader,
      this.mcpConfigs,
      this.mcpConnectionStatus,
      this.integrationMetadata,
      this.agentTools,
      this.toolNameMapping,
      this.logger
    );
    this.workspaceService = new WorkspaceService(this.configLoader, this.logger);
    
    // Log versions for debugging
    this.logger.info('Work Agent Runtime initializing', {
      voltagentCore: '1.1.37',
      aiSdkBedrock: '3.0.56',
      nodeVersion: process.version
    });
  }

  /**
   * Reload agents from disk
   */
  async reloadAgents(): Promise<void> {
    const agentMetadataList = await this.configLoader.listAgents();
    const currentSlugs = new Set(agentMetadataList.map(m => m.slug));
    
    // Remove deleted agents and cleanup MCP servers
    for (const slug of this.activeAgents.keys()) {
      if (!currentSlugs.has(slug)) {
        // Cleanup MCP configs for this agent
        for (const [key, config] of this.mcpConfigs.entries()) {
          if (key.startsWith(`${slug}:`)) {
            await config.disconnect();
            this.mcpConfigs.delete(key);
            this.mcpConnectionStatus.delete(key);
            this.integrationMetadata.delete(key);
          }
        }
        
        this.activeAgents.delete(slug);
        this.agentMetadataMap.delete(slug);
        this.agentSpecs.delete(slug);
        this.agentTools.delete(slug);
        this.memoryAdapters.delete(slug);
        this.logger.info('Agent removed', { agent: slug });
      }
    }
    
    // Add new agents
    for (const meta of agentMetadataList) {
      if (!this.activeAgents.has(meta.slug)) {
        try {
          const agent = await this.createVoltAgentInstance(meta.slug);
          this.activeAgents.set(meta.slug, agent);
          this.voltAgent?.registerAgent(agent);
          this.logger.info('Agent added', { agent: meta.slug });
        } catch (error) {
          this.logger.error('Failed to add agent', { agent: meta.slug, error });
        }
      }
    }
    
    // Update metadata map
    this.agentMetadataMap = new Map(
      agentMetadataList.map(meta => [meta.slug, meta])
    );
    
    this.logger.info('Agents reloaded', { count: agentMetadataList.length });
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing Work Agent Runtime...');

    // Load app configuration
    this.appConfig = await this.configLoader.loadAppConfig();
    this.logger.info('App config loaded', {
      region: this.appConfig.region,
      model: this.appConfig.defaultModel,
    });

    // Initialize Bedrock model catalog
    this.modelCatalog = new BedrockModelCatalog(this.appConfig.region);
    this.logger.debug('Bedrock model catalog initialized');

    // Initialize usage aggregator
    this.usageAggregator = new UsageAggregator(this.configLoader.getWorkAgentDir());
    this.logger.debug('Usage aggregator initialized');

    // Load all agents
    const agentMetadataList = await this.configLoader.listAgents();
    this.logger.info('Found agents', { count: agentMetadataList.length });

    // Create VoltAgent instances for each agent
    const agents: Record<string, Agent> = {};

    // Create default agent (always available, uses defaultModel, no tools)
    const defaultAgent = new Agent({
      name: 'default',
      instructions: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.',
      model: createBedrockProvider({ 
        appConfig: this.appConfig, 
        agentSpec: { model: this.appConfig.defaultModel } as any 
      }),
      tools: [], // No tools
    });
    agents['default'] = defaultAgent;
    this.activeAgents.set('default', defaultAgent);
    this.agentMetadataMap.set('default', {
      slug: 'default',
      name: 'Default Agent',
      description: 'System default agent with no tools',
      updatedAt: new Date().toISOString()
    });
    this.logger.info('Default agent created', { model: this.appConfig.defaultModel });

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
    this.agentMetadataMap = new Map(
      agentMetadataList.map(meta => [meta.slug, meta])
    );
    this.logger.info('Agent metadata map created', { 
      count: this.agentMetadataMap.size,
      keys: Array.from(this.agentMetadataMap.keys()),
      sample: this.agentMetadataMap.get(agentMetadataList[0]?.slug)
    });

    // Initialize scheduler
    this.scheduler = new SchedulerService({
      workAgentDir: this.configLoader.getWorkAgentDir(),
      getAgent: (slug: string) => this.activeAgents.get(slug),
      monitoringEvents: this.monitoringEvents,
    });
    await this.scheduler.initialize();
    this.logger.info('Scheduler initialized', { jobCount: this.scheduler.getJobs().length });

    // Import routes before configuring app
    const modelsRoute = await import('../routes/models.js');

    // Initialize VoltAgent with all agents and server
    this.voltAgent = new VoltAgent({
      agents,
      logger: this.logger,
      server: honoServer({
        port: this.port,
        configureApp: (app) => {
          // Global error handler middleware
          app.onError((err, c) => {
            if (isAuthError(err)) {
              return c.json({ success: false, error: err.message }, 401);
            }
            return c.json({ success: false, error: err.message }, 500);
          });

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

          // Models capabilities and pricing endpoints
          app.route('/api/models', modelsRoute.default);

          // Analytics endpoints
          app.route('/api/analytics', createAnalyticsRoutes(this.usageAggregator));

          // Custom endpoint for enriched agent list (use /api prefix to avoid VoltAgent routes)
          app.get('/api/agents', async (c) => {
            try {
              if (!this.voltAgent) {
                return c.json({ success: false, error: 'VoltAgent not initialized' }, 500);
              }
              await this.reloadAgents();
              const coreAgents = await this.voltAgent.getAgents();
              const enrichedAgents = (await Promise.all(coreAgents.map(async (agent: any) => {
                const metadata = this.agentMetadataMap.get(agent.id);
                if (!metadata) return null;
                
                try {
                  const spec = await this.configLoader.loadAgent(metadata.slug);
                  
                  this.logger.debug('[Agent Enrichment] Loading spec', { 
                    agent: metadata.slug,
                    hasSpec: !!spec,
                    hasTools: !!spec.tools
                  });
                  
                  return {
                    ...agent,
                    slug: metadata.slug,
                    name: metadata.name,
                    prompt: spec.prompt,
                    description: spec.description,
                    model: spec.model,
                    region: spec.region,
                    guardrails: spec.guardrails,
                    maxTurns: spec.maxTurns,
                    icon: spec.icon,
                    commands: spec.commands,
                    toolsConfig: spec.tools,
                    updatedAt: metadata.updatedAt,
                  };
                } catch (error) {
                  this.logger.warn('Agent spec not found, skipping', { agent: metadata.slug });
                  return null;
                }
              }))).filter(a => a !== null);
              
              this.logger.debug('[Agent Enrichment] Enriched agents', { 
                count: enrichedAgents.length,
                agents: enrichedAgents.map(a => ({ slug: a.slug, hasToolsConfig: !!a.toolsConfig }))
              });
              
              return c.json({ success: true, data: enrichedAgents });
            } catch (error: any) {
              this.logger.error('Failed to fetch agents', { error: error.message, stack: error.stack });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // === Agent CRUD Endpoints ===
          // Mount agent routes for CRUD operations
          const agentRoutes = createAgentRoutes(
            this.agentService,
            () => this.initialize(),
            () => this.voltAgent
          );
          app.route('/agents', agentRoutes);

          // === Tool Management Endpoints ===

          // Get Q Developer agents
          app.get('/q-agents', async (c) => {
            try {
              const { readFileSync, existsSync } = await import('fs');
              const { join } = await import('path');
              const { homedir } = await import('os');
              
              const qAgentsPath = join(homedir(), '.aws', 'amazonq', 'cli-agents.json');
              
              if (!existsSync(qAgentsPath)) {
                return c.json({ success: false, error: 'Q Developer agents file not found', agents: [] });
              }
              
              const agents = JSON.parse(readFileSync(qAgentsPath, 'utf-8'));
              return c.json({ success: true, agents });
            } catch (error: any) {
              this.logger.error('Failed to load Q agents', { error });
              return c.json({ success: false, error: error.message, agents: [] });
            }
          });

          // List all tools
          app.route('/tools', createToolRoutes(this.mcpService, () => this.initialize()));

          // Get agent tools with full schemas
          // Get agent tools with full schemas
          app.get('/agents/:slug/tools', async (c) => {
            try {
              const slug = c.req.param('slug');
              const agent = this.activeAgents.get(slug);
              
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found or not active' }, 404);
              }

              const tools = this.agentTools.get(slug) || [];
              const toolsData = tools.map((tool: any) => {
                const mapping = this.toolNameMapping.get(tool.name);
                
                // Convert Zod schema to JSON schema if parameters is a Zod object
                let parameters = tool.parameters;
                if (parameters && typeof parameters === 'object' && '_def' in parameters) {
                  try {
                    parameters = zodToJsonSchema(parameters);
                  } catch (error) {
                    this.logger.warn('Failed to convert Zod schema to JSON schema', { tool: tool.name, error });
                  }
                }
                
                return {
                  id: tool.id || tool.name,
                  name: tool.name,
                  originalName: mapping?.original || tool.name,
                  server: mapping?.server || null,
                  toolName: mapping?.tool || tool.name,
                  description: tool.description,
                  parameters
                };
              });

              return c.json({ success: true, data: toolsData });
            } catch (error: any) {
              this.logger.error('Failed to get agent tools', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Add tool to agent
          app.post('/agents/:slug/tools', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { toolId } = await c.req.json();

              const agent = await this.configLoader.loadAgent(slug);
              const tools = agent.tools || { mcpServers: [], available: ['*'] };

              if (!tools.mcpServers.includes(toolId)) {
                tools.mcpServers.push(toolId);
              }

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true, data: tools.mcpServers });
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
              const tools = agent.tools || { mcpServers: [] };

              tools.mcpServers = tools.mcpServers.filter((id: string) => id !== toolId);

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true }, 200);
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
              const tools = agent.tools || { mcpServers: [] };

              tools.available = allowed;

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
              const tools = agent.tools || { mcpServers: [] };

              tools.aliases = aliases;

              await this.configLoader.updateAgent(slug, { tools });
              await this.initialize();

              return c.json({ success: true, data: tools });
            } catch (error: any) {
              this.logger.error('Failed to update aliases', { error });
              return c.json({ success: false, error: error.message }, 400);
            }
          });

          // === Workspace Management Endpoints ===
          app.route('/workspaces', createWorkspaceRoutes(this.workspaceService));

          // === Workspace & Workflow Management ===
          app.route('/workspaces', createWorkspaceRoutes(this.workspaceService));
          app.route('/agents', createWorkflowRoutes(this.workspaceService));

          // === Route Modules ===
          app.route('/config', createConfigRoutes(this.configLoader, this.logger));
          app.route('/bedrock', createBedrockRoutes(
            () => this.modelCatalog,
            this.appConfig,
            this.logger
          ));
          app.route('/monitoring', createMonitoringRoutes({
            activeAgents: this.activeAgents,
            agentStats: this.agentStats,
            agentStatus: this.agentStatus,
            memoryAdapters: this.memoryAdapters,
            metricsLog: this.metricsLog,
            monitoringEvents: this.monitoringEvents,
            queryEventsFromDisk: (start, end, userId) => this.queryEventsFromDisk(start, end, userId)
          }));
          app.route('/agents', createConversationRoutes(this.memoryAdapters, this.logger));
          app.route('/api/scheduler', createSchedulerRoutes(this.scheduler));

          // Agent health check (agent-specific, not in monitoring routes)
          app.get('/agents/:slug/health', async (c) => {
            const slug = c.req.param('slug');
            const agent = this.activeAgents.get(slug);
            
            if (!agent) {
              return c.json({ 
                success: false, 
                healthy: false, 
                error: 'Agent not found',
                checks: { loaded: false }
              }, 404);
            }

            const checks: Record<string, boolean> = {
              loaded: true,
              hasModel: !!agent.model,
              hasMemory: this.memoryAdapters.has(slug),
            };

            // Check integrations (MCP tools)
            const spec = this.agentSpecs.get(slug);
            const integrations: Array<{ id: string; type: string; connected: boolean; error?: string; metadata?: any }> = [];
            
            if (spec?.tools?.mcpServers && spec.tools.mcpServers.length > 0) {
              checks.integrationsConfigured = true;
              
              for (const id of spec.tools.mcpServers) {
                const key = `${slug}:${id}`;
                const status = this.mcpConnectionStatus.get(key);
                const metadata = this.integrationMetadata.get(key);
                
                // Get tools for this MCP server with original names
                const agentTools = this.agentTools.get(slug) || [];
                const serverTools = agentTools
                  .filter(t => t.name.startsWith(id.replace(/-/g, ''))) // Match by server prefix
                  .map(t => {
                    const mapping = this.toolNameMapping.get(t.name);
                    
                    return {
                      name: t.name,
                      originalName: mapping?.original || t.name,
                      server: mapping?.server || null,
                      toolName: mapping?.tool || t.name,
                      description: (t as any).description
                    };
                  });
                
                integrations.push({
                  id,
                  type: metadata?.type || 'mcp',
                  connected: status?.connected === true,
                  error: status?.error,
                  metadata: metadata ? {
                    transport: metadata.transport,
                    toolCount: metadata.toolCount,
                    tools: serverTools
                  } : undefined,
                });
              }
              
              checks.integrationsConnected = integrations.every(i => i.connected);
            }

            const healthy = Object.values(checks).every(v => v);
            
            return c.json({ 
              success: true, 
              healthy,
              checks,
              integrations,
              status: this.agentStatus.get(slug) || 'idle'
            });
          });

          // === Conversation Context & Stats (not in route module) ===

          // Conversation context management
          app.post('/api/agents/:slug/conversations/:conversationId/context', async (c) => {
            try {
              const slug = c.req.param('slug');
              const conversationId = c.req.param('conversationId');
              const adapter = this.memoryAdapters.get(slug);
              
              if (!adapter) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              const { action, content } = await c.req.json();
              
              switch (action) {
                case 'add-system-message':
                  if (!content) {
                    return c.json({ success: false, error: 'content is required for add-system-message' }, 400);
                  }
                  
                  // Inject as user message with special prefix for UI treatment
                  await adapter.addMessage(
                    {
                      id: crypto.randomUUID(),
                      role: 'user',
                      parts: [{ type: 'text', text: `[SYSTEM_EVENT] ${content}` }]
                    } as any,
                    `agent:${slug}`,
                    conversationId
                  );
                  
                  return c.json({ success: true, message: 'System event added' });
                
                case 'clear-history':
                  await adapter.clearMessages(`agent:${slug}`, conversationId);
                  return c.json({ success: true, message: 'Conversation history cleared' });
                
                default:
                  return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
              }
            } catch (error: any) {
              this.logger.error('Failed to manage conversation context', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Get conversation statistics
          app.get('/agents/:slug/conversations/:conversationId/stats', async (c) => {
            try {
              const slug = c.req.param('slug');
              const conversationId = c.req.param('conversationId');
              
              if (!slug || slug === 'undefined') {
                return c.json({ success: false, error: 'Invalid agent slug' }, 400);
              }
              
              const spec = await this.configLoader.loadAgent(slug);
              const modelId = spec.model || this.appConfig.defaultModel;
              
              // Calculate base stats from system prompt and tools
              const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
              const agentTools = this.agentTools.get(slug) || [];
              const toolsJson = JSON.stringify(agentTools.map((t: any) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters
              })));
              const mcpServerTokens = Math.ceil(toolsJson.length / 4);
              
              // If no conversationId or conversation doesn't exist, return agent-level stats
              if (!conversationId) {
                const contextTokens = systemPromptTokens + mcpServerTokens;
                const contextWindowPercentage = this.calculateContextWindowPercentage(modelId, contextTokens);
                
                return c.json({ 
                  success: true, 
                  data: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    contextTokens,
                    turns: 0,
                    toolCalls: 0,
                    estimatedCost: 0,
                    contextWindowPercentage,
                    modelId,
                    systemPromptTokens,
                    mcpServerTokens,
                    userMessageTokens: 0,
                    assistantMessageTokens: 0,
                    contextFilesTokens: 0,
                  }
                });
              }
              
              const adapter = this.memoryAdapters.get(slug);
              
              if (!adapter) {
                return c.json({ success: false, error: 'Memory adapter not found' }, 404);
              }

              const conversation = await adapter.getConversation(conversationId);
              
              if (!conversation) {
                return c.json({ success: false, error: 'Conversation not found' }, 404);
              }

              interface ConversationStats {
                inputTokens: number;
                outputTokens: number;
                totalTokens: number;
                contextTokens?: number;
                turns: number;
                toolCalls: number;
                estimatedCost: number;
                tokenBreakdown?: {
                  userMessageTokens?: number;
                  assistantMessageTokens?: number;
                  systemPromptTokens?: number;
                  mcpServerTokens?: number;
                };
              }

              const stats: ConversationStats = (conversation.metadata as any)?.stats || {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                turns: 0,
                toolCalls: 0,
                estimatedCost: 0,
              };

              const modelStats = (conversation.metadata as any)?.modelStats || {};
              
              const contextWindowPercentage = this.calculateContextWindowPercentage(modelId, stats.contextTokens || stats.totalTokens);

              // Get token breakdown from stats or calculate on-the-fly
              const breakdown = stats.tokenBreakdown || {};
              let userMessageTokens = breakdown.userMessageTokens;
              let assistantMessageTokens = breakdown.assistantMessageTokens;
              
              // If breakdown doesn't exist, calculate user message tokens from conversation
              // Note: messages are stored separately, not on conversation object
              if (userMessageTokens === undefined) {
                const messages = await adapter.getMessages(conversation.userId, conversationId);
                const userMessages = messages?.filter((m: any) => m.role === 'user') || [];
                userMessageTokens = userMessages.reduce((sum: number, m: any) => {
                  const content = typeof m.content === 'string' 
                    ? m.content 
                    : Array.isArray(m.content) 
                      ? m.content.map((p: any) => p.text || '').join('') 
                      : '';
                  return sum + Math.ceil(content.length / 4);
                }, 0);
              }
              
              // If assistant tokens not in breakdown, use outputTokens
              if (assistantMessageTokens === undefined) {
                assistantMessageTokens = stats.outputTokens || 0;
              }

              return c.json({ 
                success: true, 
                data: {
                  ...stats,
                  contextWindowPercentage,
                  conversationId,
                  modelId,
                  modelStats,
                  systemPromptTokens,
                  mcpServerTokens,
                  userMessageTokens,
                  assistantMessageTokens,
                  contextFilesTokens: 0, // Placeholder for future context files support
                }
              });
            } catch (error: any) {
              this.logger.error('Failed to load conversation stats', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Silent agent invocation for dashboard data fetching
          app.post('/agents/:slug/invoke', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { input, silent = true, model, tools: toolNames, schema } = await c.req.json();

              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              // Build prompt with schema instruction if provided
              let prompt = input;
              if (schema) {
                prompt = `${input}\n\nYou must return your response as valid JSON matching this exact schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object, no markdown formatting, no explanations.`;
              }

              const options: any = {};
              if (model && this.modelCatalog) {
                const resolvedModel = await this.modelCatalog.resolveModelId(model);
                options.model = createBedrockProvider({ 
                  appConfig: this.appConfig, 
                  agentSpec: { model: resolvedModel } as any 
                });
              }
              
              // Override tools if specified - get from our cached tools
              if (toolNames && Array.isArray(toolNames)) {
                const slug = c.req.param('slug');
                const agentTools = this.agentTools.get(slug) || [];
                options.tools = agentTools.filter((t: any) => 
                  toolNames.includes(t.name)
                );
              }
              
              // Use generateText to support multi-turn tool calling
              const result = await agent.generateText(prompt, options);

              // Parse response if schema provided
              let response = result.text;
              if (schema && typeof result.text === 'string') {
                try {
                  // Extract JSON from markdown code blocks if present
                  let jsonText = result.text.trim();
                  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                  if (jsonMatch) {
                    jsonText = jsonMatch[1].trim();
                  }
                  response = JSON.parse(jsonText);
                } catch (e) {
                  this.logger.warn('Failed to parse JSON response', { error: e, text: result.text });
                  // Return raw text if parsing fails
                }
              }

              return c.json({ 
                success: true, 
                response,
                usage: result.usage,
                steps: result.steps,
                toolCalls: result.toolCalls,
                toolResults: result.toolResults,
                reasoning: result.reasoning
              });
            } catch (error: any) {
              this.logger.error('Failed to invoke agent', { error });
              return c.json({ success: false, error: error.message }, isAuthError(error) ? 401 : 500);
            }
          });

          // Raw MCP tool call (no transformation, no LLM)
          app.post('/agents/:slug/tools/:toolName', async (c) => {
            const startTime = performance.now();
            try {
              const slug = c.req.param('slug');
              const toolName = c.req.param('toolName');
              const toolArgs = await c.req.json();
              
              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }
              
              const allTools = this.agentTools.get(slug) || [];
              
              // Try to find tool by normalized name first, then by original name
              let tool = allTools.find(t => t.name === toolName);
              if (!tool) {
                const normalized = this.getNormalizedToolName(toolName);
                tool = allTools.find(t => t.name === normalized);
              }
              
              if (!tool) {
                return c.json({ success: false, error: `Tool ${toolName} not found` }, 404);
              }
              
              const toolStart = performance.now();
              const toolResult = await (tool as any).execute(toolArgs);
              const toolDuration = performance.now() - toolStart;
              
              // Unwrap MCP result
              let unwrappedResult = toolResult;
              if (toolResult?.content?.[0]?.text) {
                try {
                  const parsed = JSON.parse(toolResult.content[0].text);
                  if (parsed?.content?.[0]?.text) {
                    unwrappedResult = JSON.parse(parsed.content[0].text);
                  } else {
                    unwrappedResult = parsed;
                  }
                } catch {
                  unwrappedResult = toolResult.content[0].text;
                }
              }
              
              return c.json({
                success: true,
                response: unwrappedResult,
                metadata: {
                  toolDuration: Math.round(toolDuration),
                  totalDuration: Math.round(performance.now() - startTime)
                }
              });
            } catch (error: any) {
              this.logger.error('Failed to call tool', { error });
              return c.json({ success: false, error: error.message }, isAuthError(error) ? 401 : 500);
            }
          });

          // Pure transformation endpoint (no LLM, just data mapping)
          app.post('/agents/:slug/tool/:toolName', async (c) => {
            const startTime = performance.now();
            try {
              const slug = c.req.param('slug');
              const toolName = c.req.param('toolName');
              const { toolArgs, transform } = await c.req.json();
              
              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }
              
              const allTools = this.agentTools.get(slug) || [];
              
              // Try to find tool by normalized name first, then by original name
              let tool = allTools.find(t => t.name === toolName);
              if (!tool) {
                const normalized = this.getNormalizedToolName(toolName);
                tool = allTools.find(t => t.name === normalized);
              }
              
              if (!tool) {
                return c.json({ success: false, error: `Tool ${toolName} not found` }, 404);
              }
              
              // Execute tool
              const toolStart = performance.now();
              const toolResult = await (tool as any).execute(toolArgs);
              const toolDuration = performance.now() - toolStart;
              
              // Unwrap MCP result
              let unwrappedResult = toolResult;
              let parseError: string | undefined;
              
              if (toolResult?.content?.[0]?.text) {
                try {
                  const parsed = JSON.parse(toolResult.content[0].text);
                  if (parsed?.content?.[0]?.text) {
                    unwrappedResult = JSON.parse(parsed.content[0].text);
                  } else {
                    unwrappedResult = parsed;
                  }
                } catch {
                  unwrappedResult = toolResult.content[0].text;
                }
              }
              
              // Generic handling: if result is a string with error text followed by JSON, extract the JSON
              if (typeof unwrappedResult === 'string') {
                const lastBrace = unwrappedResult.lastIndexOf(', {');
                if (lastBrace > 0) {
                  try {
                    parseError = unwrappedResult.substring(0, lastBrace);
                    const jsonStr = unwrappedResult.substring(lastBrace + 2);
                    unwrappedResult = JSON.parse(jsonStr);
                  } catch {
                    parseError = undefined;
                  }
                }
              }
              
              // Same for response field if it's a string with embedded JSON
              if (unwrappedResult?.response && typeof unwrappedResult.response === 'string') {
                const lastBrace = unwrappedResult.response.lastIndexOf(', {');
                if (lastBrace > 0) {
                  try {
                    parseError = unwrappedResult.response.substring(0, lastBrace);
                    const jsonStr = unwrappedResult.response.substring(lastBrace + 2);
                    unwrappedResult = JSON.parse(jsonStr);
                  } catch {
                    parseError = undefined;
                  }
                }
              }
              
              // Check if the MCP tool returned an error
              if (unwrappedResult?.success === false && unwrappedResult?.error) {
                const errorMessage = unwrappedResult.error?.message?.message || unwrappedResult.error?.message || unwrappedResult.error;
                if (isAuthError(errorMessage)) {
                  return c.json({ success: false, error: errorMessage }, 401);
                }
                return c.json({ success: false, error: errorMessage }, 500);
              }
              
              // Apply transformation
              const transformStart = performance.now();
              const transformFn = new Function('data', `return (${transform})(data);`);
              const transformed = transformFn(unwrappedResult);
              const transformDuration = performance.now() - transformStart;
              
              return c.json({
                success: true,
                response: transformed,
                metadata: {
                  toolDuration: Math.round(toolDuration),
                  transformDuration: Math.round(transformDuration),
                  totalDuration: Math.round(performance.now() - startTime),
                  ...(parseError && { parseError })
                }
              });
            } catch (error: any) {
              this.logger.error('Failed to transform invoke', { error });
              return c.json({ success: false, error: error.message }, isAuthError(error) ? 401 : 500);
            }
          });

          app.post('/agents/:slug/invoke/stream', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { prompt, silent = true, model, tools: toolNames, maxSteps = 10, schema: schemaJson } = await c.req.json();

              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              const options: any = { maxSteps, maxOutputTokens: 2000 };
              if (model && this.modelCatalog) {
                const resolvedModel = await this.modelCatalog.resolveModelId(model);
                options.model = createBedrockProvider({ 
                  appConfig: this.appConfig, 
                  agentSpec: { model: resolvedModel } as any 
                });
              }
              
              // Override tools if specified - create temp agent with only filtered tools
              if (toolNames && Array.isArray(toolNames)) {
                const allTools = this.agentTools.get(slug) || [];
                const filteredTools = allTools.filter(t => toolNames.includes(t.name));
                
                // Create temporary agent with ONLY the filtered tools
                const tempAgent = new Agent({
                  name: `${slug}-temp`,
                  instructions: agent.instructions,
                  model: options.model || agent.model,
                  tools: filteredTools,
                  maxSteps,
                  hooks: agent.hooks,
                });
                
                // generateObject cannot use tools, so use generateText with JSON mode
                if (schemaJson) {
                  const textResult = await tempAgent.generateText(
                    `${prompt}\n\nReturn ONLY valid JSON matching this schema (no markdown, no explanation):\n${JSON.stringify(schemaJson, null, 2)}`
                  );
                  
                  // Extract JSON from response (handles markdown code blocks)
                  let parsed;
                  try {
                    const cleaned = textResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    parsed = JSON.parse(cleaned);
                  } catch {
                    const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
                    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse JSON' };
                  }
                  
                  return c.json({ 
                    success: true, 
                    response: parsed,
                    usage: textResult.usage
                  });
                }
                
                const result = await tempAgent.generateText(prompt);
                
                return c.json({ 
                  success: true, 
                  response: result.text,
                  usage: result.usage
                });
              }

              // For multi-turn, use generateText/generateObject and return result
              const result = schemaJson
                ? await agent.generateObject(prompt, jsonSchema(schemaJson) as any, options)
                : await agent.generateText(prompt, options);
              
              return c.json({ 
                success: true, 
                response: schemaJson ? (result as any).object : (result as any).text,
                usage: result.usage
              });
            } catch (error: any) {
              this.logger.error('Failed to stream invoke', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Tool approval response endpoint
          app.post('/tool-approval/:approvalId', async (c) => {
            try {
              const approvalId = c.req.param('approvalId');
              const { approved } = await c.req.json();
              
              this.logger.info('[Approval Endpoint] Received approval response', { approvalId, approved });
              
              const pending = this.pendingApprovals.get(approvalId);
              if (pending) {
                pending.resolve(approved);
                this.pendingApprovals.delete(approvalId);
                this.logger.info('[Approval Endpoint] Approval resolved', { approvalId, approved });
                return c.json({ success: true });
              }
              
              this.logger.warn('[Approval Endpoint] Approval request not found', { approvalId });
              return c.json({ success: false, error: 'Approval request not found' }, 404);
            } catch (error: any) {
              this.logger.error('Approval response error', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // New lightweight invoke endpoint - uses global tool registry
          app.post('/invoke', async (c) => {
            try {
              const { 
                prompt, 
                schema, 
                tools: toolIds = [],
                maxSteps = 10,
                model,
                structureModel,
                system
              } = await c.req.json();

              // Get tools from global registry
              const filteredTools = toolIds.length > 0
                ? toolIds.map((id: string) => this.globalToolRegistry.get(id)).filter(Boolean)
                : [];

              // Resolve models from config - invokeModel for tool calling, structureModel for output formatting
              const invokeModelId = model || this.appConfig.invokeModel;
              const structureModelId = structureModel || this.appConfig.structureModel;
              
              const mainModel = createBedrockProvider({ 
                appConfig: this.appConfig,
                agentSpec: { 
                  model: this.modelCatalog ? await this.modelCatalog.resolveModelId(invokeModelId) : invokeModelId
                } as any
              });
              
              const fastModel = createBedrockProvider({ 
                appConfig: this.appConfig,
                agentSpec: { 
                  model: this.modelCatalog ? await this.modelCatalog.resolveModelId(structureModelId) : structureModelId
                } as any
              });

              const defaultSystem = 'You are a helpful assistant. Use the available tools to answer the user\'s request accurately and concisely.';
              
              // Create temp agent for tool execution
              const tempAgent = new Agent({
                name: `invoke-${Date.now()}`,
                instructions: system || defaultSystem,
                model: mainModel,
                tools: filteredTools,
                maxSteps
              });

              const tempConvId = `invoke-${Date.now()}`;
              
              // Phase 1: Tool execution
              const textResult = await tempAgent.generateText(prompt, {
                conversationId: tempConvId,
                userId: 'invoke-user'
              });
              
              if (!schema) {
                return c.json({
                  success: true,
                  response: textResult.text,
                  usage: textResult.usage,
                  steps: textResult.steps?.length || 0
                });
              }
              
              // Phase 2: Structure output (no tools needed)
              const { jsonSchema } = await import('ai');
              
              // Create new agent without tools for structuring
              const structureAgent = new Agent({
                name: `invoke-structure-${Date.now()}`,
                instructions: 'Format the provided information as structured JSON.',
                model: fastModel || mainModel,
                tools: [],  // No tools for structuring
                maxSteps: 1
              });
              
              const objectResult = await structureAgent.generateObject(
                `${textResult.text}\n\nFormat the above information as structured JSON.`,
                jsonSchema(schema) as any,
                {
                  conversationId: tempConvId,
                  userId: 'invoke-user'
                }
              );
              
              return c.json({
                success: true,
                response: objectResult.object,
                usage: {
                  promptTokens: (textResult.usage.inputTokens || 0) + (objectResult.usage.inputTokens || 0),
                  completionTokens: (textResult.usage.outputTokens || 0) + (objectResult.usage.outputTokens || 0),
                  totalTokens: (textResult.usage.totalTokens || 0) + (objectResult.usage.totalTokens || 0)
                },
                steps: textResult.steps?.length || 0
              });
            } catch (error: any) {
              this.logger.error('Failed to invoke', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Custom chat endpoint with elicitation - use different path to avoid VoltAgent conflicts
          app.post('/api/agents/:slug/chat', async (c) => {
            const slug = c.req.param('slug');
            
            try {
              const { input, options = {} } = await c.req.json();
              
              // DEBUG: Log image data to trace truncation
              if (Array.isArray(input)) {
                for (const msg of input) {
                  if (msg.parts) {
                    for (const part of msg.parts) {
                      if (part.type === 'file' && part.url) {
                        const dataUrl = part.url as string;
                        this.logger.info('[DEBUG Image] Received file part', {
                          mediaType: part.mediaType,
                          urlLength: dataUrl.length,
                          urlStart: dataUrl.substring(0, 50),
                          urlEnd: dataUrl.substring(dataUrl.length - 50),
                        });
                      }
                    }
                  }
                }
              }
              
              const { model: modelOverride, ...restOptions } = options;

              let agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              // If model override, get or create cached agent with that model
              if (modelOverride) {
                // Validate model ID before creating agent
                if (this.modelCatalog) {
                  try {
                    const isValid = await this.modelCatalog.validateModelId(modelOverride);
                    if (!isValid) {
                      return c.json({ 
                        success: false, 
                        error: `Invalid model ID: ${modelOverride}. Please select a valid model from the list.` 
                      }, 400);
                    }
                  } catch (validationError: any) {
                    this.logger.warn('Model validation failed', { modelOverride, error: validationError });
                    // Continue anyway - validation might fail due to API issues
                  }
                }

                const cacheKey = `${slug}:${modelOverride}`;
                let cachedAgent = this.activeAgents.get(cacheKey);
                
                if (!cachedAgent) {
                  try {
                    // Get the original agent spec and tools
                    const originalSpec = this.agentSpecs.get(slug);
                    const originalTools = this.agentTools.get(slug);
                    const originalMemory = agent.getMemory();
                    const originalHooks = agent.hooks;
                    
                    const resolvedModel = this.modelCatalog 
                      ? await this.modelCatalog.resolveModelId(modelOverride)
                      : modelOverride;
                    const newModel = createBedrockProvider({
                      appConfig: this.appConfig,
                      agentSpec: { 
                        model: resolvedModel,
                        region: originalSpec?.region || this.appConfig.region
                      } as any
                    });
                    
                    cachedAgent = new Agent({
                      ...agent,
                      name: cacheKey,
                      model: newModel,
                      tools: originalTools,
                      memory: originalMemory,
                      hooks: originalHooks,
                    });
                    
                    this.activeAgents.set(cacheKey, cachedAgent);
                    this.logger.info('Created agent with model override', { slug, modelOverride });
                  } catch (modelError: any) {
                    this.logger.error('Failed to create agent with model override', { 
                      slug, 
                      modelOverride, 
                      error: modelError 
                    });
                    return c.json({ 
                      success: false, 
                      error: `Failed to switch to model ${modelOverride}: ${modelError.message}` 
                    }, 500);
                  }
                }
                
                agent = cachedAgent;
              }

              // Set SSE headers
              c.header('Content-Type', 'text/event-stream');
              c.header('Cache-Control', 'no-cache');
              c.header('Connection', 'keep-alive');
              c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

              return stream(c, async (streamWriter) => {
                let conversationId: string | undefined;
                let operationContext: any = {};
                let completionReason = 'completed';
                let hasOutput = false;
                let accumulatedText = '';
                let reasoningText = '';
                let toolCallCount = 0;
                let currentStep = 0;
                let requestTraceId = '';
                let isNewConversation = false;
                let result: any;
                const artifacts: Array<{ type: string; name?: string; content?: any }> = [];
                
                try {
                  // Create injectable stream for elicitation
                  const injectableStream = new InjectableStream();
                  
                  // Get auto-approve list from agent spec
                  const agentSpec = this.agentSpecs.get(slug);
                  const autoApprove = agentSpec?.tools?.autoApprove || [];
                  
                  // Elicitation callback that injects events instead of writing directly
                  const elicitation = async (request: any) => {
                    if (request.type === 'tool-approval') {
                      const toolName = request.toolName;
                      
                      // Check if auto-approved (check both normalized and original names)
                      const isApproved = isAutoApproved(toolName, autoApprove);
                      
                      // Also check if the original (non-normalized) name matches
                      const toolMapping = Array.from(this.toolNameMapping.values()).find(
                        m => m.normalized === toolName
                      );
                      const isApprovedOriginal = toolMapping ? isAutoApproved(toolMapping.original, autoApprove) : false;
                      
                      if (isApproved || isApprovedOriginal) {
                        this.logger.info('[Elicitation] Auto-approved, returning true immediately', { 
                          toolName,
                          originalName: toolMapping?.original,
                          matched: isApproved ? 'normalized' : 'original'
                        });
                        return true;
                      }
                      
                      // Not auto-approved - inject approval request into stream
                      const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                      
                      // Parse tool name for UI display
                      const { server, tool } = parseToolName(toolName);
                      
                      this.logger.info('[Elicitation] NOT auto-approved, injecting approval request', {
                        approvalId,
                        toolName,
                        originalName: toolMapping?.original,
                        autoApproveList: autoApprove
                      });
                      
                      // Inject event (will appear at next chunk boundary)
                      injectableStream.inject({
                        type: 'tool-approval-request',
                        approvalId,
                        toolName,
                        server,
                        tool,
                        toolDescription: request.toolDescription,
                        toolArgs: request.toolArgs,
                      } as any);
                      
                      // Wait for user approval
                      return new Promise<boolean>((resolve, reject) => {
                        this.pendingApprovals.set(approvalId, { resolve, reject });
                        
                        const timeout = setTimeout(() => {
                          if (this.pendingApprovals.has(approvalId)) {
                            this.pendingApprovals.delete(approvalId);
                            this.logger.warn('[Elicitation] Approval timeout', { approvalId });
                            resolve(false);
                          }
                        }, 60000);
                        
                        const originalResolve = resolve;
                        const wrappedResolve = (value: boolean) => {
                          clearTimeout(timeout);
                          originalResolve(value);
                        };
                        this.pendingApprovals.set(approvalId, { resolve: wrappedResolve, reject });
                      });
                    }
                    return false;
                  };
                  
                  operationContext = {
                    ...restOptions,
                    elicitation,
                  };
                  
                  // Generate conversationId if not provided (new conversation)
                  isNewConversation = !operationContext.conversationId;
                  if (isNewConversation && operationContext.userId) {
                    operationContext.conversationId = `${operationContext.userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
                  }
                  
                  // Create AbortController tied to client connection
                  const abortController = new AbortController();
                  conversationId = operationContext.conversationId;
                  
                  // Listen for client disconnect and abort operation
                  c.req.raw.signal?.addEventListener('abort', () => {
                    this.logger.debug('Client disconnected, aborting operation', { conversationId });
                    abortController.abort('Client disconnected');
                  });
                  
                  // Pass abort signal to VoltAgent (it will create its own controller that listens to this)
                  operationContext.abortSignal = abortController.signal;
                  this.logger.debug('Abort signal configured', { conversationId });
                  
                  // Ensure conversation exists before streaming
                  const memory = agent.getMemory();
                  if (memory && operationContext.conversationId && operationContext.userId) {
                    const existing = await memory.getConversation(operationContext.conversationId);
                    if (!existing) {
                      // Use provided title or generate from first 50 chars of user message
                      const title = operationContext.title || (input.length > 50 ? input.substring(0, 50) + '...' : input);
                      await memory.createConversation({
                        id: operationContext.conversationId,
                        resourceId: slug,
                        userId: operationContext.userId,
                        title,
                        metadata: {},
                      });
                    }
                  }
                  
                  // Generate trace ID for this request (before streamText so it's available in message metadata)
                  const traceId = `${operationContext.conversationId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
                  operationContext.traceId = traceId;
                  
                  result = await agent.streamText(input, operationContext);
                  
                  // Set agent status to running
                  this.agentStatus.set(slug, 'running');
                  
                  // Emit monitoring event
                  const agentStartEvent = {
                    type: 'agent-start',
                    timestamp: new Date().toISOString(),
                    timestampMs: Date.now(),
                    agentSlug: slug,
                    conversationId: operationContext.conversationId,
                    userId: operationContext.userId,
                    traceId,
                    input: typeof input === 'string' ? input : input?.text || '[complex input]',
                  };
                  this.monitoringEvents.emit('event', agentStartEvent);
                  await this.persistEvent(agentStartEvent);
                  
                  // Initialize stats if needed
                  if (!this.agentStats.has(slug)) {
                    const adapter = this.memoryAdapters.get(slug);
                    if (adapter) {
                      const conversations = await adapter.getConversations(slug);
                      let totalMessages = 0;
                      for (const conv of conversations) {
                        const messages = await adapter.getMessages(conv.userId, conv.id);
                        totalMessages += messages.length;
                      }
                      this.agentStats.set(slug, {
                        conversationCount: conversations.length,
                        messageCount: totalMessages,
                        lastUpdated: Date.now(),
                      });
                    }
                  }
                  
                  // Prevent unhandled rejections when stream is aborted mid-flight
                  const suppressAbortError = (err: any) => 
                    abortController.signal.aborted ? undefined : Promise.reject(err);
                  
                  result.text?.catch(suppressAbortError);
                  result.usage?.catch(suppressAbortError);
                  result.finishReason?.catch(suppressAbortError);
                  
                  // Helper to save standalone cancellation message
                  const saveCancellationMessage = async () => {
                    const mem = agent.getMemory();
                    if (mem && operationContext.conversationId && operationContext.userId) {
                      await mem.addMessage(
                        {
                          id: crypto.randomUUID(),
                          role: 'assistant',
                          parts: [{ type: 'text', text: '_⚠️ Response cancelled by user_' }]
                        },
                        operationContext.userId,
                        operationContext.conversationId
                      );
                    }
                  };
                  
                  this.logger.info('Agent stream started', { 
                    conversationId: operationContext.conversationId,
                    isNewConversation 
                  });

                  // Send conversationId as first event for new conversations
                  if (isNewConversation && operationContext.conversationId) {
                    const mem = agent.getMemory();
                    const conversation = mem ? await mem.getConversation(operationContext.conversationId) : null;
                    await streamWriter.write(`data: ${JSON.stringify({
                      type: 'conversation-started',
                      conversationId: operationContext.conversationId,
                      title: conversation?.title || 'New Conversation'
                    })}\n\n`);
                  }

                  // Initialize streaming state variables
                  completionReason = 'completed';
                  hasOutput = false;
                  accumulatedText = '';
                  let currentTextSegment = '';
                  reasoningText = '';
                  let lastChunkWasToolResult = false;
                  let hasEmittedReasoningForCurrentSegment = false;
                  toolCallCount = 0;
                  currentStep = 0;
                  requestTraceId = traceId; // Capture traceId for use in events
                  let thinkingBuffer = ''; // Buffer for incomplete thinking tags
                  let inThinkingBlock = false; // Track if we're currently in a <thinking> block
                  let currentReasoningContent = ''; // Accumulate reasoning for monitoring event
                  const recentChunks: any[] = []; // Track last 10 chunks for debugging
                  let suppressTextStart = false; // Suppress text-start if response begins with <thinking>
                  
                  // Use DEBUG_STREAMING env var for debug logging
                  const debugStreaming = process.env.DEBUG_STREAMING === 'true';
                  
                  // Initialize StreamPipeline
                  const pipeline = new StreamPipeline(abortController.signal);
                  const completionHandler = new CompletionHandler();
                  const metadataHandler = new MetadataHandler(this.monitoringEvents, {
                    slug,
                    conversationId: operationContext.conversationId,
                    userId: operationContext.userId,
                    traceId,
                  });
                  
                  // Add handlers in order (elicitation handled via callback + injectable stream)
                  pipeline
                    .use(new ReasoningHandler({ enableThinking: true }))
                    .use(new TextDeltaHandler())
                    .use(new ToolCallHandler())
                    .use(metadataHandler)
                    .use(completionHandler);
                  
                  // Log model and tool configuration for debugging
                  const agentTools = this.agentTools.get(slug) || [];
                  const agentModel = agent.model as { modelId?: string; settings?: { maxTokens?: number; temperature?: number } } | undefined;
                  this.logger.debug('Stream starting', {
                    conversationId,
                    model: agentModel?.modelId,
                    toolCount: agentTools.length,
                    toolNames: agentTools.map(t => t.name).slice(0, 5),
                    maxTokens: agentModel?.settings?.maxTokens,
                    temperature: agentModel?.settings?.temperature,
                    debugStreaming
                  });
                  
                  // Wrap fullStream with injectable stream
                  // ReasoningHandler buffers all chunks during thinking, so approval-request
                  // will be held until reasoning-end is emitted
                  const wrappedStream = injectableStream.wrap(result.fullStream);
                  
                  // Run pipeline and write chunks to stream
                  for await (const chunk of pipeline.run(wrappedStream)) {
                    await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    // Force flush by yielding to event loop with setTimeout(0)
                    // setImmediate doesn't flush network buffers, but setTimeout does
                    await new Promise(resolve => setTimeout(resolve, 0));
                  }
                  
                  // Write [DONE] marker
                  await streamWriter.write('data: [DONE]\n\n');
                  
                  // Get completion state from handlers
                  const results = await pipeline.finalize();
                  
                  // Extract completion state for finally block
                  if (results.completion) {
                    hasOutput = results.completion.hasOutput;
                    completionReason = results.completion.completionReason;
                    accumulatedText = results.completion.accumulatedText;
                  }
                  
                  // Check if aborted
                  if (abortController.signal.aborted) {
                    completionReason = 'aborted';
                    if (!hasOutput) await saveCancellationMessage();
                  }
                } catch (error: any) {
                  const agentModelForError = agent.model as { modelId?: string } | undefined;
                  this.logger.error('Stream error occurred', {
                    agentId: slug,
                    modelName: agentModelForError?.modelId,
                    conversationId: conversationId,
                    agentName: slug,
                    error,
                  });
                  const isCredentialError = error.message?.includes('credential') || 
                                           error.message?.includes('accessKeyId') ||
                                           error.message?.includes('secretAccessKey');
                  await streamWriter.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    errorText: error.message,
                    statusCode: isCredentialError ? 401 : undefined
                  })}\n\n`);
                  await streamWriter.write('data: [DONE]\n\n');
                } finally {
                  // Agent stream completed
                  this.logger.info('Agent stream completed', { 
                    conversationId: operationContext.conversationId,
                    reason: completionReason
                  });
                  
                  // Set agent status to idle
                  this.agentStatus.set(slug, 'idle');
                  
                  // Add final text output to artifacts (excluding reasoning text)
                  const finalOutput = accumulatedText.replace(reasoningText, '').trim();
                  if (finalOutput) {
                    artifacts.push({
                      type: 'text',
                      content: finalOutput,
                    });
                  }
                  
                  // Collect usage stats
                  let usage;
                  try {
                    usage = await result.usage;
                  } catch (e) {
                    // Usage might not be available
                  }
                  
                  // Emit monitoring event
                  const agentCompleteEvent = {
                    type: 'agent-complete',
                    timestamp: new Date().toISOString(),
                    timestampMs: Date.now(), // High-precision timestamp
                    agentSlug: slug,
                    conversationId: operationContext.conversationId,
                    userId: operationContext.userId,
                    traceId: requestTraceId,
                    reason: completionReason,
                    artifacts,
                    steps: currentStep,
                    toolCallCount,
                    maxSteps: this.agentSpecs.get(slug)?.guardrails?.maxSteps,
                    inputChars: typeof input === 'string' ? input.length : (input?.text?.length || 0),
                    outputChars: finalOutput.length,
                    usage: usage ? {
                      promptTokens: usage.promptTokens,
                      completionTokens: usage.completionTokens,
                      totalTokens: usage.totalTokens,
                    } : undefined,
                  };
                  this.monitoringEvents.emit('event', agentCompleteEvent);
                  await this.persistEvent(agentCompleteEvent);
                  
                  // Update cached stats (increment by 2: user message + assistant response)
                  const stats = this.agentStats.get(slug);
                  if (stats) {
                    stats.messageCount += 2;
                    stats.lastUpdated = Date.now();
                    if (isNewConversation) {
                      stats.conversationCount += 1;
                    }
                  }
                  
                  // Log metrics for historical tracking
                  this.metricsLog.push({
                    timestamp: Date.now(),
                    agentSlug: slug,
                    event: 'completion',
                    conversationId: operationContext.conversationId,
                    messageCount: 2,
                    cost: 0, // TODO: Calculate from usage
                  });
                }
              });
            } catch (error: any) {
              this.logger.error('Chat error', { error });
              const isCredentialError = error.message?.includes('credential') || 
                                       error.message?.includes('accessKeyId') ||
                                       error.message?.includes('secretAccessKey');
              return c.json({ success: false, error: error.message }, isCredentialError ? 401 : 500);
            }
          });
        },
      }),
    });

    this.logger.debug('Work Agent Runtime initialized', { port: this.port });
    
    // Load persisted events from disk
    await this.loadEventsFromDisk();
    
    // Start periodic health checks (every 60 seconds)
    this.startHealthChecks();
  }

  /**
   * Start periodic health checks for all agents
   */
  private startHealthChecks() {
    const interval = 60000; // 60 seconds
    
    const runHealthChecks = async () => {
      for (const [slug, agent] of this.activeAgents.entries()) {
        const checks: Record<string, boolean> = {
          loaded: true,
          hasModel: !!agent.model,
          hasMemory: this.memoryAdapters.has(slug),
        };

        const spec = this.agentSpecs.get(slug);
        const integrations: Array<{ id: string; type: string; connected: boolean; metadata?: any }> = [];
        
        // Only check integrations if agent has MCP servers configured
        if (spec?.tools?.mcpServers && spec.tools.mcpServers.length > 0) {
          checks.integrationsConfigured = true;
          
          for (const id of spec.tools.mcpServers) {
            const key = `${slug}:${id}`;
            const status = this.mcpConnectionStatus.get(key);
            const metadata = this.integrationMetadata.get(key);
            
            integrations.push({
              id,
              type: metadata?.type || 'mcp',
              connected: status?.connected === true,
              metadata: metadata ? {
                transport: metadata.transport,
                toolCount: metadata.toolCount,
              } : undefined,
            });
          }
          
          checks.integrationsConnected = integrations.every(i => i.connected);
        }

        const healthy = Object.values(checks).every(v => v);
        
        // Generate trace ID for health check
        const traceId = `health:${slug}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        
        const healthEvent = {
          type: 'agent-health',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          agentSlug: slug,
          userId: 'default-user', // Health checks are system-level but we need userId for filtering
          traceId,
          healthy,
          checks,
          integrations,
        };
        
        this.monitoringEvents.emit('event', healthEvent);
        await this.persistEvent(healthEvent);
      }
    };
    
    // Run initial health check immediately
    runHealthChecks();
    
    // Then run periodically
    this.healthCheckInterval = setInterval(runHealthChecks, interval);
    
    this.logger.debug('Health checks started', { interval });
  }

  /**
   * Extract userId from conversationId format: agent:<slug>:user:<id>:timestamp:random
   */
  private extractUserId(conversationId: string): string | null {
    const match = conversationId.match(/^agent:[^:]+:user:([^:]+):/);
    return match ? match[1] : null;
  }

  /**
   * Get today's event log file path
   */
  private getTodayEventLogPath(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.eventLogPath, `events-${today}.ndjson`);
  }

  /**
   * Load recent events from disk (last 1000 or last 24 hours)
   */
  /**
   * Query events from disk for a specific time range
   */
  private async queryEventsFromDisk(start: number, end: number, userId: string): Promise<any[]> {
    const events: any[] = [];
    
    try {
      const eventFiles = await readdir(this.eventLogPath);
      const logFiles = eventFiles.filter(f => f.startsWith('events-') && f.endsWith('.ndjson'));
      
      for (const file of logFiles) {
        const filePath = join(this.eventLogPath, file);
        const fileStream = createReadStream(filePath);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              const eventTime = new Date(event.timestamp).getTime();
              
              if (eventTime >= start && eventTime <= end && event.userId === userId) {
                events.push(event);
              }
            } catch (err) {
              this.logger.warn('Failed to parse event line', { line, error: err });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to query events from disk', { error, start, end });
    }
    
    return events;
  }

  /**
   * Load events from disk for the last 24 hours
   */
  private async loadEventsFromDisk(): Promise<void> {
    try {
      // Ensure monitoring directory exists
      if (!existsSync(this.eventLogPath)) {
        await mkdir(this.eventLogPath, { recursive: true });
        this.logger.debug('Created monitoring directory', { path: this.eventLogPath });
        return;
      }

      const files = await readdir(this.eventLogPath);
      const eventFiles = files
        .filter(f => f.startsWith('events-') && f.endsWith('.ndjson'))
        .sort()
        .reverse()
        .slice(0, 2); // Last 2 days

      const events: any[] = [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const file of eventFiles) {
        const filePath = join(this.eventLogPath, file);
        const fileStream = createReadStream(filePath);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              const eventTime = new Date(event.timestamp).getTime();
              
              if (eventTime >= oneDayAgo) {
                events.push(event);
              }
            } catch (err) {
              this.logger.warn('Failed to parse event line', { line, error: err });
            }
          }
        }
      }

      // Keep only last 1000 events
      this.persistedEvents = events.slice(-1000);
      this.logger.info('Loaded persisted events', { count: this.persistedEvents.length });
    } catch (error) {
      this.logger.error('Failed to load events from disk', { error });
    }
  }

  /**
   * Persist event to disk
   */
  private async persistEvent(event: any): Promise<void> {
    try {
      // Ensure monitoring directory exists
      if (!existsSync(this.eventLogPath)) {
        await mkdir(this.eventLogPath, { recursive: true });
      }

      const logPath = this.getTodayEventLogPath();
      await appendFile(logPath, JSON.stringify(event) + '\n', 'utf-8');
      
      // Add to in-memory cache
      this.persistedEvents.push(event);
      
      // Keep only last 1000 in memory
      if (this.persistedEvents.length > 1000) {
        this.persistedEvents = this.persistedEvents.slice(-1000);
      }
    } catch (error) {
      this.logger.error('Failed to persist event', { error, event });
    }
  }

  /**
   * Create a VoltAgent Agent instance from agent spec
   */
  private async createVoltAgentInstance(agentSlug: string): Promise<Agent> {
    // Load agent spec
    const spec = await this.configLoader.loadAgent(agentSlug);
    
    // Cache spec for later use
    this.agentSpecs.set(agentSlug, spec);

    // Create Bedrock provider
    const model = await this.createBedrockModel(spec);

    // Create memory adapter
    const memoryAdapter = new FileVoltAgentMemoryAdapter({
      workAgentDir: this.configLoader.getWorkAgentDir(),
      usageAggregator: this.usageAggregator,
    });
    const memory = new Memory({
      storage: memoryAdapter,
    });

    // Store adapter for later access
    this.memoryAdapters.set(agentSlug, memoryAdapter);

    // Load and configure tools (including MCP)
    const tools = await this.loadAgentTools(agentSlug, spec);
    
    // Cache tools for runtime filtering
    this.agentTools.set(agentSlug, tools);
    
    // Add to global tool registry (deduplicated by name)
    for (const tool of tools) {
      if (!this.globalToolRegistry.has(tool.name)) {
        this.globalToolRegistry.set(tool.name, tool);
      }
    }

    // Calculate and cache fixed token counts (system prompt + tools)
    // These don't change unless the agent is reloaded
    const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
    const toolsJson = JSON.stringify(tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    })));
    const mcpServerTokens = Math.ceil(toolsJson.length / 4);
    
    this.agentFixedTokens.set(agentSlug, {
      systemPromptTokens,
      mcpServerTokens
    });
    
    this.logger.info('[Agent Initialized]', {
      agent: agentSlug,
      systemPromptTokens,
      mcpServerTokens,
      totalFixedTokens: systemPromptTokens + mcpServerTokens
    });

    // Create hooks for tool approval (if autoApprove is configured)
    const hooks = this.createToolApprovalHooks(spec);

    // Replace template variables in prompts
    const processedPrompt = this.replaceTemplateVariables(spec.prompt);
    const processedSystemPrompt = this.appConfig.systemPrompt 
      ? this.replaceTemplateVariables(this.appConfig.systemPrompt)
      : '';

    // Combine global system prompt with agent-specific instructions
    const instructions = processedSystemPrompt
      ? `${processedSystemPrompt}\n\n${processedPrompt}`
      : processedPrompt;

    // Create Agent instance
    const agent = new Agent({
      name: agentSlug,  // Use slug for routing
      instructions,
      model,
      memory,
      tools,
      hooks,
      ...(spec.maxTurns !== undefined || this.appConfig.defaultMaxTurns !== undefined ? {
        maxTurns: spec.maxTurns ?? this.appConfig.defaultMaxTurns
      } : {}),
      ...(spec.guardrails && {
        temperature: spec.guardrails.temperature,
        maxOutputTokens: spec.guardrails.maxTokens,
        topP: spec.guardrails.topP,
        maxSteps: spec.guardrails.maxSteps,
      }),
    });

    return agent;
  }

  /**
   * Create Bedrock model instance
   */
  private async createBedrockModel(spec: AgentSpec) {
    const modelId = spec.model || this.appConfig.defaultModel;
    const resolvedModel = this.modelCatalog 
      ? await this.modelCatalog.resolveModelId(modelId)
      : modelId;
    return createBedrockProvider({
      appConfig: this.appConfig,
      agentSpec: { ...spec, model: resolvedModel },
    });
  }

  /**
   * Load tools for an agent (regular tools + MCP tools)
   */
  private async loadAgentTools(agentSlug: string, spec: AgentSpec): Promise<Tool<any>[]> {
    const tools: Tool<any>[] = [];

    if (!spec.tools || !spec.tools.mcpServers || spec.tools.mcpServers.length === 0) {
      return tools;
    }

    // Load each MCP server from catalog
    for (const toolId of spec.tools.mcpServers) {
      try {
        const toolDef = await this.configLoader.loadTool(toolId);

        if (toolDef.kind === 'mcp') {
          const mcpTools = await this.createMCPTools(agentSlug, toolId, toolDef);
          tools.push(...mcpTools);
        } else if (toolDef.kind === 'builtin') {
          const builtinTool = this.createBuiltinTool(toolDef);
          if (builtinTool) {
            tools.push(builtinTool);
          }
        }
      } catch (error) {
        this.logger.error('Failed to load tool', { agent: agentSlug, toolId, error });
      }
    }

    // Apply available filter (defaults to all tools)
    const available = spec.tools.available || ['*'];
    
    this.logger.debug('Tool filtering', {
      agent: agentSlug,
      totalTools: tools.length,
      availablePatterns: available,
      toolNames: tools.slice(0, 5).map(t => t.name)
    });
    
    if (!available.includes('*')) {
      const filtered = tools.filter(tool => this.matchesToolPattern(tool.name, available));
      this.logger.info('Tools filtered', {
        agent: agentSlug,
        before: tools.length,
        after: filtered.length,
        removed: tools.length - filtered.length
      });
      return filtered;
    }

    return tools;
  }

  /**
   * Check if tool name matches any pattern in the list
   */
  private matchesToolPattern(toolName: string, patterns: string[]): boolean {
    // Get original name if this is a normalized name
    const mapping = this.toolNameMapping.get(toolName);
    const originalName = mapping?.original || toolName;
    
    for (const pattern of patterns) {
      // Exact match (check both normalized and original)
      if (pattern === toolName || pattern === originalName) return true;
      
      // Wildcard pattern (e.g., "my-server_*" or "myServer_*")
      if (pattern.endsWith('_*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(`${prefix}_`) || originalName.startsWith(`${prefix}_`)) return true;
      }
      
      // Legacy slash pattern support (e.g., "my-server/*")
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(`${prefix}_`) || toolName.startsWith(`${prefix}/`) ||
            originalName.startsWith(`${prefix}_`) || originalName.startsWith(`${prefix}/`)) return true;
      }
    }
    
    return false;
  }

  /**
   * Create tool approval hooks based on agent configuration
   * Tools in autoApprove list execute automatically, others require user confirmation
   */
  private createToolApprovalHooks(spec: AgentSpec) {
    const autoApprove = spec.tools?.autoApprove || [];

    return createHooks({
      onToolStart: async ({ tool, context }) => {
        // Track tool call count in context Map
        const currentCount = (context.context.get('toolCallCount') as number) || 0;
        context.context.set('toolCallCount', currentCount + 1);
        
        this.logger.debug('Tool execution starting', {
          toolName: tool.name,
          conversationId: context.conversationId,
        });
        
        // Check if this is a silent invocation (no conversationId means silent mode)
        const isSilentInvocation = !context.conversationId;
        
        if (isSilentInvocation) {
          return;
        }

        // Check if tool is in autoApprove list
        const isAutoApproved = this.matchesToolPattern(tool.name, autoApprove);
        
        this.logger.info('[Tool] Executing', {
          toolName: tool.name,
          isAutoApproved,
        });
      },
      onEnd: async ({ context, output, agent, error }) => {
        // Only track stats for conversations (not silent invocations)
        if (!context.conversationId || !output) {
          return;
        }

        try {
          const memory = agent.getMemory();
          if (!memory) return;

          // Get current conversation
          const conversation = await memory.getConversation(context.conversationId);
          if (!conversation) return;

          // Extract usage data (may be undefined if aborted)
          const usage = 'usage' in output ? output.usage : undefined;

          // Count tool calls from context (tracked in onToolStart)
          const toolCallCount = (context.context.get('toolCallCount') as number) || 0;

          // Get messages for this conversation
          const messages = await memory.getMessages(context.userId || '', context.conversationId);

          // Log stats (even if usage is incomplete due to abortion)
          this.logger.info('[Usage Stats]', {
            conversationId: context.conversationId,
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            totalTokens: usage?.totalTokens || 0,
            messageCount: messages.length,
            toolCallCount,
            aborted: !usage,
          });

          // Only update conversation stats if we have usage data
          if (!usage) return;

          // Get existing stats or initialize
          const existingStats = (conversation.metadata?.stats as any) || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            contextTokens: 0,
            turns: 0,
            toolCalls: 0,
            estimatedCost: 0,
          };

          // Get agent spec for model info
          const agentSlug = conversation.resourceId;
          const agentSpec = await this.configLoader.loadAgent(agentSlug);
          const modelId = agentSpec.model || this.appConfig.defaultModel;
          const cost = await this.calculateCost(modelId, usage);

          // Calculate context tokens: accumulated outputs + latest input
          // Context represents what's in memory (grows with conversation)
          const newOutputTokens = existingStats.outputTokens + (usage.completionTokens || 0);
          const newInputTokens = existingStats.inputTokens + (usage.promptTokens || 0);
          
          // Get fixed token counts from cache (calculated once at agent initialization)
          const fixedTokens = this.agentFixedTokens.get(agentSlug);
          const systemPromptTokens = fixedTokens?.systemPromptTokens || 0;
          const mcpServerTokens = fixedTokens?.mcpServerTokens || 0;
          
          // Get existing breakdown for incremental calculation
          const existingBreakdown = existingStats.tokenBreakdown || {};
          
          // Context = system prompt + tools + all user messages + all assistant responses
          // Optimize: only calculate new user message tokens, not all messages
          const existingUserMessageTokens = existingBreakdown.userMessageTokens || 0;
          
          // Get messages for user message token calculation
          const userMessages = messages.filter((m: any) => m.role === 'user');
          
          this.logger.info('[Token Calculation Debug]', {
            conversationId: context.conversationId,
            totalMessages: messages.length,
            userMessageCount: userMessages.length,
            existingUserMessageTokens,
            turn: existingStats.turns + 1,
          });
          
          // Find the latest user message (should be the last one added)
          const latestUserMessage = userMessages[userMessages.length - 1];
          
          let newUserMessageTokens = 0;
          if (latestUserMessage) {
            // UIMessage uses 'parts' array with text parts
            const parts = (latestUserMessage as any).parts || [];
            const content = parts
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text || '')
              .join('');
            newUserMessageTokens = Math.ceil(content.length / 4);
            
            this.logger.info('[New User Message]', {
              conversationId: context.conversationId,
              contentLength: content.length,
              tokens: newUserMessageTokens,
            });
          } else {
            this.logger.warn('[No User Message Found]', {
              conversationId: context.conversationId,
              userMessageCount: userMessages.length,
            });
          }
          
          const userMessageTokens = existingUserMessageTokens + newUserMessageTokens;
          const assistantMessageTokens = newOutputTokens;
          
          this.logger.info('[Token Breakdown]', {
            conversationId: context.conversationId,
            turn: existingStats.turns + 1,
            newUserMessageTokens,
            totalUserMessageTokens: userMessageTokens,
            systemPromptTokens,
            mcpServerTokens,
            assistantMessageTokens,
          });
          
          const contextTokens = systemPromptTokens + mcpServerTokens + userMessageTokens + assistantMessageTokens;

          // Store breakdown for stats endpoint
          const tokenBreakdown = {
            systemPromptTokens,
            mcpServerTokens,
            userMessageTokens,
            assistantMessageTokens,
          };

          // Update stats
          const updatedStats = {
            inputTokens: newInputTokens, // Total consumed across all LLM calls
            outputTokens: newOutputTokens, // Total generated
            totalTokens: newInputTokens + newOutputTokens,
            contextTokens, // Current memory size
            turns: existingStats.turns + 1,
            toolCalls: existingStats.toolCalls + toolCallCount,
            estimatedCost: existingStats.estimatedCost + cost,
            tokenBreakdown,
          };

          // Track per-model stats
          const modelStats = (conversation.metadata?.modelStats || {}) as Record<string, any>;
          const currentModelStats = modelStats[modelId] || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            contextTokens: 0,
            turns: 0,
            toolCalls: 0,
            estimatedCost: 0,
          };

          const newModelOutputTokens = currentModelStats.outputTokens + (usage.completionTokens || 0);
          const newModelInputTokens = currentModelStats.inputTokens + (usage.promptTokens || 0);
          
          // Per-model context is harder to track accurately, use accumulated outputs as approximation
          const modelContextTokens = systemPromptTokens + mcpServerTokens + userMessageTokens + newModelOutputTokens;
          
          modelStats[modelId] = {
            inputTokens: newModelInputTokens,
            outputTokens: newModelOutputTokens,
            totalTokens: newModelInputTokens + newModelOutputTokens,
            contextTokens: modelContextTokens,
            turns: currentModelStats.turns + 1,
            toolCalls: currentModelStats.toolCalls + toolCallCount,
            estimatedCost: currentModelStats.estimatedCost + cost,
          };

          // Update conversation metadata
          await memory.updateConversation(context.conversationId, {
            metadata: {
              ...conversation.metadata,
              stats: updatedStats,
              modelStats,
            },
          });

          // Enrich the last assistant message with model metadata and usage
          try {
            const adapter = this.memoryAdapters.get(agentSlug);
            if (!adapter) {
              this.logger.warn('No adapter found for agent', { agent: agentSlug });
              return;
            }

            const messages = await adapter.getMessages(`agent:${agentSlug}`, context.conversationId);
            const lastMessage = messages[messages.length - 1];
            
            if (lastMessage && lastMessage.role === 'assistant') {
              // Get model capabilities
              const models = await this.modelCatalog?.listModels();
              const modelInfo = models?.find(m => m.modelId === modelId);
              
              // Get pricing
              const pricing = await this.modelCatalog?.getModelPricing(this.appConfig.region);
              const pricingInfo = pricing?.find(p => 
                p.modelId === modelId || 
                modelId.includes(p.modelId.toLowerCase().replace(/\s+/g, '-'))
              );

              // Remove and re-add with metadata
              await adapter.removeLastMessage(`agent:${agentSlug}`, context.conversationId);
              await adapter.addMessage(
                lastMessage,
                `agent:${agentSlug}`,
                context.conversationId,
                {
                  model: modelId,
                  modelMetadata: modelInfo ? {
                    capabilities: {
                      inputModalities: modelInfo.inputModalities,
                      outputModalities: modelInfo.outputModalities,
                      supportsStreaming: modelInfo.responseStreamingSupported,
                    },
                    pricing: pricingInfo ? {
                      inputTokenPrice: pricingInfo.inputTokenPrice,
                      outputTokenPrice: pricingInfo.outputTokenPrice,
                      currency: 'USD',
                      region: this.appConfig.region,
                    } : undefined,
                  } : undefined,
                  usage: {
                    inputTokens: usage.promptTokens || 0,
                    outputTokens: usage.completionTokens || 0,
                    totalTokens: usage.totalTokens || 0,
                    estimatedCost: cost,
                  },
                }
              );
            }
          } catch (error) {
            this.logger.error('Failed to enrich message with model metadata', { error });
          }
        } catch (error) {
          this.logger.error('Failed to update conversation stats', { error });
        }
      },
    });
  }

  /**
   * Calculate estimated cost based on model and token usage
   * Uses dynamic pricing from AWS Pricing API
   */
  private async calculateCost(modelId: string, usage: { promptTokens?: number; completionTokens?: number }): Promise<number> {
    const inputTokens = usage.promptTokens || 0;
    const outputTokens = usage.completionTokens || 0;

    if (!this.modelCatalog) {
      return 0;
    }

    try {
      const pricing = await this.modelCatalog.getModelPricing(this.appConfig.region);
      const modelPricing = pricing.find(p => 
        p.modelId === modelId || 
        modelId.includes(p.modelId.toLowerCase().replace(/\s+/g, '-'))
      );

      if (modelPricing) {
        const inputCost = (inputTokens / 1000) * (modelPricing.inputTokenPrice || 0);
        const outputCost = (outputTokens / 1000) * (modelPricing.outputTokenPrice || 0);
        return inputCost + outputCost;
      }
    } catch (error) {
      this.logger.warn('Failed to fetch pricing, using default', { error });
    }

    // Fallback to default pricing
    return (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
  }

  /**
   * Calculate context window usage percentage
   * Note: Context window size is not available via API, using 200k default
   */
  private calculateContextWindowPercentage(modelId: string, totalTokens: number): number {
    const maxTokens = 200000; // Default context window
    return Math.round((totalTokens / maxTokens) * 100 * 100) / 100;
  }

  /**
   * Get original tool name from normalized name
   */
  private getOriginalToolName(normalizedName: string): string {
    const mapping = this.toolNameMapping.get(normalizedName);
    return mapping?.original || normalizedName;
  }

  /**
   * Get normalized tool name from original name
   */
  private getNormalizedToolName(originalName: string): string {
    return this.toolNameReverseMapping.get(originalName) || originalName;
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

    let mcpConfig: MCPConfiguration;
    let isNewConfig = false;

    // Check if MCP config already exists
    if (this.mcpConfigs.has(mcpKey)) {
      mcpConfig = this.mcpConfigs.get(mcpKey)!;
    } else {
      // Create new MCP configuration
      const serverConfig: any = {
        [toolId]: this.createMCPServerConfig(toolDef),
      };

      mcpConfig = new MCPConfiguration({
        servers: serverConfig,
      });

      this.mcpConfigs.set(mcpKey, mcpConfig);
      isNewConfig = true;
      
      // Set up event listeners for connection status
      const clients = await mcpConfig.getClients();
      const client = clients[toolId];
      
      if (client) {
        client.on('connect', () => {
          this.mcpConnectionStatus.set(mcpKey, { connected: true });
          this.logger.debug('MCP client connected', { agent: agentSlug, tool: toolId });
        });
        
        client.on('disconnect', () => {
          this.mcpConnectionStatus.set(mcpKey, { connected: false });
          this.logger.debug('MCP client disconnected', { agent: agentSlug, tool: toolId });
        });
        
        client.on('error', (error: Error) => {
          this.mcpConnectionStatus.set(mcpKey, { connected: false, error: error.message });
          this.logger.error('MCP client error', { agent: agentSlug, tool: toolId, error: error.message });
        });
      }
    }

    // Get tools from MCP server
    const tools = await mcpConfig.getTools();
    
    // Normalize tool names for Nova compatibility and store mapping with parsed data
    const normalizedTools = tools.map(tool => {
      const normalized = normalizeToolName(tool.name);
      
      // Store mapping with parsed data if name changed
      if (normalized !== tool.name) {
        const parsed = parseToolName(tool.name);
        this.toolNameMapping.set(normalized, {
          original: tool.name,
          normalized: normalized,
          server: parsed.server,
          tool: parsed.tool
        });
        this.toolNameReverseMapping.set(tool.name, normalized);
        
        this.logger.debug('Tool name normalized', {
          agent: agentSlug,
          original: tool.name,
          normalized: normalized,
          server: parsed.server,
          tool: parsed.tool
        });
      }
      
      return {
        ...tool,
        name: normalized
      };
    });
    
    // Mark as connected after successful getTools
    this.mcpConnectionStatus.set(mcpKey, { connected: true });
    
    // Store integration metadata
    this.integrationMetadata.set(mcpKey, {
      type: 'mcp',
      transport: toolDef.transport,
      toolCount: normalizedTools.length,
    });

    if (isNewConfig) {
      this.logger.info('MCP tools loaded', { 
        agent: agentSlug, 
        tool: toolId, 
        count: normalizedTools.length,
        sampleNames: normalizedTools.slice(0, 3).map(t => t.name)
      });
    }

    // Always wrap tools with elicitation for approval (agent config may have changed)
    const spec = await this.configLoader.loadAgent(agentSlug);
    const wrappedTools = normalizedTools.map(tool => this.wrapToolWithElicitation(tool, spec));

    return wrappedTools;
  }

  /**
   * Wrap a tool to add elicitation-based approval for non-auto-approved tools
   */
  private wrapToolWithElicitation(tool: Tool<any>, spec: AgentSpec): Tool<any> {
    if (!spec?.tools) return tool;

    const autoApprove = spec.tools.autoApprove || [];
    const isAutoApproved = autoApprove.some(pattern => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) {
        return tool.name.startsWith(pattern.slice(0, -1));
      }
      return tool.name === pattern;
    });

    if (isAutoApproved) {
      this.logger.debug('[Wrapper] Tool auto-approved, skipping wrapper', { toolName: tool.name });
      return tool;
    }

    this.logger.debug('[Wrapper] Wrapping tool with elicitation', { toolName: tool.name });

    // Wrap the execute function
    const originalExecute = tool.execute;
    if (!originalExecute) return tool;

    return {
      ...tool,
      execute: async (args: any, options: any) => {
        // Get elicitation from options (VoltAgent passes OperationContext properties directly)
        const elicitation = options?.elicitation;
        
        this.logger.debug('[Wrapper] Tool execute called, requesting approval', { 
          toolName: tool.name,
          hasElicitation: !!elicitation
        });

        // Request approval via elicitation
        if (elicitation) {
          this.logger.debug('[Wrapper] Calling elicitation for approval', { toolName: tool.name });
          
          const approved = await elicitation({
            type: 'tool-approval',
            toolName: tool.name,
            toolDescription: (tool as any).description || '',
            toolArgs: args,
          });

          this.logger.info('[Wrapper] Tool approval decision', { 
            toolName: tool.name, 
            approved,
            reason: approved ? 'user_approved' : 'user_denied'
          });

          if (!approved) {
            // Return a clear message to the LLM instead of throwing an error
            return {
              success: false,
              error: 'USER_DENIED',
              message: `I requested permission to use this tool, but the user explicitly denied the request. I should ask what I should do differently.`
            };
          }
        } else {
          this.logger.info('[Wrapper] Tool auto-approved (no elicitation available)', { 
            toolName: tool.name 
          });
        }

        // Execute the original tool
        return originalExecute(args, options);
      }
    };
  }

  /**
   * Create MCP server configuration from tool definition
   */
  private createMCPServerConfig(toolDef: ToolDef): any {
    if (toolDef.transport === 'stdio' || toolDef.transport === 'process') {
      // Replace ./ with actual cwd for cross-platform compatibility
      const args = (toolDef.args || []).map(arg => 
        arg === './' ? process.cwd() : arg
      );
      
      return {
        type: 'stdio',
        command: toolDef.command,
        args,
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
   * Replace template variables in prompts
   */
  private replaceTemplateVariables(text: string): string {
    const now = new Date();
    
    // Built-in variables (always available)
    const builtInReplacements: Record<string, string> = {
      '{{date}}': now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      '{{time}}': now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }),
      '{{datetime}}': now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      '{{iso_date}}': now.toISOString().split('T')[0],
      '{{iso_datetime}}': now.toISOString(),
      '{{timestamp}}': now.getTime().toString(),
      '{{year}}': now.getFullYear().toString(),
      '{{month}}': (now.getMonth() + 1).toString(),
      '{{day}}': now.getDate().toString(),
      '{{weekday}}': now.toLocaleDateString('en-US', { weekday: 'long' }),
    };

    // Custom variables from config
    const customReplacements: Record<string, string> = {};
    if (this.appConfig.templateVariables) {
      for (const variable of this.appConfig.templateVariables) {
        const key = `{{${variable.key}}}`;
        
        switch (variable.type) {
          case 'static':
            customReplacements[key] = variable.value || '';
            break;
          case 'date':
            customReplacements[key] = variable.format 
              ? now.toLocaleDateString('en-US', JSON.parse(variable.format))
              : now.toLocaleDateString();
            break;
          case 'time':
            customReplacements[key] = variable.format
              ? now.toLocaleTimeString('en-US', JSON.parse(variable.format))
              : now.toLocaleTimeString();
            break;
          case 'datetime':
            customReplacements[key] = variable.format
              ? now.toLocaleString('en-US', JSON.parse(variable.format))
              : now.toLocaleString();
            break;
          case 'custom':
            // For future extensibility (e.g., environment variables, API calls)
            customReplacements[key] = variable.value || '';
            break;
        }
      }
    }

    // Apply all replacements
    let result = text;
    const allReplacements = { ...builtInReplacements, ...customReplacements };
    
    for (const [key, value] of Object.entries(allReplacements)) {
      result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }
    
    return result;
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
    this.voltAgent?.registerAgent(agent);

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

    // Stop scheduler
    if (this.scheduler) {
      await this.scheduler.shutdown();
      this.logger.info('Scheduler stopped');
    }

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
