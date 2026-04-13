/**
 * VoltAgent runtime integration for Stallion
 * Handles dynamic agent loading, switching, and MCP tool management
 */

import { EventEmitter } from 'node:events';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import {
  Agent,
  type MCPConfiguration,
  type Tool,
  VoltAgent,
} from '@voltagent/core';
import type { HonoServerConfig } from '@voltagent/server-hono';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';
import { ConfigLoader } from '../domain/config-loader.js';
import type { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import { getOrchestrationDatabasePath } from '../domain/migrations/003-orchestration-events.js';
import type { MonitoringEmitter } from '../monitoring/emitter.js';
import { BedrockAdapter } from '../providers/adapters/bedrock-adapter.js';
import { ClaudeAdapter } from '../providers/adapters/claude-adapter.js';
import { CodexAdapter } from '../providers/adapters/codex-adapter.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import type { ACPManager } from '../services/acp-bridge.js';
import type { AgentService } from '../services/agent-service.js';
import { ApprovalRegistry } from '../services/approval-registry.js';
import type { ConnectionService } from '../services/connection-service.js';
import { EventBus } from '../services/event-bus.js';
import { EventStore } from '../services/event-store.js';
import type { FeedbackService } from '../services/feedback-service.js';
import type { FileTreeService } from '../services/file-tree-service.js';
import type { KnowledgeService } from '../services/knowledge-service.js';
import type { LayoutService } from '../services/layout-service.js';
import type { MCPService } from '../services/mcp-service.js';
import type { NotificationService } from '../services/notification-service.js';
import { OrchestrationService } from '../services/orchestration-service.js';
import type { ProjectService } from '../services/project-service.js';
import type { ProviderService } from '../services/provider-service.js';
import type { SchedulerService } from '../services/scheduler-service.js';
import type { SkillService } from '../services/skill-service.js';
import type { TerminalService } from '../services/terminal-service.js';
import type { TerminalWebSocketServer } from '../services/terminal-ws-server.js';
import { createLogger } from '../utils/logger.js';
import { resolveHomeDir } from '../utils/paths.js';
import type { VoiceSessionService } from '../voice/voice-session.js';
import { createAgentHooks } from './agent-hooks.js';
import * as MCPManager from './mcp-manager.js';
import { buildRuntimeAgentInstance } from './runtime-agent-builder.js';
import {
  reloadRuntimeAgents,
  reloadRuntimeSkillsAndAgents,
  switchRuntimeAgent,
} from './runtime-agent-lifecycle.js';
import { buildRuntimeContext as createRuntimeContext } from './runtime-context-builder.js';
import { SC_READ_ONLY_TOOLS } from './runtime-control-tools.js';
import { RuntimeEventLog } from './runtime-event-log.js';
import {
  runRuntimeHealthChecks,
  startRuntimeHealthChecks,
} from './runtime-health.js';
import { initializeRuntime } from './runtime-initialize.js';
import { createRuntimeInitializationDeps } from './runtime-initialize-deps.js';
import {
  createRuntimeFrameworkModel,
  resolveRuntimeEmbeddingProvider,
  resolveRuntimeVectorDbProvider,
} from './runtime-provider-resolution.js';
import { configureRuntimeRoutes } from './runtime-routes.js';
import { createRuntimeServiceBundle } from './runtime-service-bootstrap.js';
import { shutdownRuntimeServices } from './runtime-shutdown.js';
import { checkOllamaAvailability } from './runtime-startup.js';
import { replaceRuntimeTemplateVariables } from './runtime-template-variables.js';
import { bootstrapRuntimeVoiceAgent } from './runtime-voice-agent.js';
import { StrandsFramework } from './strands-adapter.js';
import type { RuntimeContext } from './types.js';
import { VoltAgentFramework } from './voltagent-adapter.js';

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
  private eventLog: RuntimeEventLog;
  private modelCatalog?: BedrockModelCatalog;
  private usageAggregator?: UsageAggregator;
  private port: number;
  private approvalRegistry: ApprovalRegistry;
  private bedrockAdapter = new BedrockAdapter();
  private claudeAdapter = new ClaudeAdapter();
  private codexAdapter = new CodexAdapter();
  private orchestrationService!: OrchestrationService;
  private orchestrationEventStore: EventStore;

  // Services
  private agentService!: AgentService;
  private skillService!: SkillService;
  private mcpService!: MCPService;
  private layoutService!: LayoutService;
  private storageAdapter!: FileStorageAdapter;
  private projectService!: ProjectService;
  private providerService!: ProviderService;
  private connectionService!: ConnectionService;
  private knowledgeService!: KnowledgeService;
  private fileTreeService!: FileTreeService;
  private terminalService!: TerminalService;
  private terminalWsServer!: TerminalWebSocketServer;
  private voiceService!: VoiceSessionService;
  private voiceWsAttached = false;
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
    this.orchestrationEventStore = new EventStore(
      getOrchestrationDatabasePath(projectHomeDir),
    );

    this.logger = createLogger({
      name: 'stallion',
      level: options.logLevel || 'info',
    });
    this.eventLog = new RuntimeEventLog(this.eventLogPath, this.logger);

    this.approvalRegistry = new ApprovalRegistry(this.logger, {
      eventBus: this.eventBus,
    });
    const services = createRuntimeServiceBundle({
      projectHomeDir,
      port: this.port,
      logger: this.logger,
      configLoader: this.configLoader,
      approvalRegistry: this.approvalRegistry,
      eventBus: this.eventBus,
      monitoringEvents: this.monitoringEvents,
      memoryAdapters: this.memoryAdapters,
      activeAgents: this.activeAgents,
      agentMetadataMap: this.agentMetadataMap,
      agentSpecs: this.agentSpecs,
      agentTools: this.agentTools,
      mcpConfigs: this.mcpConfigs,
      mcpConnectionStatus: this.mcpConnectionStatus,
      integrationMetadata: this.integrationMetadata,
      toolNameMapping: this.toolNameMapping,
      usageAggregatorRef: { get: () => this.usageAggregator },
      getTerminalShell: () => this.appConfig?.terminalShell,
      persistEvent: (event: any) => this.eventLog.persist(event),
      bootstrapVoiceAgent: async () => this.bootstrapVoiceAgent(),
      resolveVectorDbProvider: () =>
        resolveRuntimeVectorDbProvider(this.providerService),
      resolveEmbeddingProvider: () =>
        resolveRuntimeEmbeddingProvider(this.providerService),
    });
    this.storageAdapter = services.storageAdapter;
    this.agentService = services.agentService;
    this.skillService = services.skillService;
    this.mcpService = services.mcpService;
    this.layoutService = services.layoutService;
    this.projectService = services.projectService;
    this.providerService = services.providerService;
    this.knowledgeService = services.knowledgeService;
    this.fileTreeService = services.fileTreeService;
    this.terminalService = services.terminalService;
    this.terminalWsServer = services.terminalWsServer;
    this.voiceService = services.voiceService;
    this.monitoringEmitter = services.monitoringEmitter;
    this.acpBridge = services.acpBridge;
    this.connectionService = services.connectionService;
    this.feedbackService = services.feedbackService;

    // Log versions for debugging
    this.logger.info('Stallion Runtime initializing', {
      voltagentCore: '1.1.37',
      aiSdkBedrock: '3.0.56',
      nodeVersion: process.version,
    });
  }

  /**
   * Reload agents from disk
   */
  async reloadAgents(): Promise<void> {
    this.appConfig = await reloadRuntimeAgents({
      configLoader: this.configLoader,
      activeAgents: this.activeAgents,
      agentMetadataMap: this.agentMetadataMap,
      agentSpecs: this.agentSpecs,
      agentTools: this.agentTools,
      memoryAdapters: this.memoryAdapters,
      mcpConfigs: this.mcpConfigs,
      mcpConnectionStatus: this.mcpConnectionStatus,
      integrationMetadata: this.integrationMetadata,
      voltAgent: this.voltAgent,
      logger: this.logger,
      eventBus: this.eventBus,
      createVoltAgentInstance: async (slug) =>
        this.createVoltAgentInstance(slug),
      loadAppConfig: async () => this.configLoader.loadAppConfig(),
      applyLogLevel: (appConfig) => {
        if (appConfig.logLevel) {
          (this.logger as any).level = appConfig.logLevel;
        }
      },
    });
  }

  private async bootstrapVoiceAgent(): Promise<void> {
    await bootstrapRuntimeVoiceAgent({
      agentSpecs: this.agentSpecs.values(),
      configLoader: this.configLoader,
      createVoltAgentInstance: async (slug) =>
        this.createVoltAgentInstance(slug),
      agentTools: this.agentTools,
      logger: this.logger,
    });
  }

  /**
   * Re-discover skills and rebuild all agents so skill assignments take effect.
   */
  async reloadSkillsAndAgents(): Promise<void> {
    await reloadRuntimeSkillsAndAgents({
      skillService: this.skillService,
      configLoader: this.configLoader,
      storageAdapter: this.storageAdapter,
      activeAgents: this.activeAgents,
      logger: this.logger,
      createVoltAgentInstance: async (slug) =>
        this.createVoltAgentInstance(slug),
    });
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    const initialized = await initializeRuntime(
      createRuntimeInitializationDeps({
        port: this.port,
        logger: this.logger,
        eventBus: this.eventBus,
        timers: this.timers,
        configLoader: this.configLoader,
        storageAdapter: this.storageAdapter,
        skillService: this.skillService,
        feedbackService: this.feedbackService,
        voiceService: this.voiceService,
        acpBridge: this.acpBridge,
        orchestrationEventStore: this.orchestrationEventStore,
        usageAggregator: this.usageAggregator,
        activeAgents: this.activeAgents,
        agentMetadataMap: this.agentMetadataMap,
        memoryAdapters: this.memoryAdapters,
        agentTools: this.agentTools,
        agentSpecs: this.agentSpecs,
        mcpConfigs: this.mcpConfigs,
        mcpConnectionStatus: this.mcpConnectionStatus,
        integrationMetadata: this.integrationMetadata,
        toolNameMapping: this.toolNameMapping,
        toolNameReverseMapping: this.toolNameReverseMapping,
        eventLog: this.eventLog,
        bedrockAdapter: this.bedrockAdapter,
        claudeAdapter: this.claudeAdapter,
        codexAdapter: this.codexAdapter,
        createVoltAgentInstance: async (slug) =>
          this.createVoltAgentInstance(slug),
        configureRoutes: (app: any) => this.configureRoutes(app),
        reloadAgents: async () => this.reloadAgents(),
        replaceTemplateVariables: (text, agentName) =>
          this.replaceTemplateVariables(text, agentName),
        checkBedrockCredentials: async () => {
          const { checkBedrockCredentials } = await import(
            '../providers/bedrock.js'
          );
          return checkBedrockCredentials();
        },
        createDefaultSkillRegistryProvider: async () => {
          const { FilesystemSkillRegistryProvider } = await import(
            '../providers/filesystem-skill-registry.js'
          );
          const { GitHubSkillRegistryProvider } = await import(
            '../providers/github-skill-registry.js'
          );
          const { MultiSourceSkillRegistryProvider } = await import(
            '../providers/multi-source-skill-registry.js'
          );
          return new MultiSourceSkillRegistryProvider([
            new FilesystemSkillRegistryProvider(),
            new GitHubSkillRegistryProvider(),
          ]);
        },
        runStartupMigrations: async (projectHomeDir) => {
          const { runStartupMigrations } = await import(
            '../domain/migration.js'
          );
          await runStartupMigrations(projectHomeDir);
        },
        startHealthChecks: () => this.startHealthChecks(),
      }),
    );

    this.appConfig = initialized.appConfig;
    this.framework = initialized.framework;
    this.orchestrationService = initialized.orchestrationService;
    this.modelCatalog = initialized.modelCatalog;
    this.usageAggregator = initialized.usageAggregator;
    this.voltAgent = initialized.voltAgent;
    this.voiceWsAttached = initialized.voiceWsAttached;
  }

  /**
   * Configure all HTTP routes on the Hono app instance.
   * Extracted from the configureApp callback for readability.
   */
  private configureRoutes(
    app: Parameters<NonNullable<HonoServerConfig['configureApp']>>[0],
  ): void {
    const { schedulerService, notificationService } = configureRuntimeRoutes({
      app,
      logger: this.logger,
      eventBus: this.eventBus,
      approvalRegistry: this.approvalRegistry,
      appConfig: this.appConfig,
      port: this.port,
      usageAggregator: this.usageAggregator,
      skillService: this.skillService,
      configLoader: this.configLoader,
      feedbackService: this.feedbackService,
      fileTreeService: this.fileTreeService,
      storageAdapter: this.storageAdapter,
      providerService: this.providerService,
      projectService: this.projectService,
      agentService: this.agentService,
      connectionService: this.connectionService,
      mcpService: this.mcpService,
      orchestrationService: this.orchestrationService,
      layoutService: this.layoutService,
      modelCatalog: this.modelCatalog,
      acpBridge: this.acpBridge,
      knowledgeService: this.knowledgeService,
      voiceService: this.voiceService,
      activeAgents: this.activeAgents,
      agentMetadataMap: this.agentMetadataMap,
      memoryAdapters: this.memoryAdapters,
      agentFixedTokens: this.agentFixedTokens,
      agentTools: this.agentTools,
      agentStats: this.agentStats,
      agentStatus: this.agentStatus,
      metricsLog: this.metricsLog,
      monitoringEvents: this.monitoringEvents,
      monitoringEmitter: this.monitoringEmitter,
      eventLogPath: this.eventLogPath,
      queryEventsFromDisk: (start: number, end: number, userId: string) =>
        this.eventLog.queryEvents(start, end, userId),
      checkOllamaAvailability,
      buildRuntimeContext: () => this.buildRuntimeContext(),
      reloadAgents: async () => this.reloadAgents(),
      reloadSkillsAndAgents: async () => this.reloadSkillsAndAgents(),
      initialize: async () => this.initialize(),
      getVoltAgent: () => this.voltAgent,
      defaultAutoApprovedTools: SC_READ_ONLY_TOOLS,
      createMemoryAdapter: (_slug: string) =>
        new FileMemoryAdapter({
          projectHomeDir: this.configLoader.getProjectHomeDir(),
          usageAggregator: this.usageAggregator,
        }),
    });
    this.schedulerService = schedulerService;
    this.notificationService = notificationService;
  }

  /**
   * Build RuntimeContext for extracted route modules
   */
  private buildRuntimeContext(): RuntimeContext {
    return createRuntimeContext({
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
      persistEvent: (event: any) => this.eventLog.persist(event),
      createBedrockModel: (spec: AgentSpec) =>
        createRuntimeFrameworkModel(spec, {
          framework: this.framework,
          appConfig: this.appConfig,
          projectHomeDir: this.configLoader.getProjectHomeDir(),
          modelCatalog: this.modelCatalog,
        }),
      replaceTemplateVariables: (text: string) =>
        this.replaceTemplateVariables(text),
      getNormalizedToolName: (name: string) =>
        MCPManager.getNormalizedToolName(name, this.toolNameReverseMapping),
      getOriginalToolName: (name: string) =>
        MCPManager.getOriginalToolName(name, this.toolNameMapping),
      reloadAgents: () => this.reloadAgents(),
      initialize: () => this.initialize(),
    });
  }

  /**
   * Start periodic health checks for all agents
   */
  private startHealthChecks() {
    startRuntimeHealthChecks({
      timers: this.timers,
      logger: this.logger,
      runHealthChecks: async () =>
        runRuntimeHealthChecks({
          activeAgents: this.activeAgents,
          agentSpecs: this.agentSpecs,
          memoryAdapters: this.memoryAdapters,
          mcpConnectionStatus: this.mcpConnectionStatus,
          integrationMetadata: this.integrationMetadata,
          acpStatus: this.acpBridge.getStatus(),
          monitoringEmitter: this.monitoringEmitter,
        }),
    });
  }

  /**
   * Create a VoltAgent Agent instance from agent spec
   */
  private async createVoltAgentInstance(agentSlug: string): Promise<Agent> {
    return buildRuntimeAgentInstance({
      agentSlug,
      appConfig: this.appConfig,
      configLoader: this.configLoader,
      framework: this.framework,
      skillService: this.skillService,
      logger: this.logger,
      modelCatalog: this.modelCatalog,
      usageAggregator: this.usageAggregator,
      approvalRegistry: this.approvalRegistry,
      mcpConfigs: this.mcpConfigs,
      mcpConnectionStatus: this.mcpConnectionStatus,
      integrationMetadata: this.integrationMetadata,
      toolNameMapping: this.toolNameMapping,
      toolNameReverseMapping: this.toolNameReverseMapping,
      memoryAdapters: this.memoryAdapters,
      agentFixedTokens: this.agentFixedTokens,
      agentTools: this.agentTools,
      globalToolRegistry: this.globalToolRegistry,
      agentHooksMap: this.agentHooksMap,
      agentSpecs: this.agentSpecs,
      replaceTemplateVariables: (text, agentName) =>
        this.replaceTemplateVariables(text, agentName),
    });
  }

  private replaceTemplateVariables(text: string, _agentName?: string): string {
    return replaceRuntimeTemplateVariables(text, this.appConfig);
  }

  /**
   * Switch to a different agent (for CLI usage)
   */
  async switchAgent(targetSlug: string): Promise<Agent> {
    return switchRuntimeAgent({
      targetSlug,
      activeAgents: this.activeAgents,
      voltAgent: this.voltAgent,
      logger: this.logger,
      createVoltAgentInstance: async (slug) =>
        this.createVoltAgentInstance(slug),
    });
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
    await shutdownRuntimeServices({
      logger: this.logger,
      timers: this.timers,
      schedulerService: this.schedulerService,
      mcpConfigs: this.mcpConfigs,
      activeAgents: this.activeAgents,
      acpBridge: this.acpBridge,
      feedbackService: this.feedbackService,
      notificationService: this.notificationService,
      voiceService: this.voiceService,
      terminalWsServer: this.terminalWsServer,
      terminalService: this.terminalService,
      configLoader: this.configLoader,
    });
  }
}
