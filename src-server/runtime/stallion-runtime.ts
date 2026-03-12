/**
 * VoltAgent runtime integration for Stallion
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { EventEmitter } from 'node:events';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  Agent,
  type MCPConfiguration,
  type Tool,
  VoltAgent,
} from '@voltagent/core';
import { type HonoServerConfig, honoServer } from '@voltagent/server-hono';
import { jsonSchema } from 'ai';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { UsageAggregator } from '../analytics/usage-aggregator.js';
import {
  ConfigLoader,
  DEFAULT_SYSTEM_PROMPT,
} from '../domain/config-loader.js';
import type { AgentSpec, AppConfig } from '../domain/types.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { createEventRoutes } from '../routes/events.js';
import { EventBus } from '../services/event-bus.js';
import {
  chatDuration,
  chatErrors,
  chatRequests,
  registerObservableGauges,
  tokensInput,
  tokensOutput,
  tracer,
} from '../telemetry/metrics.js';
import { createLogger } from '../utils/logger.js';
import { createAgentHooks } from './agent-hooks.js';
import * as ConversationManager from './conversation-manager.js';
import * as MCPManager from './mcp-manager.js';
import { StrandsFramework } from './strands-adapter.js';
import * as StreamOrchestrator from './stream-orchestrator.js';
import * as ToolExecutor from './tool-executor.js';
import { VoltAgentFramework } from './voltagent-adapter.js';

// Type extensions for VoltAgent SDK
interface ToolWithDescription extends Omit<Tool<any>, 'description'> {
  description?: string;
}

interface GenerateResult {
  object?: any;
  text?: string;
  usage?: any;
}

interface ToolResult {
  content?: Array<{ text: string }>;
  success?: boolean;
  error?: {
    message?: string | { message?: string };
  };
  response?: any;
  [key: string]: any; // Allow additional properties
}

import { FileTerminalHistoryStore } from '../adapters/file-terminal-history-store.js';
import { NodePtyAdapter } from '../adapters/node-pty-adapter.js';
import { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import { migrateToProject } from '../domain/migration.js';
import { JsonManifestRegistryProvider } from '../providers/json-manifest-registry.js';
import { LanceDBProvider } from '../providers/lancedb-provider.js';
import {
  getNotificationProviders,
  listProviders,
  registerAgentRegistryProvider,
  registerIntegrationRegistryProvider,
} from '../providers/registry.js';
import { createAgentRoutes } from '../routes/agents.js';
import { createAnalyticsRoutes } from '../routes/analytics.js';
import { createAuthRoutes, createUserRoutes } from '../routes/auth.js';
import { createBedrockRoutes } from '../routes/bedrock.js';
import { createBrandingRoutes } from '../routes/branding.js';
import { createCodingRoutes } from '../routes/coding.js';
import { createConfigRoutes } from '../routes/config.js';
import { createConversationRoutes } from '../routes/conversations.js';
import { createFeedbackRoutes } from '../routes/feedback.js';
import { createFsRoutes } from '../routes/fs.js';
import {
  createCrossProjectKnowledgeRoutes,
  createKnowledgeRoutes,
} from '../routes/knowledge.js';
import { createLayoutRoutes, createWorkflowRoutes } from '../routes/layouts.js';
import modelsRoute from '../routes/models.js';
import { createMonitoringRoutes } from '../routes/monitoring.js';
import { createNotificationRoutes } from '../routes/notifications.js';
import { createPluginRoutes } from '../routes/plugins.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createPromptRoutes } from '../routes/prompts.js';
import { createProviderRoutes } from '../routes/providers.js';
import { createRegistryRoutes } from '../routes/registry.js';
import { createSchedulerRoutes } from '../routes/scheduler.js';
import { createSystemRoutes } from '../routes/system.js';
import { createTemplateRoutes } from '../routes/templates.js';
import { createToolRoutes } from '../routes/tools.js';
import { ACPManager } from '../services/acp-bridge.js';
import { AgentService } from '../services/agent-service.js';
import { ApprovalRegistry } from '../services/approval-registry.js';
import { FeedbackService } from '../services/feedback-service.js';
import { FileTreeService } from '../services/file-tree-service.js';
import { KnowledgeService } from '../services/knowledge-service.js';
import { LayoutService } from '../services/layout-service.js';
import {
  createLLMProviderFromConfig,
  streamWithProvider,
} from '../services/llm-router.js';
import { MCPService } from '../services/mcp-service.js';
import { NotificationService } from '../services/notification-service.js';
import { ProjectService } from '../services/project-service.js';
import { PromptService } from '../services/prompt-service.js';
import { ProviderService } from '../services/provider-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import { TerminalService } from '../services/terminal-service.js';
import { TerminalWebSocketServer } from '../services/terminal-ws-server.js';
import { isAuthError } from '../utils/auth-errors.js';
import { InjectableStream } from './streaming/InjectableStream.js';

export interface StallionRuntimeOptions {
  projectHomeDir?: string;
  port?: number;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

/**
 * Main runtime for Stallion system
 * Manages VoltAgent instances with dynamic agent loading
 */
export class StallionRuntime {
  private configLoader: ConfigLoader;
  private appConfig!: AppConfig;
  private logger: ReturnType<typeof createLogger>;
  private voltAgent?: VoltAgent;
  private mcpConfigs: Map<string, MCPConfiguration> = new Map();
  private mcpConnectionStatus: Map<
    string,
    { connected: boolean; error?: string }
  > = new Map();
  private integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  > = new Map();
  private activeAgents: Map<string, any> = new Map();
  private agentMetadataMap: Map<string, any> = new Map();
  private agentSpecs: Map<string, AgentSpec> = new Map(); // Cache agent specs
  private memoryAdapters: Map<string, FileMemoryAdapter> = new Map();
  private agentTools: Map<string, Tool<any>[]> = new Map(); // Cache loaded tools per agent
  private globalToolRegistry: Map<string, Tool<any>> = new Map(); // All unique tools by name
  private agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  > = new Map(); // Cache fixed token counts per agent
  private agentHooksMap: Map<string, ReturnType<typeof createAgentHooks>> =
    new Map();
  private toolNameMapping: Map<
    string,
    {
      original: string;
      normalized: string;
      server: string | null;
      tool: string;
    }
  > = new Map(); // Tool name mapping with parsed data
  private toolNameReverseMapping: Map<string, string> = new Map(); // Original -> Normalized for O(1) lookup
  private monitoringEvents = new EventEmitter();
  private agentStats = new Map<
    string,
    { conversationCount: number; messageCount: number; lastUpdated: number }
  >();
  private agentStatus = new Map<string, 'idle' | 'running'>();
  private metricsLog: Array<{
    timestamp: number;
    agentSlug: string;
    event: string;
    conversationId?: string;
    messageCount?: number;
    cost?: number;
  }> = [];
  private eventLogPath: string;
  private persistedEvents: Array<any> = [];
  private modelCatalog?: BedrockModelCatalog;
  private usageAggregator?: UsageAggregator;
  private port: number;
  private approvalRegistry: ApprovalRegistry;

  // Services
  private agentService!: AgentService;
  private mcpService!: MCPService;
  private layoutService!: LayoutService;
  private storageAdapter!: FileStorageAdapter;
  private projectService!: ProjectService;
  private providerService!: ProviderService;
  private knowledgeService!: KnowledgeService;
  private fileTreeService!: FileTreeService;
  private terminalService!: TerminalService;
  private terminalWsServer!: TerminalWebSocketServer;
  private acpBridge: ACPManager;
  private feedbackService: FeedbackService;
  public readonly eventBus = new EventBus();
  private framework!: VoltAgentFramework | StrandsFramework;

  constructor(options: StallionRuntimeOptions = {}) {
    const projectHomeDir =
      options.projectHomeDir ||
      process.env.STALLION_AI_DIR ||
      join(homedir(), '.stallion-ai');
    this.port = options.port || 3141;
    this.eventLogPath = `${projectHomeDir}/monitoring`;

    this.configLoader = new ConfigLoader({
      projectHomeDir,
      watchFiles: true,
    });

    this.logger = createLogger({
      name: 'stallion',
      level: options.logLevel || 'info',
    });

    // Initialize services
    this.approvalRegistry = new ApprovalRegistry(this.logger);
    this.agentService = new AgentService(
      this.configLoader,
      this.activeAgents,
      this.agentMetadataMap,
      this.agentSpecs,
      this.logger,
    );
    this.mcpService = new MCPService(
      this.configLoader,
      this.mcpConfigs,
      this.mcpConnectionStatus,
      this.integrationMetadata,
      this.agentTools,
      this.toolNameMapping,
      this.logger,
    );
    this.layoutService = new LayoutService(this.configLoader, this.logger);
    this.storageAdapter = new FileStorageAdapter(
      this.configLoader.getProjectHomeDir(),
    );
    this.projectService = new ProjectService(this.storageAdapter);
    this.providerService = new ProviderService(this.storageAdapter, () =>
      this.configLoader.loadAppConfig(),
    );
    this.knowledgeService = new KnowledgeService(
      new LanceDBProvider({ dataDir: `${projectHomeDir}/vectordb` }),
      null,
      projectHomeDir,
      this.storageAdapter,
    );
    this.fileTreeService = new FileTreeService();
    const ptyAdapter = new NodePtyAdapter();
    const historyStore = new FileTerminalHistoryStore();
    this.terminalService = new TerminalService(ptyAdapter, historyStore);
    this.terminalWsServer = new TerminalWebSocketServer(this.terminalService);
    this.terminalWsServer.start(this.port + 1);
    this.acpBridge = new ACPManager(
      this.approvalRegistry,
      this.logger,
      process.cwd(),
      this.memoryAdapters,
      (_slug: string) => {
        const adapter = new FileMemoryAdapter({
          projectHomeDir: this.configLoader.getProjectHomeDir(),
          usageAggregator: this.usageAggregator,
        });
        return adapter;
      },
      { get: () => this.usageAggregator },
      this.eventBus,
    );

    // Log versions for debugging
    this.logger.info('Stallion Runtime initializing', {
      voltagentCore: '1.1.37',
      aiSdkBedrock: '3.0.56',
      nodeVersion: process.version,
    });

    // Feedback service (provider-agnostic — analyze callback set after agents load)
    this.feedbackService = new FeedbackService(projectHomeDir);
  }

