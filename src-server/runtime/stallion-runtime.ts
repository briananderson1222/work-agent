/**
 * VoltAgent runtime integration for Stallion
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { EventEmitter } from 'node:events';
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  Agent,
  type MCPConfiguration,
  type Tool,
  VoltAgent,
} from '@voltagent/core';
import { type HonoServerConfig, honoServer } from '@voltagent/server-hono';
import { cors } from 'hono/cors';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { UsageAggregator } from '../analytics/usage-aggregator.js';
import {
  ConfigLoader,
  DEFAULT_SYSTEM_PROMPT,
} from '../domain/config-loader.js';
import type { AgentSpec, AppConfig } from '../domain/types.js';
import { ACPStatus } from '../domain/types.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { createEventRoutes } from '../routes/events.js';
import { createUICommandRoutes } from '../routes/ui-commands.js';
import { EventBus } from '../services/event-bus.js';
import {
  registerObservableGauges,
} from '../telemetry/metrics.js';
import { createLogger } from '../utils/logger.js';
import { createAgentHooks } from './agent-hooks.js';
import type { RuntimeContext } from './types.js';
import * as MCPManager from './mcp-manager.js';
import { StrandsFramework } from './strands-adapter.js';
import * as ToolExecutor from './tool-executor.js';
import { VoltAgentFramework } from './voltagent-adapter.js';

import { FileTerminalHistoryStore } from '../adapters/file-terminal-history-store.js';
import { NodePtyAdapter } from '../adapters/node-pty-adapter.js';
import { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import { runStartupMigrations } from '../domain/migration.js';
import { JsonManifestRegistryProvider } from '../providers/json-manifest-registry.js';
import {
  getNotificationProviders,
  listProviders,
  registerAgentRegistryProvider,
  registerIntegrationRegistryProvider,
} from '../providers/registry.js';
import { createAgentRoutes } from '../routes/agents.js';
import { createACPRoutes } from '../routes/acp.js';
import { createAgentToolRoutes } from '../routes/agent-tools.js';
import { createInvokeRoutes } from '../routes/invoke.js';
import { createChatRoutes } from '../routes/chat.js';
import { createAnalyticsRoutes } from '../routes/analytics.js';
import { createAuthRoutes, createUserRoutes, getCachedUser } from '../routes/auth.js';
import { createBedrockRoutes } from '../routes/bedrock.js';
import { createBrandingRoutes } from '../routes/branding.js';
import { createCodingRoutes } from '../routes/coding.js';
import { createConfigRoutes } from '../routes/config.js';
import { createConversationRoutes, createGlobalConversationRoutes } from '../routes/conversations.js';
import { createFeedbackRoutes } from '../routes/feedback.js';
import { createFsRoutes } from '../routes/fs.js';
import { createInsightsRoutes } from '../routes/insights.js';
import {
  createCrossProjectKnowledgeRoutes,
  createKnowledgeRoutes,
} from '../routes/knowledge.js';
import { createLayoutRoutes, createWorkflowRoutes } from '../routes/layouts.js';
import modelsRoute from '../routes/models.js';
import { createMonitoringRoutes } from '../routes/monitoring.js';
import { MonitoringEmitter } from '../monitoring/emitter.js';
import { createOtlpReceiverRoutes } from '../monitoring/otlp-receiver.js';
import { createNotificationRoutes } from '../routes/notifications.js';
import { createPluginRoutes } from '../routes/plugins.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createPromptRoutes } from '../routes/prompts.js';
import {
  createEmbeddingProvider,
  createProviderRoutes,
  createVectorDbProvider,
} from '../routes/providers.js';
import { createRegistryRoutes } from '../routes/registry.js';
import { createSchedulerRoutes } from '../routes/scheduler.js';
import { createSystemRoutes } from '../routes/system.js';
import { createTelemetryRoutes } from '../routes/telemetry-events.js';
import { createTemplateRoutes } from '../routes/templates.js';
import { createToolRoutes } from '../routes/tools.js';
import { VoiceSessionService } from '../voice/voice-session.js';
import { NovaSonicProvider } from '../voice/providers/nova-sonic.js';
import { createVoiceRoutes, attachVoiceWebSocket } from '../routes/voice.js';
import { ACPManager } from '../services/acp-bridge.js';
import { AgentService } from '../services/agent-service.js';
import { ApprovalRegistry } from '../services/approval-registry.js';
import { FeedbackService } from '../services/feedback-service.js';
import { FileTreeService } from '../services/file-tree-service.js';
import { KnowledgeService } from '../services/knowledge-service.js';
import { LayoutService } from '../services/layout-service.js';
import { MCPService } from '../services/mcp-service.js';
import { NotificationService } from '../services/notification-service.js';
import { ProjectService } from '../services/project-service.js';
import { PromptService } from '../services/prompt-service.js';
import { ProviderService } from '../services/provider-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import * as SkillService from '../services/skill-service.js';
import { TerminalService } from '../services/terminal-service.js';
import { TerminalWebSocketServer } from '../services/terminal-ws-server.js';
import { isAuthError } from '../utils/auth-errors.js';
import { resolveHomeDir } from '../utils/paths.js';

export interface StallionRuntimeOptions {
  projectHomeDir?: string;
  port?: number;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

// Read-only stallion-control tools safe for auto-approve
const SC_READ_ONLY_TOOLS = [
  'list_agents', 'get_agent', 'list_skills', 'list_registry_skills',
  'list_integrations', 'get_integration', 'list_registry_integrations',
  'list_providers', 'list_prompts', 'list_jobs', 'system_status',
  'list_models', 'navigate_to', 'list_projects', 'get_project',
  'list_project_layouts', 'list_layouts', 'get_layout',
  'list_conversations', 'get_conversation_messages', 'get_config',
  'list_plugins', 'check_plugin_updates', 'get_usage', 'get_achievements',
].map((t) => `stallion-control_${t}`);

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
  private monitoringEmitter!: MonitoringEmitter;
  private agentStats = new Map<
    string,
    { conversationCount: number; messageCount: number; lastUpdated: number }
  >();
  private agentStatus = new Map<string, 'idle' | 'running'>();
  private schedulerService!: SchedulerService;
  private notificationService!: NotificationService;
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
  private voiceService!: VoiceSessionService;
  private acpBridge: ACPManager;
  private feedbackService: FeedbackService;
  private timers: NodeJS.Timeout[] = [];
  public readonly eventBus = new EventBus();
  private framework!: VoltAgentFramework | StrandsFramework;

  constructor(options: StallionRuntimeOptions = {}) {
    const projectHomeDir = options.projectHomeDir || resolveHomeDir();
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
      () => this.resolveVectorDbProvider(),
      () => this.resolveEmbeddingProvider(),
      projectHomeDir,
      this.storageAdapter,
    );
    this.fileTreeService = new FileTreeService();
    const ptyAdapter = new NodePtyAdapter();
    const historyStore = new FileTerminalHistoryStore();
    this.terminalService = new TerminalService(ptyAdapter, historyStore, () => this.appConfig?.terminalShell);
    this.terminalWsServer = new TerminalWebSocketServer(this.terminalService);
    this.terminalWsServer.start(this.port + 1);
    this.voiceService = new VoiceSessionService({
      providerFactory: () => new NovaSonicProvider({ region: 'us-east-1' }),
      agentTools: this.agentTools,
      agentSpecs: this.agentSpecs,
      voiceAgentSlug: 'stallion-voice',
      onFirstSession: () => this.bootstrapVoiceAgent(),
    });
    this.monitoringEmitter = new MonitoringEmitter(
      this.monitoringEvents,
      (event: any) => this.persistEvent(event),
    );
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
      this.monitoringEvents,
      (event: any) => this.persistEvent(event),
      this.monitoringEmitter,
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

    // Apply log level changes at runtime
    if (this.appConfig.logLevel) {
      (this.logger as any).level = this.appConfig.logLevel;
    }

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

  private async bootstrapVoiceAgent(): Promise<void> {
    const mcpServers = Array.from(
      new Set([
        'stallion-control',
        ...Array.from(this.agentSpecs.values()).flatMap(
          (spec) => spec.tools?.mcpServers ?? [],
        ),
      ]),
    );
    const voiceSpec = {
      name: 'Stallion Voice',
      prompt:
        'You are Stallion Voice, a hands-free voice assistant. You can navigate the app, query data, and perform actions. Be concise — this is voice, not text. Use short sentences. Always confirm before creating, modifying, or deleting anything.',
      tools: { mcpServers, autoApprove: ['stallion-control_*'], available: ['*'] },
    };
    if (await this.configLoader.agentExists('stallion-voice')) {
      await this.configLoader.updateAgent('stallion-voice', voiceSpec);
    } else {
      await this.configLoader.createAgent(voiceSpec);
    }

    // Load tools into agentTools so the voice session can use them
    try {
      await this.createVoltAgentInstance('stallion-voice');
      this.logger.info('Bootstrapped stallion-voice agent', { mcpServers, toolCount: this.agentTools.get('stallion-voice')?.length ?? 0 });
    } catch (err) {
      this.logger.warn('Failed to load stallion-voice tools', { error: err });
      this.logger.info('Bootstrapped stallion-voice agent (no tools)', { mcpServers });
    }
  }

  /**
   * Re-discover skills and rebuild all agents so skill assignments take effect.
   */
  async reloadSkillsAndAgents(): Promise<void> {
    const projects = this.storageAdapter?.listProjects() || [];
    const activeProject = projects[0]?.slug;
    await SkillService.discoverSkills(
      this.configLoader.getProjectHomeDir(),
      activeProject,
    );

    // Rebuild all non-default agents so they pick up skill changes
    const agentMetadataList = await this.configLoader.listAgents();
    for (const meta of agentMetadataList) {
      try {
        const agent = await this.createVoltAgentInstance(meta.slug);
        this.activeAgents.set(meta.slug, agent);
        this.logger.info('Agent rebuilt with updated skills', {
          agent: meta.slug,
        });
      } catch (error) {
        this.logger.error('Failed to rebuild agent', {
          agent: meta.slug,
          error,
        });
      }
    }
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing Stallion Runtime...');

    // Load app configuration
    this.appConfig = await this.configLoader.loadAppConfig();

    // Apply feature flags from STALLION_FEATURES env var
    const features = (process.env.STALLION_FEATURES || '')
      .split(',')
      .filter(Boolean);
    if (features.includes('strands-runtime')) {
      this.appConfig.runtime = 'strands';
    }

    // Select agent framework based on config
    const runtime = this.appConfig.runtime || 'voltagent';
    this.framework =
      runtime === 'strands' ? new StrandsFramework() : new VoltAgentFramework();
    this.logger.info('App config loaded', {
      region: this.appConfig.region,
      model: this.appConfig.defaultModel,
      runtime,
    });

    // Apply log level from config (config overrides startup default)
    if (this.appConfig.logLevel) {
      (this.logger as any).level = this.appConfig.logLevel;
    }

    // Registry providers are registered by plugins via loadProviders()

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

    // Re-scan plugin prompts so they're available via the API
    await this.loadPluginPrompts();

    // Discover Agent Skills (scans project skills/, global skills/, and plugins/)
    const projects = this.storageAdapter?.listProjects() || [];
    const activeProject = projects[0]?.slug;

    // Register default skill registry (Anthropic's official skills repo)
    const { GitHubSkillRegistryProvider } = await import(
      '../providers/github-skill-registry.js'
    );
    const { registerSkillRegistryProvider } = await import(
      '../providers/registry.js'
    );
    registerSkillRegistryProvider(new GitHubSkillRegistryProvider());

    await SkillService.discoverSkills(
      this.configLoader.getProjectHomeDir(),
      activeProject,
    );

    // Initialize usage aggregator
    this.usageAggregator = new UsageAggregator(
      this.configLoader.getProjectHomeDir(),
    );
    this.logger.debug('Usage aggregator initialized');

    // Background rescan on startup + every 30 min
    this.usageAggregator.fullRescan().catch(() => {});
    this.timers.push(setInterval(
      () => {
        this.usageAggregator?.fullRescan().catch(() => {});
      },
      30 * 60 * 1000,
    ));

    // Migrate legacy workspaces to project structure
    await runStartupMigrations(this.configLoader.getProjectHomeDir());

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
      } catch (e) {
        this.logger.debug('Failed to check Bedrock credentials for seeding', { error: e });
      }
    }

    // Daily agent reload at midnight so config changes take effect
    const msUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      return midnight.getTime() - now.getTime();
    };
    const scheduleDailyReload = () => {
      this.timers.push(setTimeout(() => {
        this.reloadAgents().catch(() => {});
        scheduleDailyReload();
      }, msUntilMidnight()));
    };
    scheduleDailyReload();

    // Load all agents
    const agentMetadataList = await this.configLoader.listAgents();
    this.logger.info('Found agents', { count: agentMetadataList.length });

    // Create VoltAgent instances for each agent
    const agents: Record<string, Agent> = {};

    // Seed built-in stallion-control integration (MCP server for managing Stallion itself)
    const selfIntegrationId = 'stallion-control';
    try {
      await this.configLoader.loadIntegration(selfIntegrationId);
    } catch {
      // Not registered yet — seed it
      const selfServerPath = join(
        import.meta.dirname || process.cwd(),
        'stallion-control.js',
      );
      await this.configLoader.saveIntegration(selfIntegrationId, {
        id: selfIntegrationId,
        displayName: 'Stallion Control',
        description: 'Manage agents, skills, integrations, prompts, and jobs via natural language',
        kind: 'mcp',
        transport: 'stdio',
        command: 'node',
        args: [selfServerPath],
        env: { STALLION_PORT: String(this.port) },
      });
      this.logger.info('Seeded stallion-control integration');
    }

    // Create default agent with stallion-control tools
    // Auto-approve read-only tools; write ops (create/update/delete/install/remove) require user approval
    const defaultSpec = {
      model: this.appConfig.defaultModel,
      tools: { mcpServers: [selfIntegrationId], autoApprove: SC_READ_ONLY_TOOLS },
    } as AgentSpec;
    const defaultModel = await this.createBedrockModel(defaultSpec);

    // Load stallion-control tools for the default agent
    let defaultTools: any[] = [];
    try {
      defaultTools = await MCPManager.loadAgentTools(
        'default',
        defaultSpec,
        this.configLoader,
        this.mcpConfigs,
        this.mcpConnectionStatus,
        this.integrationMetadata,
        this.toolNameMapping,
        this.toolNameReverseMapping,
        this.logger,
      );
      this.logger.info('Default agent tools loaded', { count: defaultTools.length });
    } catch (e) {
      this.logger.warn('Failed to load stallion-control tools for default agent', { error: e });
    }

    const rawSystemPrompt = this.appConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const defaultAgent = await this.framework.createTempAgent({
      name: 'default',
      instructions: () => this.replaceTemplateVariables(rawSystemPrompt),
      model: defaultModel,
      tools: defaultTools,
    });
    agents.default = defaultAgent as any;
    this.activeAgents.set('default', defaultAgent as any);
    this.agentTools.set('default', defaultTools);
    // Register memory adapter for default agent so conversations persist
    const defaultMemoryAdapter = new FileMemoryAdapter({
      projectHomeDir: this.configLoader.getProjectHomeDir(),
      usageAggregator: this.usageAggregator,
    });
    this.memoryAdapters.set('default', defaultMemoryAdapter);
    this.agentMetadataMap.set('default', {
      slug: 'default',
      name: 'Stallion',
      description: 'Default agent with full access to manage Stallion',
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

    // Attach voice WebSocket on its own port (port + 2), same pattern as terminal WS
    const voiceWsPort = this.port + 2;
    attachVoiceWebSocket(voiceWsPort, this.voiceService);
    this.logger.info('Voice WebSocket listening', { port: voiceWsPort });

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

    // Start feedback analysis loop (uses first available agent for LLM calls)
    this.feedbackService.setAnalyzeCallback(async (prompt: string) => {
      const agent =
        this.activeAgents.get('default') ||
        this.activeAgents.values().next().value;
      if (!agent) throw new Error('No agents available for feedback analysis');
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
    this.timers.push(setTimeout(async () => {
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
    }, 5000));
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
          // Allow private network origins (LAN access)
          try {
            const host = new URL(origin).hostname;
            if (
              host.startsWith('192.168.') ||
              host.startsWith('10.') ||
              /^172\.(1[6-9]|2\d|3[01])\./.test(host)
            ) {
              return origin;
            }
          } catch {}
          const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
          return allowed.includes(origin) ? origin : null;
        },
        credentials: true,
      }),
    );

    // Cache invalidation middleware — emit data:changed for mutating requests
    app.use('*', async (c, next) => {
      await next();
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method)) {
        const path = c.req.path;
        const keys: string[] = [];
        if (path.startsWith('/agents')) keys.push('agents');
        if (path.startsWith('/integrations')) keys.push('integrations');
        if (path.includes('/prompts')) keys.push('prompts');
        if (path.includes('/skills')) keys.push('skills');
        if (path.includes('/providers')) keys.push('providers');
        if (path.includes('/scheduler') || path.includes('/jobs')) keys.push('scheduler-jobs');
        if (path.includes('/projects')) keys.push('projects');
        if (path.includes('/knowledge')) keys.push('knowledge');
        if (path.includes('/registry')) keys.push('skills', 'integrations', 'agents');
        if (keys.length > 0) {
          this.eventBus.emit('data:changed', { keys: [...new Set(keys)] });
        }
      }
    });

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
                (c: any) => c.status === ACPStatus.AVAILABLE,
              ),
              connections: s.connections,
            };
          },
          getAppConfig: () => this.appConfig,
          eventBus: this.eventBus,
          appConfig: this.appConfig,
          port: this.port,
        },
        this.logger,
      ),
    );

    // Analytics endpoints
    app.route('/api/analytics', createAnalyticsRoutes(this.usageAggregator));

    // Plugin telemetry endpoints
    app.route('/api/telemetry', createTelemetryRoutes(this.logger));

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
      createRegistryRoutes(
        this.configLoader,
        async () => {
          const acpConfig = await this.configLoader.loadACPConfig();
          await this.acpBridge.startAll(acpConfig.connections);
        },
        () => this.reloadSkillsAndAgents(),
      ),
    );

    // === Agent CRUD Endpoints ===
    const agentRoutes = createAgentRoutes(
      this.agentService,
      () => this.reloadAgents(),
      () => this.voltAgent,
    );
    app.route('/agents', agentRoutes);

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
            connected: s.connections.some((c) => c.status === ACPStatus.AVAILABLE),
            connections: s.connections,
          };
        },
        logger: this.logger,
      }),
    );

    app.route('/api/ui', createUICommandRoutes(this.eventBus));

    // Build RuntimeContext for extracted route modules
    const ctx = this.buildRuntimeContext();

    // Enriched agent list (use /api prefix to avoid VoltAgent routes)
    app.get('/api/agents', async (c) => {
      try {
        await this.reloadAgents();
        const enrichedAgents = (
          await Promise.all(
            Array.from(this.agentMetadataMap.entries()).map(
              async ([slug, metadata]) => {
                if (!this.activeAgents.has(slug)) return null;
                try {
                  const spec: AgentSpec =
                    slug === 'default'
                      ? { name: 'default', prompt: metadata.description, description: metadata.description, model: this.appConfig.defaultModel, tools: { mcpServers: ['stallion-control'], autoApprove: SC_READ_ONLY_TOOLS } }
                      : await this.configLoader.loadAgent(slug);
                  return {
                    slug, name: metadata.name, prompt: spec.prompt, description: spec.description,
                    model: spec.model, region: spec.region, guardrails: spec.guardrails, maxSteps: spec.maxSteps,
                    icon: spec.icon, commands: spec.commands, toolsConfig: spec.tools, skills: spec.skills,
                    updatedAt: metadata.updatedAt,
                  };
                } catch (e) {
                  this.logger.warn('Agent spec not found, skipping', { agent: metadata.slug, error: e });
                  return null;
                }
              },
            ),
          )
        ).filter((a) => a !== null);
        if (this.acpBridge.isConnected()) enrichedAgents.push(...this.acpBridge.getVirtualAgents());
        return c.json({ success: true, data: enrichedAgents });
      } catch (error: any) {
        this.logger.error('Failed to fetch agents', { error: error.message });
        return c.json({ success: false, error: error.message }, 500);
      }
    });

    // Single enriched agent
    app.get('/api/agents/:slug', async (c) => {
      const slug = c.req.param('slug');
      const metadata = this.agentMetadataMap.get(slug);
      if (!metadata || !this.activeAgents.has(slug)) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }
      try {
        const spec: AgentSpec =
          slug === 'default'
            ? { name: 'default', prompt: metadata.description, description: metadata.description, model: this.appConfig.defaultModel, tools: { mcpServers: ['stallion-control'], autoApprove: SC_READ_ONLY_TOOLS } }
            : await this.configLoader.loadAgent(slug);
        return c.json({ success: true, data: {
          slug, name: metadata.name, prompt: spec.prompt, description: spec.description,
          model: spec.model, region: spec.region, guardrails: spec.guardrails, maxSteps: spec.maxSteps,
          icon: spec.icon, commands: spec.commands, toolsConfig: spec.tools, skills: spec.skills,
          updatedAt: metadata.updatedAt,
        }});
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500);
      }
    });

    // === Extracted Route Modules ===
    app.route('/acp', createACPRoutes(ctx));
    app.route('/agents', createAgentToolRoutes(ctx));
    app.route('/', createInvokeRoutes(ctx));
    app.route('/api/agents', createChatRoutes(ctx));

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
        this.providerService,
      ),
    );
    app.route('/api/coding', createCodingRoutes(this.fileTreeService));
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
        acpBridge: this.acpBridge,
      }),
    );
    app.route(
      '',
      createOtlpReceiverRoutes((event) => this.monitoringEmitter.emitRaw(event)),
    );
    app.route(
      '/agents',
      createConversationRoutes(this.memoryAdapters, this.logger, this.agentFixedTokens, this.agentTools, this.configLoader, this.appConfig, this.modelCatalog, (_slug: string) => {
        return new FileMemoryAdapter({
          projectHomeDir: this.configLoader.getProjectHomeDir(),
          usageAggregator: this.usageAggregator,
        });
      }),
    );
    app.route(
      '/api/conversations',
      createGlobalConversationRoutes(this.memoryAdapters, this.storageAdapter, this.logger),
    );
    this.schedulerService = new SchedulerService(this.logger);
    this.schedulerService.setChatFn(async (agentSlug, prompt) => {
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
      createSchedulerRoutes(this.schedulerService, this.logger),
    );
    // Notification service
    this.notificationService = new NotificationService(
      this.eventBus,
      this.configLoader.getProjectHomeDir(),
      60_000,
    );
    for (const { provider } of getNotificationProviders()) {
      this.notificationService.addProvider(provider);
    }
    this.notificationService.start();
    app.route('/notifications', createNotificationRoutes(this.notificationService));
    app.route('/api/feedback', createFeedbackRoutes(this.feedbackService));
    app.route('/api/insights', createInsightsRoutes(this.eventLogPath));
    app.route('/api/voice', createVoiceRoutes(this.voiceService));
    app.route(
      '/api/prompts',
      createPromptRoutes(new PromptService(), this.logger),
    );
  }

  /**
   * Build RuntimeContext for extracted route modules
   */
  private buildRuntimeContext(): RuntimeContext {
    return {
      activeAgents: this.activeAgents,
      agentSpecs: this.agentSpecs,
      agentTools: this.agentTools,
      memoryAdapters: this.memoryAdapters,
      mcpConnectionStatus: this.mcpConnectionStatus,
      integrationMetadata: this.integrationMetadata,
      toolNameMapping: this.toolNameMapping,
      toolNameReverseMapping: this.toolNameReverseMapping,
      globalToolRegistry: this.globalToolRegistry,
      agentFixedTokens: this.agentFixedTokens,
      agentStatus: this.agentStatus,
      agentHooksMap: this.agentHooksMap,
      approvalRegistry: this.approvalRegistry,
      configLoader: this.configLoader,
      appConfig: this.appConfig,
      modelCatalog: this.modelCatalog,
      framework: this.framework,
      acpBridge: this.acpBridge,
      providerService: this.providerService,
      knowledgeService: this.knowledgeService,
      feedbackService: this.feedbackService,
      storageAdapter: this.storageAdapter,
      eventBus: this.eventBus,
      logger: this.logger,
      monitoringEvents: this.monitoringEvents,
      monitoringEmitter: this.monitoringEmitter,
      agentStats: this.agentStats,
      metricsLog: this.metricsLog,
      persistEvent: (event: any) => this.persistEvent(event),
      createBedrockModel: (spec: AgentSpec) => this.createBedrockModel(spec),
      replaceTemplateVariables: (text: string) => this.replaceTemplateVariables(text),
      getNormalizedToolName: (name: string) => this.getNormalizedToolName(name),
      getOriginalToolName: (name: string) => this.getOriginalToolName(name),
      reloadAgents: () => this.reloadAgents(),
      initialize: () => this.initialize(),
    };
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

        this.monitoringEmitter.emitHealth({
          slug,
          userId: getCachedUser().alias,
          traceId,
          healthy,
          checks,
          integrations,
        });
      }

      // ACP connection health checks
      const acpStatus = this.acpBridge.getStatus();
      for (const conn of acpStatus.connections) {
        const traceId = `health:acp:${conn.id}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        const healthy = conn.status === 'available';

        this.monitoringEmitter.emitHealth({
          slug: `acp:${conn.id}`,
          userId: getCachedUser().alias,
          traceId,
          healthy,
          checks: {
            connected: healthy,
            modesAvailable: conn.modes.length > 0,
          },
        });
      }
    };

    // Run initial health check immediately
    runHealthChecks();

    // Then run periodically
    this.timers.push(setInterval(runHealthChecks, interval));

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
                (event.userId === userId || event['stallion.user.id'] === userId)
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

    // Keep raw templates so date/time variables resolve fresh per-invocation
    const rawSystemPrompt = this.appConfig.systemPrompt || '';
    const rawAgentPrompt = spec.prompt;
    const skillCatalog = SkillService.getSkillCatalogPrompt(spec.skills);
    const instructions = () => {
      const parts = [
        rawSystemPrompt ? this.replaceTemplateVariables(rawSystemPrompt) : '',
        this.replaceTemplateVariables(rawAgentPrompt),
        skillCatalog,
      ].filter(Boolean);
      return parts.join('\n\n');
    };

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
    const agentTools = bundle.tools as Tool<any>[];

    // Register activate_skill tool if agent has skills assigned
    const skillTool = SkillService.getSkillTool(spec.skills);
    if (skillTool) {
      agentTools.push(skillTool as Tool<any>);
    }

    this.agentTools.set(agentSlug, agentTools);
    this.agentFixedTokens.set(agentSlug, bundle.fixedTokens);
    this.agentHooksMap.set(agentSlug, hooks);

    for (const tool of agentTools) {
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

  /** Scan installed plugins for prompt files and register them. */
  private async loadPluginPrompts(): Promise<void> {
    const pluginsDir = join(this.configLoader.getProjectHomeDir(), 'plugins');
    if (!existsSync(pluginsDir)) return;
    const { scanPromptDir } = await import('../services/prompt-scanner.js');
    const { PromptService } = await import('../services/prompt-service.js');
    const svc = new PromptService();
    for (const name of readdirSync(pluginsDir)) {
      const manifestPath = join(pluginsDir, name, 'plugin.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        if (!manifest.prompts?.source) continue;
        const promptsDir = join(pluginsDir, name, manifest.prompts.source);
        const scanned = scanPromptDir(promptsDir, name);
        if (scanned.length > 0) svc.registerPluginPrompts(scanned);
      } catch { }
    }
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
      registerPluginRegistryProvider,
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
        // JSON files for registry types → auto-wrap with JsonManifestRegistryProvider
        if (
          modulePath.endsWith('.json') &&
          (entry.type === 'agentRegistry' || entry.type === 'integrationRegistry' || entry.type === 'pluginRegistry')
        ) {
          const { JsonManifestRegistryProvider } = await import(
            '../providers/json-manifest-registry.js'
          );
          const instance = new JsonManifestRegistryProvider(
            modulePath,
            dirname(pluginsDir),
          );
          if (entry.type === 'agentRegistry') registerAgentRegistryProvider(instance);
          else if (entry.type === 'pluginRegistry') registerPluginRegistryProvider(instance, entry.pluginName);
          else registerIntegrationRegistryProvider(instance);
          this.logger.info('Registered plugin provider (JSON manifest)', {
            plugin: entry.pluginName,
            type: entry.type,
          });
          continue;
        }

        const fileUrl = `file://${modulePath}?t=${Date.now()}`;
        const mod = await import(fileUrl);
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
        else if (entry.type === 'pluginRegistry')
          registerPluginRegistryProvider(instance, entry.pluginName);
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
      const user = getCachedUser();
      userVars = {
        '{{user_alias}}': user.alias || '',
        '{{user_name}}': user.name || user.alias || '',
        '{{user_email}}': user.email || '',
        '{{user_title}}': user.title || '',
      };
    } catch (e) {
      console.debug('Auth module not loaded yet:', e);
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

  private resolveVectorDbProvider() {
    const connections = this.providerService.listProviderConnections();
    const conn = connections.find(
      (c) => c.enabled && c.capabilities.includes('vectordb'),
    );
    if (!conn) return null;
    return createVectorDbProvider(conn);
  }

  private resolveEmbeddingProvider() {
    const connections = this.providerService.listProviderConnections();
    const conn = connections.find(
      (c) => c.enabled && c.capabilities.includes('embedding'),
    );
    if (!conn) return null;
    return createEmbeddingProvider(conn);
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

    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;

    // Stop scheduler first (awaits in-flight jobs that need active agents)
    await this.schedulerService.stop();

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

    // Stop feedback and notifications
    this.feedbackService.stop();
    this.notificationService.stop();

    // Shutdown voice sessions
    await this.voiceService.stop();

    // Shutdown terminal
    this.terminalWsServer.stop();
    await this.terminalService.dispose();

    // Dispose config loader
    await this.configLoader.dispose();

    this.logger.info('Shutdown complete');
  }
}