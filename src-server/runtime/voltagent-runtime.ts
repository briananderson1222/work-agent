/**
 * VoltAgent runtime integration for Work Agent
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { Agent, Memory, VoltAgent, MCPConfiguration, createHooks, type Tool } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import { createPinoLogger } from '@voltagent/logger';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { FileVoltAgentMemoryAdapter } from '../adapters/file/voltagent-memory-adapter.js';
import { ConfigLoader } from '../domain/config-loader.js';
import { createBedrockProvider } from '../providers/bedrock.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
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
  private agentMetadataMap: Map<string, any> = new Map();
  private memoryAdapters: Map<string, FileVoltAgentMemoryAdapter> = new Map();
  private agentTools: Map<string, Tool<any>[]> = new Map(); // Cache loaded tools per agent
  private modelCatalog?: BedrockModelCatalog;
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

    // Initialize Bedrock model catalog
    this.modelCatalog = new BedrockModelCatalog(this.appConfig.region);
    this.logger.info('Bedrock model catalog initialized');

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
    this.agentMetadataMap = new Map(
      agentMetadataList.map(meta => [meta.slug, meta])
    );
    this.logger.info('Agent metadata map created', { 
      count: this.agentMetadataMap.size,
      keys: Array.from(this.agentMetadataMap.keys()),
      sample: this.agentMetadataMap.get(agentMetadataList[0]?.slug)
    });

    // Initialize VoltAgent with all agents and server
    this.voltAgent = new VoltAgent({
      agents,
      logger: this.logger,
      server: honoServer({
        port: this.port,
        configureApp: (app) => {
          // Global error handler middleware
          app.onError((err, c) => {
            const errorMsg = err.message || '';
            const isAuthError = errorMsg.includes('authentication failed') ||
                                errorMsg.includes('status code 403') ||
                                errorMsg.includes('Request failed with status code 403') ||
                                errorMsg.includes('Midway') ||
                                errorMsg.includes('Form action URL not found');
            
            if (isAuthError) {
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

          // Custom endpoint for enriched agent list (use /api prefix to avoid VoltAgent routes)
          app.get('/api/agents', async (c) => {
            if (!this.voltAgent) {
              return c.json({ success: false, error: 'VoltAgent not initialized' }, 500);
            }
            const coreAgents = await this.voltAgent.getAgents();
            const enrichedAgents = coreAgents.map((agent: any) => {
              const metadata = this.agentMetadataMap.get(agent.id);
              return metadata ? {
                ...agent,
                slug: metadata.slug,
                name: metadata.name,
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

              return c.json({ success: true }, 200);
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

              return c.json({ success: true }, 200);
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

          // === Bedrock Model Catalog Endpoints ===

          // List all available Bedrock models
          app.get('/bedrock/models', async (c) => {
            try {
              if (!this.modelCatalog) {
                return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
              }
              const models = await this.modelCatalog.listModels();
              return c.json({ success: true, data: models });
            } catch (error: any) {
              this.logger.error('Failed to list Bedrock models', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Get pricing for Bedrock models
          app.get('/bedrock/pricing', async (c) => {
            try {
              if (!this.modelCatalog) {
                return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
              }
              const region = c.req.query('region') || this.appConfig.region;
              const pricing = await this.modelCatalog.getModelPricing(region);
              return c.json({ success: true, data: pricing });
            } catch (error: any) {
              this.logger.error('Failed to get Bedrock pricing', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Validate a model ID
          app.get('/bedrock/models/:modelId/validate', async (c) => {
            try {
              if (!this.modelCatalog) {
                return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
              }
              const modelId = c.req.param('modelId');
              const isValid = await this.modelCatalog.validateModelId(modelId);
              return c.json({ success: true, data: { modelId, isValid } });
            } catch (error: any) {
              this.logger.error('Failed to validate model ID', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Get model info
          app.get('/bedrock/models/:modelId', async (c) => {
            try {
              if (!this.modelCatalog) {
                return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
              }
              const modelId = c.req.param('modelId');
              const model = await this.modelCatalog.getModelInfo(modelId);
              if (!model) {
                return c.json({ success: false, error: 'Model not found' }, 404);
              }
              return c.json({ success: true, data: model });
            } catch (error: any) {
              this.logger.error('Failed to get model info', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // === Conversation Endpoints ===

          // Get conversations for an agent
          app.get('/agents/:slug/conversations', async (c) => {
            try {
              const slug = c.req.param('slug');
              const adapter = this.memoryAdapters.get(slug);
              
              if (!adapter) {
                return c.json({ success: true, data: [] });
              }

              const conversations = await adapter.getConversations(`agent:${slug}`);
              
              return c.json({ success: true, data: conversations });
            } catch (error: any) {
              this.logger.error('Failed to load conversations', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          app.get('/agents/:slug/conversations/:conversationId/messages', async (c) => {
            try {
              const slug = c.req.param('slug');
              const conversationId = c.req.param('conversationId');
              const adapter = this.memoryAdapters.get(slug);
              
              if (!adapter) {
                return c.json({ success: true, data: [] });
              }

              const messages = await adapter.getMessages(`agent:${slug}`, conversationId);
              
              return c.json({ success: true, data: messages });
            } catch (error: any) {
              this.logger.error('Failed to load messages', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Get conversation statistics
          app.get('/agents/:slug/conversations/:conversationId/stats', async (c) => {
            try {
              const slug = c.req.param('slug');
              const conversationId = c.req.param('conversationId');
              const adapter = this.memoryAdapters.get(slug);
              
              if (!adapter) {
                return c.json({ success: false, error: 'Memory adapter not found' }, 404);
              }

              const conversation = await adapter.getConversation(conversationId);
              
              if (!conversation) {
                return c.json({ success: false, error: 'Conversation not found' }, 404);
              }

              const stats = conversation.metadata?.stats || {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                turns: 0,
                toolCalls: 0,
                estimatedCost: 0,
              };

              const modelStats = conversation.metadata?.modelStats || {};

              // Calculate context window percentage using actual total tokens
              const agent = this.activeAgents.get(slug);
              const spec = await this.configLoader.loadAgent(slug);
              const modelId = spec.model || this.appConfig.defaultModel;
              
              const contextWindowPercentage = this.calculateContextWindowPercentage(modelId, stats.totalTokens);

              return c.json({ 
                success: true, 
                data: {
                  ...stats,
                  contextWindowPercentage,
                  conversationId,
                  modelId,
                  modelStats,
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
              const { prompt, silent = true, model, tools: toolNames } = await c.req.json();

              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              // Invoke agent using generateText with simple prompt string
              // Don't pass userId/conversationId to avoid loading empty conversation history
              const options: any = {};
              if (model) {
                options.model = createBedrockProvider({ 
                  appConfig: this.appConfig, 
                  agentSpec: { model } as any 
                });
              }
              
              // Override tools if specified - filter agent's tools by name
              if (toolNames && Array.isArray(toolNames)) {
                const agentTools = agent.tools || [];
                options.tools = agentTools.filter((t: any) => 
                  toolNames.includes(t.name)
                );
              }
              
              const result = await agent.generateText(prompt, options);

              return c.json({ 
                success: true, 
                response: result.text,
                usage: result.usage
              });
            } catch (error: any) {
              this.logger.error('Failed to invoke agent', { error });
              // Check if it's an authentication error
              const errorMsg = error.message || '';
              const isAuthError = errorMsg.includes('authentication failed') ||
                                  errorMsg.includes('status code 403') ||
                                  errorMsg.includes('Request failed with status code 403') ||
                                  errorMsg.includes('Midway') ||
                                  errorMsg.includes('Form action URL not found');
              return c.json({ success: false, error: error.message }, isAuthError ? 401 : 500);
            }
          });

          // Raw MCP tool call (no transformation, no LLM)
          app.post('/agents/:slug/tools/:toolName', async (c) => {
            const endpointStart = performance.now();
            console.log('\n=== RAW TOOL CALL START ===');
            
            try {
              const slug = c.req.param('slug');
              const toolName = c.req.param('toolName');
              const toolArgs = await c.req.json();
              
              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }
              
              const allTools = this.agentTools.get(slug) || [];
              const tool = allTools.find(t => t.name === toolName);
              if (!tool) {
                return c.json({ success: false, error: `Tool ${toolName} not found` }, 404);
              }
              
              console.log(`[Tool Call] ${toolName}`);
              const toolStart = performance.now();
              const toolResult = await (tool as any).execute(toolArgs);
              const toolDuration = performance.now() - toolStart;
              console.log(`[Tool Complete] ${toolDuration.toFixed(2)}ms`);
              
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
              
              console.log(`=== RAW TOOL TOTAL: ${(performance.now() - endpointStart).toFixed(2)}ms ===\n`);
              
              return c.json({
                success: true,
                response: unwrappedResult,
                debug: {
                  toolDuration,
                  totalDuration: performance.now() - endpointStart
                }
              });
            } catch (error: any) {
              console.log(`=== RAW TOOL ERROR: ${(performance.now() - endpointStart).toFixed(2)}ms ===\n`);
              this.logger.error('Failed to call tool', { error });
              // Check if it's an authentication error
              const errorMsg = error.message || '';
              const isAuthError = errorMsg.includes('authentication failed') ||
                                  errorMsg.includes('status code 403') ||
                                  errorMsg.includes('Request failed with status code 403') ||
                                  errorMsg.includes('Midway') ||
                                  errorMsg.includes('Form action URL not found');
              return c.json({ success: false, error: error.message }, isAuthError ? 401 : 500);
            }
          });

          // Pure transformation endpoint (no LLM, just data mapping)
          app.post('/agents/:slug/invoke/transform', async (c) => {
            const endpointStart = performance.now();
            
            try {
              const slug = c.req.param('slug');
              const { toolName, toolArgs, transform } = await c.req.json();
              
              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }
              
              const allTools = this.agentTools.get(slug) || [];
              const tool = allTools.find(t => t.name === toolName);
              if (!tool) {
                return c.json({ success: false, error: `Tool ${toolName} not found` }, 404);
              }
              
              // Execute tool
              const toolStart = performance.now();
              console.log('[Tool args]', JSON.stringify(toolArgs));
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
              
              console.log('[Unwrapped result]', JSON.stringify(unwrappedResult));
              
              // Check if the MCP tool returned an error
              if (unwrappedResult?.success === false && unwrappedResult?.error) {
                const errorMessage = unwrappedResult.error?.message?.message || unwrappedResult.error?.message || unwrappedResult.error;
                const errorStr = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
                
                // Check if it's an auth error
                if (errorStr.includes('Form action URL not found') || 
                    errorStr.includes('Midway') || 
                    errorStr.includes('authentication') ||
                    errorStr.includes('status code 403') ||
                    errorStr.includes('Request failed with status code 403') ||
                    errorStr.includes('mwinit')) {
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
                debug: {
                  toolDuration,
                  transformDuration,
                  totalDuration: performance.now() - endpointStart
                }
              });
            } catch (error: any) {
              this.logger.error('Failed to transform invoke', { error });
              // Check if it's an authentication error
              const errorMsg = error.message || '';
              console.log('[Auth Check]', { errorMsg, includes403: errorMsg.includes('status code 403') });
              const isAuthError = errorMsg.includes('authentication failed') ||
                                  errorMsg.includes('status code 403') ||
                                  errorMsg.includes('Request failed with status code 403') ||
                                  errorMsg.includes('Midway') ||
                                  errorMsg.includes('Form action URL not found');
              console.log('[Auth Error?]', isAuthError);
              return c.json({ success: false, error: error.message }, isAuthError ? 401 : 500);
            }
          });

          app.post('/agents/:slug/invoke/stream', async (c) => {
            const endpointStart = performance.now();
            try {
              const slug = c.req.param('slug');
              const { prompt, silent = true, model, tools: toolNames, maxSteps = 10, schema: schemaJson } = await c.req.json();

              const agentLookupStart = performance.now();
              const agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }
              console.log(`Agent lookup: ${(performance.now() - agentLookupStart).toFixed(2)}ms`);

              const options: any = { maxSteps, maxOutputTokens: 2000 };
              if (model) {
                const modelStart = performance.now();
                options.model = createBedrockProvider({ 
                  appConfig: this.appConfig, 
                  agentSpec: { model } as any 
                });
                console.log(`Model creation: ${(performance.now() - modelStart).toFixed(2)}ms`);
              }
              
              // Override tools if specified - create temp agent with only filtered tools
              if (toolNames && Array.isArray(toolNames)) {
                const toolFilterStart = performance.now();
                const allTools = this.agentTools.get(slug) || [];
                const filteredTools = allTools.filter(t => toolNames.includes(t.name));
                console.log(`Tool filtering: ${(performance.now() - toolFilterStart).toFixed(2)}ms`);
                
                console.log('=== TOOL FILTERING ===');
                console.log('Requested:', toolNames);
                console.log('Available:', allTools.length);
                console.log('Filtered:', filteredTools.length);
                
                // Create temporary agent with ONLY the filtered tools
                const agentCreateStart = performance.now();
                const tempAgent = new Agent({
                  name: `${slug}-temp`,
                  instructions: agent.instructions,
                  model: options.model || agent.model,
                  tools: filteredTools,
                  maxSteps,
                  hooks: agent.hooks, // Copy hooks from main agent
                });
                console.log(`Agent creation: ${(performance.now() - agentCreateStart).toFixed(2)}ms`);
                
                const generateStart = performance.now();
                
                // generateObject cannot use tools, so use generateText with JSON mode
                if (schemaJson) {
                  const textResult = await tempAgent.generateText(
                    `${prompt}\n\nReturn ONLY valid JSON matching this schema (no markdown, no explanation):\n${JSON.stringify(schemaJson, null, 2)}`
                  );
                  console.log(`generateText: ${(performance.now() - generateStart).toFixed(2)}ms`);
                  console.log(`=== ENDPOINT TOTAL: ${(performance.now() - endpointStart).toFixed(2)}ms ===\n`);
                  
                  // Extract JSON from response (handles markdown code blocks)
                  let parsed;
                  try {
                    const cleaned = textResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    parsed = JSON.parse(cleaned);
                  } catch {
                    // Fallback: try to find JSON object in text
                    const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
                    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse JSON' };
                  }
                  
                  return c.json({ 
                    success: true, 
                    response: parsed,
                    usage: textResult.usage,
                    debug: {
                      totalTools: allTools.length,
                      filteredTools: filteredTools.length,
                      toolNames: filteredTools.map(t => t.name)
                    }
                  });
                }
                
                const result = await tempAgent.generateText(prompt);
                console.log(`generateText: ${(performance.now() - generateStart).toFixed(2)}ms`);
                console.log(`=== ENDPOINT TOTAL: ${(performance.now() - endpointStart).toFixed(2)}ms ===\n`);
                
                return c.json({ 
                  success: true, 
                  response: result.text,
                  usage: result.usage,
                  debug: {
                    totalTools: allTools.length,
                    filteredTools: filteredTools.length,
                    toolNames: filteredTools.map(t => t.name)
                  }
                });
              }

              // For multi-turn, use generateText/generateObject and return result
              const generateStart = performance.now();
              const result = schemaJson
                ? await agent.generateObject(prompt, jsonSchema(schemaJson), options)
                : await agent.generateText(prompt, options);
              
              console.log(`generate${schemaJson ? 'Object' : 'Text'}: ${(performance.now() - generateStart).toFixed(2)}ms`);
              console.log(`=== ENDPOINT TOTAL: ${(performance.now() - endpointStart).toFixed(2)}ms ===\n`);
              
              return c.json({ 
                success: true, 
                response: schemaJson ? result.object : result.text,
                usage: result.usage,
                debug: options.debugInfo || { message: 'No tool filtering applied' }
              });
            } catch (error: any) {
              this.logger.error('Failed to stream invoke', { error });
              return c.json({ success: false, error: error.message }, 500);
            }
          });

          // Chat endpoint for UI - handles streaming with model overrides
          app.post('/agents/:slug/chat', async (c) => {
            try {
              const slug = c.req.param('slug');
              const { input, options = {} } = await c.req.json();
              const { model: modelOverride, ...restOptions } = options;

              let agent = this.activeAgents.get(slug);
              if (!agent) {
                return c.json({ success: false, error: 'Agent not found' }, 404);
              }

              // If model override, get or create cached agent with that model
              if (modelOverride) {
                const cacheKey = `${slug}:${modelOverride}`;
                let cachedAgent = this.activeAgents.get(cacheKey);
                
                if (!cachedAgent) {
                  // Get the original agent spec to preserve region and other settings
                  const originalSpec = this.agentSpecs.get(slug);
                  
                  const newModel = createBedrockProvider({
                    appConfig: this.appConfig,
                    agentSpec: { 
                      model: modelOverride,
                      region: originalSpec?.region || this.appConfig.region
                    } as any
                  });
                  
                  cachedAgent = new Agent({
                    ...agent,
                    name: cacheKey,
                    model: newModel,
                  });
                  
                  this.activeAgents.set(cacheKey, cachedAgent);
                }
                
                agent = cachedAgent;
              }

              // Use VoltAgent's streamText for proper SSE formatting
              const result = await agent.streamText(input, restOptions);

              // Set SSE headers
              c.header('Content-Type', 'text/event-stream');
              c.header('Cache-Control', 'no-cache');
              c.header('Connection', 'keep-alive');

              return stream(c, async (streamWriter) => {
                try {
                  for await (const chunk of result.fullStream) {
                    await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
                  }
                  await streamWriter.write('data: [DONE]\n\n');
                } catch (error: any) {
                  this.logger.error('Stream error', { error });
                  await streamWriter.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
                }
              });
            } catch (error: any) {
              this.logger.error('Chat error', { error });
              return c.json({ success: false, error: error.message }, 500);
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
    const memoryAdapter = new FileVoltAgentMemoryAdapter({
      workAgentDir: this.configLoader.getWorkAgentDir(),
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
    for (const pattern of patterns) {
      // Exact match
      if (pattern === toolName) return true;
      
      // Wildcard pattern (e.g., "sat-outlook_*")
      if (pattern.endsWith('_*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(`${prefix}_`)) return true;
      }
      
      // Legacy slash pattern support (e.g., "sat-outlook/*")
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(`${prefix}_`) || toolName.startsWith(`${prefix}/`)) return true;
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
        // Check if this is a silent invocation (no conversationId means silent mode)
        const isSilentInvocation = !context.conversationId;
        
        if (isSilentInvocation) {
          return;
        }

        // Check if tool is in autoApprove list
        if (autoApprove.length > 0) {
          const isAutoApproved = this.matchesToolPattern(tool.name, autoApprove);
          
          if (!isAutoApproved) {
            if (context.elicitation) {
              const approved = await context.elicitation({
                type: 'tool-approval',
                toolName: tool.name,
                message: `Allow ${tool.name}?`,
              });
              
              if (!approved) {
                throw new Error(`Tool ${tool.name} requires user approval`);
              }
            } else {
              this.logger.warn('Tool requires approval but no elicitation available', {
                tool: tool.name,
                context: context.operationId,
              });
            }
          }
        }
      },
      onEnd: async ({ context, output, agent }) => {
        // Only track stats for conversations (not silent invocations)
        if (!context.conversationId || !output) {
          return;
        }

        try {
          const memory = agent.memory;
          if (!memory) return;

          // Get current conversation
          const conversation = await memory.getConversation(context.conversationId);
          if (!conversation) return;

          // Extract usage data
          const usage = 'usage' in output ? output.usage : undefined;
          if (!usage) return;

          // Count tool calls from context steps
          const toolCallCount = context.steps?.reduce((count, step) => {
            return count + (step.toolInvocations?.length || 0);
          }, 0) || 0;

          // Get existing stats or initialize
          const existingStats = conversation.metadata?.stats || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
            estimatedCost: 0,
          };

          const modelId = spec.model || this.appConfig.defaultModel;
          const cost = await this.calculateCost(modelId, usage);

          // Update cumulative stats
          const updatedStats = {
            inputTokens: existingStats.inputTokens + (usage.promptTokens || 0),
            outputTokens: existingStats.outputTokens + (usage.completionTokens || 0),
            totalTokens: existingStats.totalTokens + (usage.totalTokens || 0),
            turns: existingStats.turns + 1,
            toolCalls: existingStats.toolCalls + toolCallCount,
            estimatedCost: existingStats.estimatedCost + cost,
          };

          // Track per-model stats
          const modelStats = (conversation.metadata?.modelStats || {}) as Record<string, any>;
          const currentModelStats = modelStats[modelId] || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
            estimatedCost: 0,
          };

          modelStats[modelId] = {
            inputTokens: currentModelStats.inputTokens + (usage.promptTokens || 0),
            outputTokens: currentModelStats.outputTokens + (usage.completionTokens || 0),
            totalTokens: currentModelStats.totalTokens + (usage.totalTokens || 0),
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

    this.logger.info('MCP tools loaded', { 
      agent: agentSlug, 
      tool: toolId, 
      count: tools.length,
      sampleNames: tools.slice(0, 3).map(t => t.name)
    });

    return tools;
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