  /**
   * Reload agents from disk
   */
  async reloadAgents(): Promise<void> {
    // Refresh app config so template variables (date/time) are current
    this.appConfig = await this.configLoader.loadAppConfig();
    const agentMetadataList = await this.configLoader.listAgents();
    const currentSlugs = new Set(agentMetadataList.map((m) => m.slug));

    // Remove deleted agents and cleanup MCP servers (skip built-in default)
    for (const slug of this.activeAgents.keys()) {
      if (slug === 'default') continue;
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

    // Update metadata map (preserve default agent)
    const defaultMeta = this.agentMetadataMap.get('default');
    this.agentMetadataMap = new Map(
      agentMetadataList.map((meta) => [meta.slug, meta]),
    );
    if (defaultMeta) this.agentMetadataMap.set('default', defaultMeta);

    this.logger.info('Agents reloaded', { count: agentMetadataList.length });
    this.eventBus.emit('agents:changed', { count: agentMetadataList.length });
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing Stallion Runtime...');

    // Load app configuration
    this.appConfig = await this.configLoader.loadAppConfig();

    // Select agent framework based on config
    const runtime = this.appConfig.runtime || 'voltagent';
    this.framework =
      runtime === 'strands' ? new StrandsFramework() : new VoltAgentFramework();
    this.logger.info('App config loaded', {
      region: this.appConfig.region,
      model: this.appConfig.defaultModel,
      runtime,
    });

    // Registry providers are registered by plugins via loadProviders()

    // Register default onboarding provider (checks Bedrock credentials)
    const { registerOnboardingProvider } = await import(
      '../providers/registry.js'
    );
    const { DefaultOnboardingProvider } = await import(
      '../providers/defaults.js'
    );
    registerOnboardingProvider(new DefaultOnboardingProvider());

    // JSON manifest fallback for environments without plugins
    if (this.appConfig.registryUrl) {
      const registryProvider = new JsonManifestRegistryProvider(
        this.appConfig.registryUrl,
        this.configLoader.getProjectHomeDir(),
      );
      registerAgentRegistryProvider(registryProvider);
      registerIntegrationRegistryProvider(registryProvider);
      this.logger.info('JSON manifest registry configured', {
        url: this.appConfig.registryUrl,
      });
    }

    // Initialize Bedrock model catalog
    this.modelCatalog = new BedrockModelCatalog(this.appConfig.region);
    this.logger.debug('Bedrock model catalog initialized');

    // Load plugin providers
    await this.loadPluginProviders();

    // Initialize usage aggregator
    this.usageAggregator = new UsageAggregator(
      this.configLoader.getProjectHomeDir(),
    );
    this.logger.debug('Usage aggregator initialized');

    // Background rescan on startup + every 30 min
    this.usageAggregator.fullRescan().catch(() => {});
    setInterval(
      () => {
        this.usageAggregator?.fullRescan().catch(() => {});
      },
      30 * 60 * 1000,
    );

    // Migrate legacy workspaces to project structure
    await migrateToProject(this.configLoader.getProjectHomeDir());

    // Seed default provider connections if none exist
    const existingProviders = this.storageAdapter.listProviderConnections();
    if (existingProviders.length === 0) {
      try {
        const { checkBedrockCredentials } = await import(
          '../providers/bedrock.js'
        );
        const hasCreds = await checkBedrockCredentials();
        if (hasCreds) {
          this.storageAdapter.saveProviderConnection({
            id: crypto.randomUUID(),
            type: 'bedrock',
            name: 'Amazon Bedrock',
            config: { region: this.appConfig.region },
            enabled: true,
            capabilities: ['llm'],
          });
          this.logger.info('Seeded default Bedrock provider connection');
        }
      } catch {
        /* ignore */
      }
    }

    // Daily agent reload at midnight so {{date}}/{{time}} template variables stay fresh
    const msUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      return midnight.getTime() - now.getTime();
    };
    const scheduleDailyReload = () => {
      setTimeout(() => {
        this.reloadAgents().catch(() => {});
        scheduleDailyReload();
      }, msUntilMidnight());
    };
    scheduleDailyReload();

    // Load all agents
    const agentMetadataList = await this.configLoader.listAgents();
    this.logger.info('Found agents', { count: agentMetadataList.length });

    // Create VoltAgent instances for each agent
    const agents: Record<string, Agent> = {};

    // Create default agent (always available, uses defaultModel, no tools)
    const defaultModel = await this.createBedrockModel({
      model: this.appConfig.defaultModel,
    } as AgentSpec);
    const defaultInstructions = this.appConfig.systemPrompt
      ? this.replaceTemplateVariables(this.appConfig.systemPrompt)
      : this.replaceTemplateVariables(DEFAULT_SYSTEM_PROMPT);
    const defaultAgent = await this.framework.createTempAgent({
      name: 'default',
      instructions: defaultInstructions,
      model: defaultModel,
    });
    agents.default = defaultAgent as any;
    this.activeAgents.set('default', defaultAgent as any);
    this.agentMetadataMap.set('default', {
      slug: 'default',
      name: 'Default Agent',
      description: 'System default agent with no tools',
      updatedAt: new Date().toISOString(),
    });
    this.logger.info('Default agent created', {
      model: this.appConfig.defaultModel,
    });

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

    // Store agent metadata for enriching API responses (preserve default agent)
    const savedDefaultMeta = this.agentMetadataMap.get('default');
    this.agentMetadataMap = new Map(
      agentMetadataList.map((meta) => [meta.slug, meta]),
    );
    if (savedDefaultMeta)
      this.agentMetadataMap.set('default', savedDefaultMeta);
    this.logger.info('Agent metadata map created', {
      count: this.agentMetadataMap.size,
      keys: Array.from(this.agentMetadataMap.keys()),
      sample: this.agentMetadataMap.get(agentMetadataList[0]?.slug),
    });

    // Initialize VoltAgent with all agents and server
    this.voltAgent = new VoltAgent({
      agents,
      logger: this.logger,
      server: honoServer({
        port: this.port,
        configureApp: (app) => this.configureRoutes(app),
      }),
    });

    this.logger.debug('Stallion Runtime initialized', { port: this.port });

    // Register OTel observable gauges
    registerObservableGauges({
      activeAgents: () => this.activeAgents.size,
      mcpConnections: () => this.mcpConnectionStatus.size,
    });

    // Load persisted events from disk
    await this.loadEventsFromDisk();

    // Start periodic health checks (every 60 seconds)
    this.startHealthChecks();

    // Start feedback analysis loop (uses default agent for LLM calls)
    this.feedbackService.setAnalyzeCallback(async (prompt: string) => {
      const agent = this.activeAgents.get('default');
      if (!agent) throw new Error('No default agent for feedback analysis');
      const result = await agent.generateText(prompt);
      return result.text;
    });
    this.feedbackService.start();

    // Start ACP bridge (non-blocking — no-op if kiro-cli not found)
    this.configLoader
      .loadACPConfig()
      .then((acpConfig: any) => {
        // Merge connections from acpConnections providers (e.g. aws-internal plugin)
        const providerEntries = listProviders('acpConnections');
        const providerConns = providerEntries.flatMap(
          (e: any) => e.provider.getConnections?.() || [],
        );
        const configIds = new Set(acpConfig.connections.map((c: any) => c.id));
        const merged = [
          ...acpConfig.connections,
          ...providerConns.filter((c: any) => !configIds.has(c.id)),
        ];
        return this.acpBridge.startAll(merged);
      })
      .then(() => {
        if (this.acpBridge.isConnected()) {
          this.logger.info('[Runtime] ACP connections established');
        }
      })
      .catch((err: any) => {
        this.logger.warn('[Runtime] ACP startup failed', {
          error: err.message,
        });
      });

    // Check for plugin updates after startup (delayed, non-blocking)
    setTimeout(async () => {
      try {
        const res = await fetch(
          `http://localhost:${this.port}/api/plugins/check-updates`,
        );
        if (!res.ok) return;
        const { updates } = (await res.json()) as { updates: any[] };
        if (updates.length > 0) {
          this.eventBus.emit('plugins:updates-available', {
            count: updates.length,
            updates,
          });
          this.logger.info('Plugin updates available', {
            count: updates.length,
          });
        }
      } catch (error: any) {
        this.logger.debug('Failed to check for plugin updates', {
          error: error.message,
        });
      }
    }, 5000);
  }

  /**
   * Configure all HTTP routes on the Hono app instance.
   * Extracted from the configureApp callback for readability.
   */
  private configureRoutes(
    app: Parameters<NonNullable<HonoServerConfig['configureApp']>>[0],
  ): void {
    // Global error handler middleware
    app.onError((err, c) => {
      if (isAuthError(err)) {
        return c.json({ success: false, error: err.message }, 401);
      }
      return c.json({ success: false, error: err.message }, 500);
    });

    // Request logger for debugging Tauri connectivity
    app.use('*', async (c, next) => {
      const start = Date.now();
      await next();
      const origin = c.req.header('origin') || '-';
      this.logger.info(
        `${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms origin=${origin}`,
      );
    });

    app.use(
      '*',
      cors({
        origin: (origin) => {
          if (!origin) return origin;
          if (
            origin.startsWith('http://localhost:') ||
            origin.startsWith('https://localhost:') ||
            origin === 'tauri://localhost' ||
            origin === 'https://tauri.localhost'
          ) {
            return origin;
          }
          const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
          return allowed.includes(origin) ? origin : null;
        },
        credentials: true,
      }),
    );

    // Models capabilities and pricing endpoints
    app.route('/api/models', modelsRoute);

    // System status (onboarding readiness)
    app.route(
      '/api/system',
      createSystemRoutes(
        {
          getACPStatus: () => {
            const s = this.acpBridge.getStatus();
            return {
              connected: s.connections.some(
                (c: any) => c.status === 'connected',
              ),
              connections: s.connections,
            };
          },
          getAppConfig: () => this.appConfig,
          eventBus: this.eventBus,
        },
        this.logger,
      ),
    );

    // Analytics endpoints
    app.route('/api/analytics', createAnalyticsRoutes(this.usageAggregator));

    // Auth endpoints
    app.route('/api/auth', createAuthRoutes());

    // User directory endpoints
    app.route('/api/users', createUserRoutes());

    // Plugin endpoints (list, serve bundles, reload providers)
    app.route(
      '/api/plugins',
      createPluginRoutes(
        this.configLoader.getProjectHomeDir(),
        this.logger,
        this.eventBus,
      ),
    );

    // Filesystem browse (folder picker for plugin install)
    app.route('/api/fs', createFsRoutes());

    // Package registry endpoints (browse/install agents and tools)
    app.route(
      '/api/registry',
      createRegistryRoutes(this.configLoader, async () => {
        // Restart ACP connections to pick up newly installed agents as modes
        const acpConfig = await this.configLoader.loadACPConfig();
        await this.acpBridge.startAll(acpConfig.connections);
      }),
    );

    // Custom endpoint for enriched agent list (use /api prefix to avoid VoltAgent routes)
    app.get('/api/agents', async (c) => {
      try {
        await this.reloadAgents();

        // Build enriched list from metadata map (framework-agnostic)
        const enrichedAgents = (
          await Promise.all(
            Array.from(this.agentMetadataMap.entries()).map(
              async ([slug, metadata]) => {
                if (!this.activeAgents.has(slug)) return null;
                try {
                  const spec: AgentSpec =
                    slug === 'default'
                      ? {
                          name: 'default',
                          prompt: metadata.description,
                          description: metadata.description,
                          model: this.appConfig.defaultModel,
                        }
                      : await this.configLoader.loadAgent(slug);

                  this.logger.debug('[Agent Enrichment] Loading spec', {
                    agent: metadata.slug,
                    hasSpec: !!spec,
                    hasTools: !!spec.tools,
                  });

                  return {
                    slug,
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
                } catch (_error) {
                  this.logger.warn('Agent spec not found, skipping', {
                    agent: metadata.slug,
                  });
                  return null;
                }
              },
            ),
          )
        ).filter((a) => a !== null);

        this.logger.debug('[Agent Enrichment] Enriched agents', {
          count: enrichedAgents.length,
          agents: enrichedAgents.map((a) => ({
            slug: a.slug,
            hasToolsConfig: !!a.toolsConfig,
          })),
        });

        // Append ACP virtual agents (kiro-cli modes)
        if (this.acpBridge.isConnected()) {
          enrichedAgents.push(...this.acpBridge.getVirtualAgents());
        }

        return c.json({ success: true, data: enrichedAgents });
      } catch (error: any) {
        this.logger.error('Failed to fetch agents', {
          error: error.message,
          stack: error.stack,
        });
        return c.json({ success: false, error: error.message }, 500);
      }
    });

    // === Agent CRUD Endpoints ===
    // Mount agent routes for CRUD operations
    const agentRoutes = createAgentRoutes(
      this.agentService,
      () => this.initialize(),
      () => this.voltAgent,
    );
    app.route('/agents', agentRoutes);

    // === Tool Management Endpoints ===

    // Get Q Developer agents
    app.get('/q-agents', async (c) => {
      try {
        const { readFileSync, existsSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { homedir } = await import('node:os');

        const qAgentsPath = join(
          homedir(),
          '.aws',
          'amazonq',
          'cli-agents.json',
        );

        if (!existsSync(qAgentsPath)) {
          return c.json({
            success: false,
            error: 'Q Developer agents file not found',
            agents: [],
          });
        }

        const agents = JSON.parse(readFileSync(qAgentsPath, 'utf-8'));
        return c.json({ success: true, agents });
      } catch (error: any) {
        this.logger.error('Failed to load Q agents', { error });
        return c.json({
          success: false,
          error: error.message,
          agents: [],
        });
      }
    });

    // List all integrations (MCP server configs)
    app.route(
      '/integrations',
      createToolRoutes(this.mcpService, () => this.initialize()),
    );

    // SSE event stream
    app.route(
      '/events',
      createEventRoutes({
        eventBus: this.eventBus,
        getACPStatus: () => {
          const s = this.acpBridge.getStatus();
          return {
            connected: s.connections.some((c) => c.status === 'connected'),
            connections: s.connections,
          };
        },
        logger: this.logger,
      }),
    );

    // Runtime info — verify which agent framework is active
    app.get('/runtime', (c) => {
      return c.json({
        runtime: this.appConfig.runtime || 'voltagent',
      });
    });

    // ACP connection status (all connections)
    app.get('/acp/status', async (c) => {
      return c.json({ success: true, data: this.acpBridge.getStatus() });
    });

    // ACP slash commands for a given agent
    app.get('/acp/commands/:slug', async (c) => {
      const slug = c.req.param('slug');
      return c.json({
        success: true,
        data: this.acpBridge.getSlashCommands(slug),
      });
    });

    // ACP command autocomplete options
    app.get('/acp/commands/:slug/options', async (c) => {
      const slug = c.req.param('slug');
      const partial = c.req.query('q') || '';
      const options = await this.acpBridge.getCommandOptions(slug, partial);
      return c.json({ success: true, data: options });
    });

    // ACP connection CRUD
    app.get('/acp/connections', async (c) => {
      const config = await this.configLoader.loadACPConfig();
      // Merge connections from acpConnections providers (e.g. plugins)
      const providerEntries = listProviders('acpConnections');
      const providerConns = providerEntries.flatMap((e: any) =>
        (e.provider.getConnections?.() || []).map((conn: any) => ({
          ...conn,
          source: 'plugin' as const,
        })),
      );
      const configIds = new Set(config.connections.map((c) => c.id));
      const allConnections = [
        ...config.connections,
        ...providerConns.filter((c: any) => !configIds.has(c.id)),
      ];
      const status = this.acpBridge.getStatus();
      const connections = allConnections.map((cfg) => ({
        ...cfg,
        ...(status.connections.find((s) => s.id === cfg.id) || {
          status: 'disconnected',
          modes: [],
          sessionId: null,
          mcpServers: [],
        }),
      }));
      return c.json({ success: true, data: connections });
    });

    app.post('/acp/connections', async (c) => {
      const body = await c.req.json();
      if (!body.id || !body.command) {
        return c.json(
          { success: false, error: 'id and command are required' },
          400,
        );
      }
      const config = await this.configLoader.loadACPConfig();
      if (config.connections.some((conn) => conn.id === body.id)) {
        return c.json(
          {
            success: false,
            error: `Connection '${body.id}' already exists`,
          },
          409,
        );
      }
      const newConn = {
        id: body.id,
        name: body.name || body.id,
        command: body.command,
        args: body.args || [],
        icon: body.icon || '🔌',
        enabled: body.enabled !== false,
      };
      config.connections.push(newConn);
      await this.configLoader.saveACPConfig(config);
      if (newConn.enabled) await this.acpBridge.addConnection(newConn);
      return c.json({ success: true, data: newConn });
    });

    app.put('/acp/connections/:id', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const config = await this.configLoader.loadACPConfig();
      const idx = config.connections.findIndex((conn) => conn.id === id);
      if (idx === -1)
        return c.json({ success: false, error: 'Connection not found' }, 404);
      config.connections[idx] = {
        ...config.connections[idx],
        ...body,
        id,
      };
      await this.configLoader.saveACPConfig(config);
      // Restart connection with new config
      await this.acpBridge.removeConnection(id);
      if (config.connections[idx].enabled)
        await this.acpBridge.addConnection(config.connections[idx]);
      return c.json({ success: true, data: config.connections[idx] });
    });

    app.delete('/acp/connections/:id', async (c) => {
      const id = c.req.param('id');
      const config = await this.configLoader.loadACPConfig();
      config.connections = config.connections.filter((conn) => conn.id !== id);
      await this.configLoader.saveACPConfig(config);
      await this.acpBridge.removeConnection(id);
      return c.json({ success: true });
    });

    // Get agent tools with full schemas
    // Get agent tools with full schemas
    app.get('/agents/:slug/tools', async (c) => {
      try {
        const slug = c.req.param('slug');
        const agent = this.activeAgents.get(slug);

        if (!agent) {
          return c.json(
            { success: false, error: 'Agent not found or not active' },
            404,
          );
        }

        const tools = this.agentTools.get(slug) || [];
        const toolsData = tools.map((tool: any) => {
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

        tools.mcpServers = tools.mcpServers.filter(
          (id: string) => id !== toolId,
        );

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

    // === Layout Management Endpoints ===
    app.route('/layouts', createLayoutRoutes(this.layoutService));

    // === Layout & Workflow Management ===
    app.route('/agents', createWorkflowRoutes(this.layoutService));

    // === Project Management ===
    app.route(
      '/api/projects',
      createProjectRoutes(
        this.projectService,
        this.storageAdapter,
        this.configLoader.getProjectHomeDir(),
      ),
    );
    app.route('/api/providers', createProviderRoutes(this.providerService));
    app.route(
      '/api/projects/:slug/knowledge',
      createKnowledgeRoutes(this.knowledgeService),
    );
    app.route(
      '/api/knowledge',
      createCrossProjectKnowledgeRoutes(
        this.knowledgeService,
        this.storageAdapter,
      ),
    );
    app.route('/api/coding', createCodingRoutes(this.fileTreeService));
    app.get('/api/coding/terminal-port', (c) =>
      c.json({ success: true, port: this.port + 1 }),
    );
    app.route('/api/templates', createTemplateRoutes(this.storageAdapter));

    // === Route Modules ===
    app.route(
      '/config',
      createConfigRoutes(this.configLoader, this.logger, this.eventBus, () =>
        this.reloadAgents(),
      ),
    );
    app.route(
      '/bedrock',
      createBedrockRoutes(() => this.modelCatalog, this.appConfig, this.logger),
    );
    app.route('/api/branding', createBrandingRoutes());
    app.route(
      '/monitoring',
      createMonitoringRoutes({
        activeAgents: this.activeAgents,
        agentStats: this.agentStats,
        agentStatus: this.agentStatus,
        memoryAdapters: this.memoryAdapters,
        metricsLog: this.metricsLog,
        monitoringEvents: this.monitoringEvents,
        queryEventsFromDisk: (start, end, userId) =>
          this.queryEventsFromDisk(start, end, userId),
      }),
    );
    app.route(
      '/agents',
      createConversationRoutes(this.memoryAdapters, this.logger),
    );
    const schedulerService = new SchedulerService(this.logger);
    schedulerService.setChatFn(async (agentSlug, prompt) => {
      const slug =
        agentSlug === 'default'
          ? this.activeAgents.keys().next().value || agentSlug
          : agentSlug;
      const agent = this.activeAgents.get(slug);
      if (!agent) throw new Error(`Agent '${slug}' not found`);
      const result = await agent.generateText(prompt);
      return result.text;
    });
    app.route(
      '/scheduler',
      createSchedulerRoutes(schedulerService, this.logger),
    );
    // Notification service
    const notificationService = new NotificationService(
      this.eventBus,
      join(homedir(), '.stallion-ai'),
      60_000,
    );
    for (const { provider } of getNotificationProviders()) {
      notificationService.addProvider(provider);
    }
    notificationService.start();
    app.route('/notifications', createNotificationRoutes(notificationService));
    app.route('/api/feedback', createFeedbackRoutes(this.feedbackService));
    app.route(
      '/api/prompts',
      createPromptRoutes(new PromptService(), this.logger),
    );

    // Agent health check (agent-specific, not in monitoring routes)
    app.get('/agents/:slug/health', async (c) => {
      const slug = c.req.param('slug');
      const agent = this.activeAgents.get(slug);

      if (!agent) {
        return c.json(
          {
            success: false,
            healthy: false,
            error: 'Agent not found',
            checks: { loaded: false },
          },
          404,
        );
      }

      const checks: Record<string, boolean> = {
        loaded: true,
        hasModel: !!agent.model,
        hasMemory: this.memoryAdapters.has(slug),
      };

      // Check integrations (MCP tools)
      const spec = this.agentSpecs.get(slug);
      const integrations: Array<{
        id: string;
        type: string;
        connected: boolean;
        error?: string;
        metadata?: any;
      }> = [];

      if (spec?.tools?.mcpServers && spec.tools.mcpServers.length > 0) {
        checks.integrationsConfigured = true;

        for (const id of spec.tools.mcpServers) {
          const key = `${slug}:${id}`;
          const status = this.mcpConnectionStatus.get(key);
          const metadata = this.integrationMetadata.get(key);

          // Get tools for this MCP server with original names
          const agentTools = this.agentTools.get(slug) || [];
          const serverTools = agentTools
            .filter((t) => t.name.startsWith(id.replace(/-/g, ''))) // Match by server prefix
            .map((t) => {
              const mapping = this.toolNameMapping.get(t.name);

              return {
                name: t.name,
                originalName: mapping?.original || t.name,
                server: mapping?.server || null,
                toolName: mapping?.tool || t.name,
                description: (t as ToolWithDescription).description,
              };
            });

          integrations.push({
            id,
            type: metadata?.type || 'mcp',
            connected: status?.connected === true,
            error: status?.error,
            metadata: metadata
              ? {
                  transport: metadata.transport,
                  toolCount: metadata.toolCount,
                  tools: serverTools,
                }
              : undefined,
          });
        }

        checks.integrationsConnected = integrations.every((i) => i.connected);
      }

      const healthy = Object.values(checks).every((v) => v);

      return c.json({
        success: true,
        healthy,
        checks,
        integrations,
        status: this.agentStatus.get(slug) || 'idle',
      });
    });

    // === Conversation Context & Stats (not in route module) ===

    // Conversation context management
    app.post(
      '/api/agents/:slug/conversations/:conversationId/context',
      async (c) => {
        try {
          const slug = c.req.param('slug');
          const conversationId = c.req.param('conversationId');
          const { action, content } = await c.req.json();

          const result = await ConversationManager.manageConversationContext(
            slug,
            conversationId,
            action,
            content,
            this.memoryAdapters,
          );

          return c.json(result);
        } catch (error: any) {
          this.logger.error('Failed to manage conversation context', {
            error,
          });
          return c.json({ success: false, error: error.message }, 500);
        }
      },
    );

    // Get conversation statistics
    app.get('/agents/:slug/conversations/:conversationId/stats', async (c) => {
      try {
        const slug = c.req.param('slug');
        const conversationId = c.req.param('conversationId');

        const data = await ConversationManager.getConversationStats(
          slug,
          conversationId,
          this.memoryAdapters,
          this.agentFixedTokens,
          this.agentTools,
          this.configLoader,
          this.appConfig,
          this.modelCatalog,
          this.logger,
        );

        return c.json({ success: true, data });
      } catch (error: any) {
        this.logger.error('Failed to load conversation stats', {
          error,
        });
        return c.json({ success: false, error: error.message }, 500);
      }
    });

    // Silent agent invocation for dashboard data fetching
    app.post('/agents/:slug/invoke', async (c) => {
      try {
        const slug = c.req.param('slug');
        const { input, model, tools: toolNames, schema } = await c.req.json();

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
          options.model = await this.createBedrockModel({
            model: resolvedModel,
          } as AgentSpec);
        }

        // Override tools if specified - get from our cached tools
        if (toolNames && Array.isArray(toolNames)) {
          const slug = c.req.param('slug');
          const agentTools = this.agentTools.get(slug) || [];
          options.tools = agentTools.filter((t: any) =>
            toolNames.includes(t.name),
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
            this.logger.warn('Failed to parse JSON response', {
              error: e,
              text: result.text,
            });
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
          reasoning: result.reasoning,
        });
      } catch (error: any) {
        this.logger.error('Failed to invoke agent', { error });
        return c.json(
          { success: false, error: error.message },
          isAuthError(error) ? 401 : 500,
        );
      }
    });

    // Raw MCP tool call (no transformation, no LLM)
    app.post('/agents/:slug/tools/:toolName', async (c) => {
      const startTime = performance.now();
      try {
        const slug = c.req.param('slug');
        const toolName = c.req.param('toolName');
        const toolArgs = await c.req.json();

        let resolvedSlug = slug;
        let agent = this.activeAgents.get(resolvedSlug);

        // Fallback: try namespace-scoped lookup (e.g. "sales-sa" → "sales-sa:sales-sa")
        if (!agent) {
          const nsMatch = Array.from(this.activeAgents.keys()).find((k) =>
            k.endsWith(`:${slug}`),
          );
          if (nsMatch) {
            resolvedSlug = nsMatch;
            agent = this.activeAgents.get(resolvedSlug);
          }
        }

        if (!agent) {
          return c.json({ success: false, error: 'Agent not found' }, 404);
        }

        const allTools = this.agentTools.get(resolvedSlug) || [];

        // Try to find tool by normalized name first, then by original name
        let tool = allTools.find((t) => t.name === toolName);
        if (!tool) {
          const normalized = this.getNormalizedToolName(toolName);
          tool = allTools.find((t) => t.name === normalized);
        }

        if (!tool) {
          return c.json(
            { success: false, error: `Tool ${toolName} not found` },
            404,
          );
        }

        const toolStart = performance.now();
        const toolResult = await (
          tool as ToolWithDescription & {
            execute: (args: any) => Promise<any>;
          }
        ).execute(toolArgs);
        const toolDuration = performance.now() - toolStart;

        // Unwrap MCP result
        let unwrappedResult: any = toolResult;
        if ((toolResult as ToolResult)?.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(
              (toolResult as ToolResult).content![0].text,
            );
            if (parsed?.content?.[0]?.text) {
              unwrappedResult = JSON.parse(parsed.content[0].text);
            } else {
              unwrappedResult = parsed;
            }
          } catch {
            unwrappedResult = (toolResult as ToolResult).content![0].text;
          }
        }

        return c.json({
          success: true,
          response: unwrappedResult,
          metadata: {
            toolDuration: Math.round(toolDuration),
            totalDuration: Math.round(performance.now() - startTime),
          },
        });
      } catch (error: any) {
        this.logger.error('Failed to call tool', { error });
        return c.json(
          { success: false, error: error.message },
          isAuthError(error) ? 401 : 500,
        );
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
        let tool = allTools.find((t) => t.name === toolName);
        if (!tool) {
          const normalized = this.getNormalizedToolName(toolName);
          tool = allTools.find((t) => t.name === normalized);
        }

        if (!tool) {
          return c.json(
            { success: false, error: `Tool ${toolName} not found` },
            404,
          );
        }

        // Execute tool
        const toolStart = performance.now();
        const toolResult = await (
          tool as ToolWithDescription & {
            execute: (args: any) => Promise<any>;
          }
        ).execute(toolArgs);
        const toolDuration = performance.now() - toolStart;

        // Unwrap MCP result
        let unwrappedResult: any = toolResult;
        let parseError: string | undefined;

        if ((toolResult as ToolResult)?.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(
              (toolResult as ToolResult).content![0].text,
            );
            if (parsed?.content?.[0]?.text) {
              unwrappedResult = JSON.parse(parsed.content[0].text);
            } else {
              unwrappedResult = parsed;
            }
          } catch {
            unwrappedResult = (toolResult as ToolResult).content![0].text;
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
        if (
          unwrappedResult?.response &&
          typeof unwrappedResult.response === 'string'
        ) {
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
          const errorObj = unwrappedResult.error;
          const errorMessage =
            typeof errorObj === 'string'
              ? errorObj
              : errorObj?.message?.message || errorObj?.message || errorObj;
          if (isAuthError(errorMessage)) {
            return c.json({ success: false, error: errorMessage }, 401);
          }
          return c.json({ success: false, error: errorMessage }, 500);
        }

        // Apply transformation
        const transformStart = performance.now();
        const transformFn = new Function(
          'data',
          `return (${transform})(data);`,
        );
        const transformed = transformFn(unwrappedResult);
        const transformDuration = performance.now() - transformStart;

        return c.json({
          success: true,
          response: transformed,
          metadata: {
            toolDuration: Math.round(toolDuration),
            transformDuration: Math.round(transformDuration),
            totalDuration: Math.round(performance.now() - startTime),
            ...(parseError && { parseError }),
          },
        });
      } catch (error: any) {
        this.logger.error('Failed to transform invoke', { error });
        return c.json(
          { success: false, error: error.message },
          isAuthError(error) ? 401 : 500,
        );
      }
    });

    app.post('/agents/:slug/invoke/stream', async (c) => {
      try {
        const slug = c.req.param('slug');
        const {
          prompt,
          model,
          tools: toolNames,
          maxSteps = 10,
          schema: schemaJson,
        } = await c.req.json();

        const agent = this.activeAgents.get(slug);
        if (!agent) {
          return c.json({ success: false, error: 'Agent not found' }, 404);
        }

        const options: any = { maxSteps, maxOutputTokens: 2000 };
        if (model && this.modelCatalog) {
          const resolvedModel = await this.modelCatalog.resolveModelId(model);
          options.model = await this.createBedrockModel({
            model: resolvedModel,
          } as AgentSpec);
        }

        // Override tools if specified - create temp agent with only filtered tools
        if (toolNames && Array.isArray(toolNames)) {
          const allTools = this.agentTools.get(slug) || [];
          const filteredTools = allTools.filter((t) =>
            toolNames.includes(t.name),
          );

          // Create temporary agent with ONLY the filtered tools
          const tempAgent = await this.framework.createTempAgent({
            name: `${slug}-temp`,
            instructions: (agent as any).instructions || '',
            model: options.model || agent.model,
            tools: filteredTools as any[],
            maxSteps,
          });

          // generateObject cannot use tools, so use generateText with JSON mode
          if (schemaJson) {
            const textResult = await tempAgent.generateText(
              `${prompt}\n\nReturn ONLY valid JSON matching this schema (no markdown, no explanation):\n${JSON.stringify(schemaJson, null, 2)}`,
            );

            // Extract JSON from response (handles markdown code blocks)
            let parsed: unknown;
            try {
              const cleaned = textResult
                .text!.replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
              parsed = JSON.parse(cleaned);
            } catch {
              const jsonMatch = textResult.text!.match(/\{[\s\S]*\}/);
              parsed = jsonMatch
                ? JSON.parse(jsonMatch[0])
                : { error: 'Failed to parse JSON' };
            }

            return c.json({
              success: true,
              response: parsed,
              usage: textResult.usage,
            });
          }

          const result = await tempAgent.generateText(prompt);

          return c.json({
            success: true,
            response: result.text,
            usage: result.usage,
          });
        }

        // For multi-turn, use generateText/generateObject and return result
        const result = schemaJson
          ? await agent.generateObject(
              prompt,
              jsonSchema(schemaJson) as unknown as any,
              options,
            )
          : await agent.generateText(prompt, options);

        return c.json({
          success: true,
          response: schemaJson
            ? (result as GenerateResult).object
            : (result as GenerateResult).text,
          usage: result.usage,
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

        this.logger.info('[Approval Endpoint] Received approval response', {
          approvalId,
          approved,
        });

        if (this.approvalRegistry.resolve(approvalId, approved)) {
          return c.json({ success: true });
        }

        this.logger.warn('[Approval Endpoint] Approval request not found', {
          approvalId,
        });
        return c.json(
          { success: false, error: 'Approval request not found' },
          404,
        );
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
          system,
        } = await c.req.json();

        // Get tools from global registry
        const filteredTools =
          toolIds.length > 0
            ? toolIds
                .map((id: string) => this.globalToolRegistry.get(id))
                .filter(Boolean)
            : [];

        // Resolve models from config - invokeModel for tool calling, structureModel for output formatting
        const invokeModelId = model || this.appConfig.invokeModel;
        const structureModelId =
          structureModel || this.appConfig.structureModel;

        const mainModel = await this.createBedrockModel({
          model: this.modelCatalog
            ? await this.modelCatalog.resolveModelId(invokeModelId)
            : invokeModelId,
        } as AgentSpec);

        const fastModel = await this.createBedrockModel({
          model: this.modelCatalog
            ? await this.modelCatalog.resolveModelId(structureModelId)
            : structureModelId,
        } as AgentSpec);

        const resolvedDefault = this.appConfig.systemPrompt
          ? this.replaceTemplateVariables(this.appConfig.systemPrompt)
          : this.replaceTemplateVariables(DEFAULT_SYSTEM_PROMPT);

        // Create temp agent for tool execution
        const tempAgent = await this.framework.createTempAgent({
          name: `invoke-${Date.now()}`,
          instructions: system || resolvedDefault,
          model: mainModel,
          tools: filteredTools,
          maxSteps,
        });

        const tempConvId = `invoke-${Date.now()}`;

        // Phase 1: Tool execution
        const textResult = await tempAgent.generateText(prompt, {
          conversationId: tempConvId,
          userId: 'invoke-user',
        });

        if (!schema) {
          return c.json({
            success: true,
            response: textResult.text,
            usage: textResult.usage,
            steps: textResult.steps?.length || 0,
          });
        }

        // Phase 2: Structure output (no tools needed)
        const { jsonSchema } = await import('ai');

        // Create new agent without tools for structuring
        const structureAgent = await this.framework.createTempAgent({
          name: `invoke-structure-${Date.now()}`,
          instructions: 'Format the provided information as structured JSON.',
          model: fastModel || mainModel,
          tools: [],
          maxSteps: 1,
        });

        const objectResult = await (structureAgent as any).generateObject(
          `${textResult.text}\n\nFormat the above information as structured JSON.`,
          jsonSchema(schema) as unknown as any,
          {
            conversationId: tempConvId,
            userId: 'invoke-user',
          },
        );

        return c.json({
          success: true,
          response: objectResult.object,
          usage: {
            promptTokens:
              (textResult.usage?.promptTokens || 0) +
              (objectResult.usage?.promptTokens || 0),
            completionTokens:
              (textResult.usage?.completionTokens || 0) +
              (objectResult.usage?.completionTokens || 0),
            totalTokens:
              (textResult.usage?.totalTokens || 0) +
              (objectResult.usage?.totalTokens || 0),
          },
          steps: textResult.steps?.length || 0,
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
        const { input, options = {}, projectSlug } = await c.req.json();

        // ACP routing — delegate to kiro-cli if this is an ACP agent
        if (this.acpBridge.hasAgent(slug)) {
          let acpCwd: string | undefined;
          if (projectSlug) {
            try {
              const project = this.storageAdapter.getProject(projectSlug);
              const primaryDir = project.directories?.find(
                (d: any) => d.role === 'primary',
              );
              if (primaryDir) acpCwd = primaryDir.path;
            } catch {
              /* use default */
            }
          }
          return this.acpBridge.handleChat(
            c,
            slug,
            input,
            options,
            acpCwd ? { cwd: acpCwd } : undefined,
          );
        }

        // Resolve project provider override when projectSlug is provided
        let useAlternateProvider = false;
        let resolvedProviderConn: any = null;
        if (projectSlug && !options.model) {
          try {
            const resolved = await this.providerService.resolveProvider({
              projectSlug,
            });
            if (resolved.model) {
              options.model = resolved.model;
            }
            // Check if this is a non-Bedrock provider that needs alternate routing
            if (resolved.providerId && resolved.providerId !== 'bedrock') {
              const connections =
                this.providerService.listProviderConnections();
              resolvedProviderConn = connections.find(
                (c: any) => c.id === resolved.providerId,
              );
              if (
                resolvedProviderConn &&
                resolvedProviderConn.type !== 'bedrock'
              ) {
                useAlternateProvider = true;
              }
            }
          } catch (err: any) {
            this.logger.warn('Failed to resolve project provider', {
              projectSlug,
              error: err.message,
            });
          }
        }

        // RAG context injection — query project knowledge base
        let ragContext: string | null = null;
        if (projectSlug) {
          try {
            const userMessage =
              typeof input === 'string'
                ? input
                : Array.isArray(input)
                  ? input
                      .find((m: any) => m.role === 'user')
                      ?.parts?.find((p: any) => p.type === 'text')?.text || ''
                  : '';
            if (userMessage) {
              ragContext = await this.knowledgeService.getRAGContext(
                projectSlug,
                userMessage,
              );
            }
          } catch (err: any) {
            this.logger.debug('RAG context retrieval failed', {
              projectSlug,
              error: err.message,
            });
          }
        }

        // Feedback guidelines injection — provider-agnostic, applies to all chat paths
        const feedbackGuidelines = this.feedbackService.getBehaviorGuidelines();
        if (feedbackGuidelines) {
          ragContext = ragContext
            ? `${ragContext}\n\n${feedbackGuidelines}`
            : feedbackGuidelines;
        }

        // Route to alternate provider (Ollama, OpenAI-compat) if resolved
        if (useAlternateProvider && resolvedProviderConn) {
          const llmProvider = createLLMProviderFromConfig(resolvedProviderConn);
          if (llmProvider) {
            c.header('Content-Type', 'text/event-stream');
            c.header('Cache-Control', 'no-cache');
            c.header('Connection', 'keep-alive');
            c.header('X-Accel-Buffering', 'no');

            return stream(c, async (streamWriter) => {
              const convId = options.conversationId || `${slug}:${Date.now()}`;
              const messages: Array<{ role: string; content: string }> = [];

              // Add system prompt: global system prompt + agent spec prompt + RAG context
              const agentSpec = this.agentSpecs.get(slug);
              const globalPrompt = this.appConfig.systemPrompt
                ? this.replaceTemplateVariables(this.appConfig.systemPrompt)
                : '';
              const agentPrompt = agentSpec?.prompt
                ? this.replaceTemplateVariables(agentSpec.prompt)
                : '';
              const combinedPrompt = [globalPrompt, agentPrompt]
                .filter(Boolean)
                .join('\n\n');
              const systemPrompt =
                ragContext && combinedPrompt
                  ? `${ragContext}\n\n${combinedPrompt}`
                  : ragContext || combinedPrompt;
              if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
              }

              // Add conversation history from memory adapter
              if (options.conversationId) {
                try {
                  const adapter = this.memoryAdapters.get(slug);
                  if (adapter) {
                    const userId = options.userId || 'default-user';
                    const msgs = await adapter.getMessages(
                      userId,
                      options.conversationId,
                    );
                    if (msgs) {
                      for (const msg of msgs) {
                        // UIMessage uses parts array, extract text content
                        const textParts = (msg.parts || [])
                          .filter((p: any) => p.type === 'text')
                          .map((p: any) => p.text);
                        const content = textParts.join('\n') || '';
                        if (content)
                          messages.push({ role: msg.role as string, content });
                      }
                    }
                  }
                } catch {
                  /* no history */
                }
              }

              // Add current user message
              const userText =
                typeof input === 'string'
                  ? input
                  : Array.isArray(input)
                    ? input
                        .find((m: any) => m.role === 'user')
                        ?.parts?.find((p: any) => p.type === 'text')?.text || ''
                    : '';
              messages.push({ role: 'user', content: userText });

              try {
                await streamWithProvider(
                  llmProvider,
                  options.model ||
                    resolvedProviderConn.config?.defaultModel ||
                    'default',
                  messages as any,
                  {
                    write: (data: string) => {
                      streamWriter.write(data);
                      return Promise.resolve();
                    },
                  },
                  convId,
                  c.req.raw.signal,
                );
              } catch (err: any) {
                await streamWriter.write(
                  `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
                );
              }
            });
          }
        }

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

        let agent: any = this.activeAgents.get(slug);
        if (!agent) {
          return c.json({ success: false, error: 'Agent not found' }, 404);
        }

        // If model override, get or create cached agent with that model
        if (modelOverride) {
          // Validate model ID before creating agent
          if (this.modelCatalog) {
            try {
              const isValid =
                await this.modelCatalog.validateModelId(modelOverride);
              if (!isValid) {
                return c.json(
                  {
                    success: false,
                    error: `Invalid model ID: ${modelOverride}. Please select a valid model from the list.`,
                  },
                  400,
                );
              }
            } catch (validationError: any) {
              this.logger.warn('Model validation failed', {
                modelOverride,
                error: validationError,
              });
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
              const _originalMemory = agent.getMemory();
              const _originalHooks = agent.hooks;

              const resolvedModel = this.modelCatalog
                ? await this.modelCatalog.resolveModelId(modelOverride)
                : modelOverride;
              const newModel = await this.createBedrockModel({
                model: resolvedModel,
                region: originalSpec?.region || this.appConfig.region,
              } as AgentSpec);

              const tempWrapper = await this.framework.createTempAgent({
                name: cacheKey,
                instructions: (agent as any).instructions || '',
                model: newModel,
                tools: originalTools as any[],
              });
              cachedAgent = (tempWrapper as any).raw || tempWrapper;

              this.activeAgents.set(cacheKey, cachedAgent);
              this.logger.info('Created agent with model override', {
                slug,
                modelOverride,
              });
            } catch (modelError: any) {
              this.logger.error('Failed to create agent with model override', {
                slug,
                modelOverride,
                error: modelError,
              });
              return c.json(
                {
                  success: false,
                  error: `Failed to switch to model ${modelOverride}: ${modelError.message}`,
                },
                500,
              );
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
          const chatStartMs = Date.now();
          const chatSpan = tracer.startSpan('stallion.chat', {
            attributes: { 'stallion.agent': slug },
          });
          const artifacts: Array<{
            type: string;
            name?: string;
            content?: any;
          }> = [];

          try {
            // Create injectable stream for elicitation
            const injectableStream = new InjectableStream();

            // Get auto-approve list from agent spec
            const agentSpec = this.agentSpecs.get(slug);

            // Elicitation callback that injects events instead of writing directly
            const elicitation = StreamOrchestrator.createElicitationCallback(
              agentSpec!,
              this.toolNameMapping,
              this.approvalRegistry,
              injectableStream,
              this.logger,
            );

            operationContext = {
              ...restOptions,
              elicitation,
            };

            // Wire approval flow into framework-agnostic hooks (for Strands adapter)
            const agentHooks = this.agentHooksMap.get(slug);
            if (agentHooks) {
              agentHooks.requestApproval = async (tool) => {
                const result = await elicitation({
                  type: 'tool-approval',
                  toolName: tool.toolName,
                  toolDescription: tool.toolDescription || '',
                  toolArgs: tool.toolArgs,
                });
                return !!result;
              };
            }

            // Resolve userId from auth (override frontend default)
            if (
              !operationContext.userId ||
              operationContext.userId === 'default-user'
            ) {
              try {
                const { getCachedUser } = await import('../routes/auth.js');
                operationContext.userId =
                  getCachedUser().alias || 'default-user';
              } catch {
                operationContext.userId =
                  operationContext.userId || 'default-user';
              }
            }

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
              this.logger.debug('Client disconnected, aborting operation', {
                conversationId,
              });
              abortController.abort('Client disconnected');
            });

            // Pass abort signal to VoltAgent (it will create its own controller that listens to this)
            operationContext.abortSignal = abortController.signal;
            this.logger.debug('Abort signal configured', {
              conversationId,
            });

            // Ensure conversation exists before streaming
            const memory = agent.getMemory();
            if (
              memory &&
              operationContext.conversationId &&
              operationContext.userId
            ) {
              const existing = await memory.getConversation(
                operationContext.conversationId,
              );
              if (!existing) {
                // Use provided title or generate from first 50 chars of user message
                const title =
                  operationContext.title ||
                  (input.length > 50 ? `${input.substring(0, 50)}...` : input);
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

            // Inject RAG context into the input for Bedrock path
            let finalInput = input;
            if (ragContext && typeof input === 'string') {
              finalInput = `${ragContext}\n\n${input}`;
            } else if (ragContext && Array.isArray(input)) {
              // Prepend RAG context as a system-like prefix to the first user message
              const clone = JSON.parse(JSON.stringify(input));
              const userMsg = clone.find((m: any) => m.role === 'user');
              if (userMsg?.parts) {
                const textPart = userMsg.parts.find(
                  (p: any) => p.type === 'text',
                );
                if (textPart)
                  textPart.text = `${ragContext}\n\n${textPart.text}`;
              }
              finalInput = clone;
            }

            result = await agent.streamText(finalInput, operationContext);

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
              input:
                typeof input === 'string'
                  ? input
                  : input?.text || '[complex input]',
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
                  const messages = await adapter.getMessages(
                    conv.userId,
                    conv.id,
                  );
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
              await StreamOrchestrator.saveCancellationMessage(
                agent,
                operationContext,
              );
            };

            this.logger.info('Agent stream started', {
              conversationId: operationContext.conversationId,
              isNewConversation,
            });

            // Send conversationId as first event for new conversations
            if (isNewConversation && operationContext.conversationId) {
              const mem = agent.getMemory();
              const conversation = mem
                ? await mem.getConversation(operationContext.conversationId)
                : null;
              await streamWriter.write(
                `data: ${JSON.stringify({
                  type: 'conversation-started',
                  conversationId: operationContext.conversationId,
                  title: conversation?.title || 'New Conversation',
                })}\n\n`,
              );
            }

            // Initialize streaming state variables
            completionReason = 'completed';
            hasOutput = false;
            accumulatedText = '';
            const _currentTextSegment = '';
            reasoningText = '';
            const _lastChunkWasToolResult = false;
            const _hasEmittedReasoningForCurrentSegment = false;
            toolCallCount = 0;
            currentStep = 0;
            requestTraceId = traceId; // Capture traceId for use in events
            const _thinkingBuffer = ''; // Buffer for incomplete thinking tags
            const _inThinkingBlock = false; // Track if we're currently in a <thinking> block
            const _currentReasoningContent = ''; // Accumulate reasoning for monitoring event
            const _recentChunks: any[] = []; // Track last 10 chunks for debugging
            const _suppressTextStart = false; // Suppress text-start if response begins with <thinking>

            // Use DEBUG_STREAMING env var for debug logging
            const debugStreaming = process.env.DEBUG_STREAMING === 'true';

            // Initialize StreamPipeline
            const pipeline = StreamOrchestrator.createStreamingPipeline(
              abortController.signal,
              this.monitoringEvents,
              {
                slug,
                conversationId: operationContext.conversationId,
                userId: operationContext.userId,
                traceId,
              },
            );

            // Log model and tool configuration for debugging
            const agentTools = this.agentTools.get(slug) || [];
            const agentModel = agent.model as
              | {
                  modelId?: string;
                  settings?: { maxTokens?: number; temperature?: number };
                }
              | undefined;
            this.logger.debug('Stream starting', {
              conversationId,
              model: agentModel?.modelId,
              toolCount: agentTools.length,
              toolNames: agentTools.map((t) => t.name).slice(0, 5),
              maxTokens: agentModel?.settings?.maxTokens,
              temperature: agentModel?.settings?.temperature,
              debugStreaming,
            });

            // Wrap fullStream with injectable stream
            // ReasoningHandler buffers all chunks during thinking, so approval-request
            // will be held until reasoning-end is emitted
            const wrappedStream = injectableStream.wrap(result.fullStream);

            // Run pipeline and write chunks to stream
            for await (const chunk of pipeline.run(wrappedStream)) {
              await StreamOrchestrator.writeSSEChunk(streamWriter, chunk);
            }

            // Write [DONE] marker
            await StreamOrchestrator.writeSSEDone(streamWriter);

            // Get completion state from handlers
            const results = await pipeline.finalize();

            // Extract completion state for finally block
            if (results.completion) {
              hasOutput = results.completion.hasOutput;
              completionReason = results.completion.completionReason;
              accumulatedText = results.completion.accumulatedText;
            }
            if (results.metadata) {
              toolCallCount = results.metadata.toolCalls || 0;
            }

            // Check if aborted
            if (abortController.signal.aborted) {
              completionReason = 'aborted';
              if (!hasOutput) await saveCancellationMessage();
            }
          } catch (error: any) {
            chatSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            chatSpan.recordException(error);
            const agentModelForError = agent.model as
              | { modelId?: string }
              | undefined;
            this.logger.error('Stream error occurred', {
              agentId: slug,
              modelName: agentModelForError?.modelId,
              conversationId: conversationId,
              agentName: slug,
              error,
            });
            await StreamOrchestrator.writeSSEError(streamWriter, error);
            await StreamOrchestrator.writeSSEDone(streamWriter);
          } finally {
            // Agent stream completed
            this.logger.info('Agent stream completed', {
              conversationId: operationContext.conversationId,
              reason: completionReason,
            });

            // Set agent status to idle
            this.agentStatus.set(slug, 'idle');

            // Add final text output to artifacts (excluding reasoning text)
            const finalOutput = accumulatedText
              .replace(reasoningText, '')
              .trim();
            if (finalOutput) {
              artifacts.push({
                type: 'text',
                content: finalOutput,
              });
            }

            // Collect usage stats
            let usage: Record<string, any> | undefined;
            try {
              usage = await result.usage;
            } catch (_e) {
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
              inputChars:
                typeof input === 'string'
                  ? input.length
                  : input?.text?.length || 0,
              outputChars: finalOutput.length,
              usage: usage
                ? {
                    promptTokens: usage.promptTokens || usage.inputTokens || 0,
                    completionTokens:
                      usage.completionTokens || usage.outputTokens || 0,
                    totalTokens: usage.totalTokens || 0,
                  }
                : undefined,
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

            // Record OTel metrics
            chatRequests.add(1, { agent: slug });
            chatDuration.record(Date.now() - chatStartMs, { agent: slug });
            if (usage) {
              tokensInput.add(usage.promptTokens || usage.inputTokens || 0, {
                agent: slug,
              });
              tokensOutput.add(
                usage.completionTokens || usage.outputTokens || 0,
                { agent: slug },
              );
            }

            // Close OTel span
            chatSpan.setAttribute(
              'stallion.conversation_id',
              operationContext.conversationId || '',
            );
            chatSpan.setAttribute(
              'stallion.tokens.input',
              usage?.promptTokens || usage?.inputTokens || 0,
            );
            chatSpan.setAttribute(
              'stallion.tokens.output',
              usage?.completionTokens || usage?.outputTokens || 0,
            );
            chatSpan.end();
          }
        });
      } catch (error: any) {
        this.logger.error('Chat error', { error });
        chatErrors.add(1, { agent: slug });
        const isCredentialError =
          error.message?.includes('credential') ||
          error.message?.includes('accessKeyId') ||
          error.message?.includes('secretAccessKey');
        return c.json(
          { success: false, error: error.message },
          isCredentialError ? 401 : 500,
        );
      }
    });
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
        const integrations: Array<{
          id: string;
          type: string;
          connected: boolean;
          metadata?: any;
        }> = [];

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
              metadata: metadata
                ? {
                    transport: metadata.transport,
                    toolCount: metadata.toolCount,
                  }
                : undefined,
            });
          }

          checks.integrationsConnected = integrations.every((i) => i.connected);
        }

        const healthy = Object.values(checks).every((v) => v);

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
    setInterval(runHealthChecks, interval);

    this.logger.debug('Health checks started', { interval });
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
  private async queryEventsFromDisk(
    start: number,
    end: number,
    userId: string,
  ): Promise<any[]> {
    const events: any[] = [];

    try {
      const eventFiles = await readdir(this.eventLogPath);
      const logFiles = eventFiles.filter(
        (f) => f.startsWith('events-') && f.endsWith('.ndjson'),
      );

      for (const file of logFiles) {
        const filePath = join(this.eventLogPath, file);
        const fileStream = createReadStream(filePath);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              const eventTime = new Date(event.timestamp).getTime();

              if (
                eventTime >= start &&
                eventTime <= end &&
                event.userId === userId
              ) {
                events.push(event);
              }
            } catch (err) {
              this.logger.warn('Failed to parse event line', {
                line,
                error: err,
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to query events from disk', {
        error,
        start,
        end,
      });
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
        this.logger.debug('Created monitoring directory', {
          path: this.eventLogPath,
        });
        return;
      }

      const files = await readdir(this.eventLogPath);
      const eventFiles = files
        .filter((f) => f.startsWith('events-') && f.endsWith('.ndjson'))
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
              this.logger.warn('Failed to parse event line', {
                line,
                error: err,
              });
            }
          }
        }
      }

      // Keep only last 1000 events
      this.persistedEvents = events.slice(-1000);
      this.logger.info('Loaded persisted events', {
        count: this.persistedEvents.length,
      });
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
      await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf-8');

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
    const spec = await this.configLoader.loadAgent(agentSlug);
    this.agentSpecs.set(agentSlug, spec);

    // Replace template variables in prompts — resolved at agent creation time.
    // Date/time are current as of agent load; prompt caching stays effective.
    // Agents reload on config change, so updates to systemPrompt take effect.
    const processedPrompt = this.replaceTemplateVariables(spec.prompt);
    const processedSystemPrompt = this.appConfig.systemPrompt
      ? this.replaceTemplateVariables(this.appConfig.systemPrompt)
      : '';
    const instructions = processedSystemPrompt
      ? `${processedSystemPrompt}\n\n${processedPrompt}`
      : processedPrompt;

    const memoryAdapter = new FileMemoryAdapter({
      projectHomeDir: this.configLoader.getProjectHomeDir(),
      usageAggregator: this.usageAggregator,
    });

    // Delegate to whichever framework adapter is active
    const hooks = createAgentHooks({
      spec,
      appConfig: this.appConfig,
      configLoader: this.configLoader,
      modelCatalog: this.modelCatalog,
      agentFixedTokens: this.agentFixedTokens,
      memoryAdapters: this.memoryAdapters,
      approvalRegistry: this.approvalRegistry,
      logger: this.logger,
    });

    const bundle = await this.framework.createAgent(
      agentSlug,
      spec,
      {
        appConfig: this.appConfig,
        projectHomeDir: this.configLoader.getProjectHomeDir(),
        usageAggregator: this.usageAggregator,
        modelCatalog: this.modelCatalog,
        approvalRegistry: this.approvalRegistry,
        hooks,
      },
      {
        processedPrompt: instructions,
        memoryAdapter,
        configLoader: this.configLoader,
        mcpConfigs: this.mcpConfigs,
        mcpConnectionStatus: this.mcpConnectionStatus,
        integrationMetadata: this.integrationMetadata,
        toolNameMapping: this.toolNameMapping,
        toolNameReverseMapping: this.toolNameReverseMapping,
        approvalRegistry: this.approvalRegistry,
        agentFixedTokens: this.agentFixedTokens,
        memoryAdapters: this.memoryAdapters,
        logger: this.logger,
      },
    );

    // Unpack bundle into runtime state
    this.memoryAdapters.set(agentSlug, bundle.memoryAdapter);
    this.agentTools.set(agentSlug, bundle.tools as Tool<any>[]);
    this.agentFixedTokens.set(agentSlug, bundle.fixedTokens);
    this.agentHooksMap.set(agentSlug, hooks);

    for (const tool of bundle.tools) {
      if (!this.globalToolRegistry.has(tool.name)) {
        this.globalToolRegistry.set(tool.name, tool as Tool<any>);
      }
    }

    this.logger.info('[Agent Initialized]', {
      agent: agentSlug,
      runtime: this.appConfig.runtime || 'voltagent',
      ...bundle.fixedTokens,
      totalFixedTokens:
        bundle.fixedTokens.systemPromptTokens +
        bundle.fixedTokens.mcpServerTokens,
    });

    // Return raw VoltAgent Agent for backward compat, or the IAgent wrapper for Strands
    return (bundle.agent as any).raw || bundle.agent;
  }

  /**
   * Create Bedrock model instance (used by inline routes for model overrides)
   */
  private async createBedrockModel(spec: AgentSpec) {
    return this.framework.createModel(spec, {
      appConfig: this.appConfig,
      projectHomeDir: this.configLoader.getProjectHomeDir(),
      modelCatalog: this.modelCatalog,
    });
  }

  /**
   * Get original tool name from normalized name
   */
  private getOriginalToolName(normalizedName: string): string {
    return MCPManager.getOriginalToolName(normalizedName, this.toolNameMapping);
  }

  /**
   * Get normalized tool name from original name
   */
  private getNormalizedToolName(originalName: string): string {
    return MCPManager.getNormalizedToolName(
      originalName,
      this.toolNameReverseMapping,
    );
  }

  /**
   * Wrap a tool to add elicitation-based approval for non-auto-approved tools
   */
  private wrapToolWithElicitation(tool: Tool<any>, spec: AgentSpec): Tool<any> {
    return ToolExecutor.wrapToolWithElicitation(
      tool,
      spec,
      this.toolNameMapping,
      this.approvalRegistry,
      this.logger,
    );
  }

  /**
   * Replace template variables in prompts
   */
  private async loadPluginProviders(): Promise<void> {
    const pluginsDir = join(this.configLoader.getProjectHomeDir(), 'plugins');
    if (!existsSync(pluginsDir)) return;

    const { resolvePluginProviders } = await import('../providers/resolver.js');
    const {
      clearAll,
      registerProvider,
      registerBrandingProvider,
      registerSettingsProvider,
      registerAuthProvider,
      registerUserIdentityProvider,
      registerUserDirectoryProvider,
      registerAgentRegistryProvider,
      registerIntegrationRegistryProvider,
      registerOnboardingProvider,
    } = await import('../providers/registry.js');

    clearAll();
    const overrides = await this.configLoader.loadPluginOverrides();
    const { resolved, conflicts } = resolvePluginProviders(
      pluginsDir,
      overrides,
    );

    for (const conflict of conflicts) {
      this.logger.warn(
        'Provider conflict — multiple plugins provide singleton type',
        {
          type: conflict.type,
          layout: conflict.layout,
          candidates: conflict.candidates,
        },
      );
    }

    for (const entry of resolved) {
      const modulePath = join(pluginsDir, entry.pluginName, entry.module);
      if (!existsSync(modulePath)) {
        this.logger.warn('Plugin provider module not found', {
          plugin: entry.pluginName,
          module: entry.module,
        });
        continue;
      }
      try {
        const mod = await import(modulePath);
        const factory = mod.default || mod;
        const instance = typeof factory === 'function' ? factory() : factory;

        if (entry.type === 'auth') registerAuthProvider(instance);
        else if (entry.type === 'userIdentity')
          registerUserIdentityProvider(instance);
        else if (entry.type === 'userDirectory')
          registerUserDirectoryProvider(instance);
        else if (entry.type === 'agentRegistry')
          registerAgentRegistryProvider(instance);
        else if (entry.type === 'integrationRegistry')
          registerIntegrationRegistryProvider(instance);
        else if (entry.type === 'onboarding')
          registerOnboardingProvider(instance, entry.pluginName);
        else if (entry.type === 'branding') registerBrandingProvider(instance);
        else if (entry.type === 'settings') registerSettingsProvider(instance);
        else
          registerProvider(entry.type, instance, {
            layout: entry.layout,
            source: entry.pluginName,
          });

        this.logger.info('Registered plugin provider', {
          plugin: entry.pluginName,
          type: entry.type,
        });
      } catch (e: any) {
        this.logger.error('Failed to load plugin provider', {
          plugin: entry.pluginName,
          type: entry.type,
          error: e.message,
        });
      }
    }
  }

  private replaceTemplateVariables(text: string, _agentName?: string): string {
    const now = new Date();

    // User identity (from auth/OS)
    let userVars: Record<string, string> = {};
    try {
      const { getCachedUser } = require('../routes/auth.js');
      const user = getCachedUser();
      userVars = {
        '{{user_alias}}': user.alias || '',
        '{{user_name}}': user.name || user.alias || '',
        '{{user_email}}': user.email || '',
        '{{user_title}}': user.title || '',
      };
    } catch {
      /* auth module not loaded yet */
    }

    // Built-in variables (always available)
    const builtInReplacements: Record<string, string> = {
      '{{date}}': now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      '{{time}}': now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
      '{{datetime}}': now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
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
    const allReplacements = {
      ...builtInReplacements,
      ...userVars,
      ...customReplacements,
    };

    for (const [key, value] of Object.entries(allReplacements)) {
      result = result.replace(
        new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        value,
      );
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
    this.logger.info('Shutting down Stallion Runtime...');

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

    // Shutdown ACP bridge
    await this.acpBridge.shutdown();

    // Stop feedback analysis
    this.feedbackService.stop();

    // Shutdown terminal
    this.terminalWsServer.stop();
    await this.terminalService.dispose();

    // Dispose config loader
    await this.configLoader.dispose();

    this.logger.info('Shutdown complete');
  }
}
