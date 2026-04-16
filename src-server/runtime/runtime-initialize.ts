import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { Agent, VoltAgent } from '@voltagent/core';
import { honoServer } from '@voltagent/server-hono';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';
import { DEFAULT_SYSTEM_PROMPT } from '../domain/config-loader.js';
import type { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import type { BedrockAdapter } from '../providers/adapters/bedrock-adapter.js';
import type { ClaudeAdapter } from '../providers/adapters/claude-adapter.js';
import type { CodexAdapter } from '../providers/adapters/codex-adapter.js';
import type { OllamaAdapter } from '../providers/adapters/ollama-adapter.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { JsonManifestRegistryProvider } from '../providers/json-manifest-registry.js';
import {
  createProviderAdapterRegistry,
  registerAgentRegistryProvider,
  registerIntegrationRegistryProvider,
  registerProviderAdapters,
  registerSkillRegistryProvider,
} from '../providers/registry.js';
import { attachVoiceWebSocket } from '../routes/voice.js';
import type { ACPManager } from '../services/acp-bridge.js';
import { EventBus } from '../services/event-bus.js';
import { EventStore } from '../services/event-store.js';
import type { FeedbackService } from '../services/feedback-service.js';
import { OrchestrationService } from '../services/orchestration-service.js';
import { registerObservableGauges } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import type { VoiceSessionService } from '../voice/voice-session.js';
import * as MCPManager from './mcp-manager.js';
import { initializeRuntimeAgents } from './runtime-agent-registry.js';
import {
  scheduleRuntimeDailyReload,
  scheduleRuntimePluginUpdateCheck,
  startRuntimeACPConnections,
} from './runtime-background-tasks.js';
import { SC_READ_ONLY_TOOLS } from './runtime-control-tools.js';
import { bootstrapRuntimeDefaultAgent } from './runtime-default-agent.js';
import type { RuntimeEventLog } from './runtime-event-log.js';
import { loadRuntimePluginAssets } from './runtime-plugin-assets.js';
import { createRuntimeFrameworkModel } from './runtime-provider-resolution.js';
import {
  checkOllamaAvailability,
  prepareRuntimeStartup,
} from './runtime-startup.js';
import { StrandsFramework } from './strands-adapter.js';
import { VoltAgentFramework } from './voltagent-adapter.js';

type RuntimeFramework = VoltAgentFramework | StrandsFramework;

export interface InitializeRuntimeDeps {
  port: number;
  logger: Logger;
  eventBus: EventBus;
  timers: NodeJS.Timeout[];
  configLoader: {
    loadAppConfig: () => Promise<AppConfig>;
    loadPluginOverrides: () => Promise<Record<string, unknown>>;
    loadACPConfig: () => Promise<unknown>;
    getProjectHomeDir: () => string;
  };
  storageAdapter: FileStorageAdapter;
  skillService: { discoverSkills: (...args: any[]) => Promise<void> };
  feedbackService: FeedbackService;
  voiceService: VoiceSessionService;
  acpBridge: ACPManager;
  orchestrationEventStore: EventStore;
  usageAggregator?: UsageAggregator;
  activeAgents: Map<string, Agent>;
  agentMetadataMap: Map<string, unknown>;
  memoryAdapters: Map<string, unknown>;
  agentTools: Map<string, unknown>;
  agentSpecs: Map<string, AgentSpec>;
  mcpConfigs: Map<string, unknown>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  >;
  toolNameMapping: Map<string, unknown>;
  toolNameReverseMapping: Map<string, string>;
  modelCatalog?: BedrockModelCatalog;
  framework?: RuntimeFramework;
  voltAgent?: VoltAgent;
  eventLog: RuntimeEventLog;
  bedrockAdapter: BedrockAdapter;
  claudeAdapter: ClaudeAdapter;
  codexAdapter: CodexAdapter;
  ollamaAdapter: OllamaAdapter;
  createVoltAgentInstance: (slug: string) => Promise<Agent>;
  configureRoutes: (app: any) => void;
  reloadAgents: () => Promise<void>;
  replaceTemplateVariables: (text: string, agentName?: string) => string;
  checkBedrockCredentials: () => Promise<boolean>;
  createDefaultSkillRegistryProvider: () => Promise<unknown>;
  runStartupMigrations: (projectHomeDir: string) => Promise<void>;
  startHealthChecks: () => void;
}

interface InitializeRuntimeResult {
  appConfig: AppConfig;
  framework: RuntimeFramework;
  orchestrationService: OrchestrationService;
  modelCatalog: BedrockModelCatalog;
  usageAggregator?: UsageAggregator;
  voltAgent: VoltAgent;
  voiceWsAttached: boolean;
}

export async function initializeRuntime(
  deps: InitializeRuntimeDeps,
): Promise<InitializeRuntimeResult> {
  const {
    port,
    logger,
    eventBus,
    timers,
    configLoader,
    storageAdapter,
    skillService,
    feedbackService,
    voiceService,
    acpBridge,
    orchestrationEventStore,
    usageAggregator,
    activeAgents,
    agentMetadataMap,
    memoryAdapters,
    agentTools,
    mcpConfigs,
    mcpConnectionStatus,
    integrationMetadata,
    toolNameMapping,
    toolNameReverseMapping,
    eventLog,
    bedrockAdapter,
    claudeAdapter,
    codexAdapter,
    ollamaAdapter,
    createVoltAgentInstance,
    configureRoutes,
    reloadAgents,
    replaceTemplateVariables,
    checkBedrockCredentials,
    createDefaultSkillRegistryProvider,
    runStartupMigrations,
    startHealthChecks,
  } = deps;

  logger.debug('Initializing Stallion Runtime...');

  const appConfig = await configLoader.loadAppConfig();
  const features = (process.env.STALLION_FEATURES || '')
    .split(',')
    .filter(Boolean);
  if (features.includes('strands-runtime')) {
    appConfig.runtime = 'strands';
  }

  const runtime = appConfig.runtime || 'voltagent';
  const framework: RuntimeFramework =
    runtime === 'strands' ? new StrandsFramework() : new VoltAgentFramework();

  logger.info('App config loaded', {
    region: appConfig.region,
    model: appConfig.defaultModel,
    runtime,
  });

  if (appConfig.logLevel) {
    (logger as any).level = appConfig.logLevel;
  }

  registerProviderAdapters([
    bedrockAdapter,
    claudeAdapter,
    codexAdapter,
    ollamaAdapter,
  ]);

  const orchestrationService = new OrchestrationService({
    adapterRegistry: createProviderAdapterRegistry(),
    eventBus,
    eventStore: orchestrationEventStore,
    logger,
  });
  orchestrationService.initialize();

  if (appConfig.registryUrl) {
    const registryProvider = new JsonManifestRegistryProvider(
      appConfig.registryUrl,
      configLoader.getProjectHomeDir(),
    );
    registerAgentRegistryProvider(registryProvider);
    registerIntegrationRegistryProvider(registryProvider);
    logger.info('JSON manifest registry configured', {
      url: appConfig.registryUrl,
    });
  }

  const modelCatalog = new BedrockModelCatalog(appConfig.region || 'us-east-1');
  logger.debug('Bedrock model catalog initialized');

  await loadRuntimePluginAssets({
    logger,
    projectHomeDir: configLoader.getProjectHomeDir(),
    loadPluginOverrides: () => configLoader.loadPluginOverrides(),
  });

  const nextUsageAggregator = await prepareRuntimeStartup({
    projectHomeDir: configLoader.getProjectHomeDir(),
    appConfig,
    storageAdapter,
    configLoader,
    skillService,
    logger,
    timers,
    createUsageAggregator: usageAggregator ? () => usageAggregator : undefined,
    runStartupMigrations,
    checkBedrockCredentials,
    checkOllamaAvailability,
    registerSkillRegistryProvider,
    createDefaultSkillRegistryProvider,
  });

  scheduleRuntimeDailyReload({
    timers,
    reloadAgents,
  });

  const agents = await initializeRuntimeAgents({
    configLoader: deps.configLoader as any,
    logger,
    bootstrapDefaultAgent: async () =>
      (await bootstrapRuntimeDefaultAgent({
        appConfig,
        configLoader: deps.configLoader as any,
        framework,
        logger,
        usageAggregator: nextUsageAggregator,
        port,
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        autoApproveTools: SC_READ_ONLY_TOOLS,
        replaceTemplateVariables,
        createModel: async (spec) =>
          createRuntimeFrameworkModel(spec, {
            framework,
            appConfig,
            projectHomeDir: configLoader.getProjectHomeDir(),
            modelCatalog,
            listProviderConnections: () =>
              storageAdapter.listProviderConnections(),
          }),
        loadAgentTools: async (slug, spec) =>
          MCPManager.loadAgentTools(
            slug,
            spec,
            deps.configLoader as any,
            mcpConfigs as any,
            mcpConnectionStatus,
            integrationMetadata,
            toolNameMapping as any,
            toolNameReverseMapping,
            logger,
          ),
        activeAgents: activeAgents as any,
        agentTools: agentTools as any,
        memoryAdapters: memoryAdapters as any,
        agentMetadataMap: agentMetadataMap as any,
      })) as Record<string, Agent>,
    createVoltAgentInstance,
    activeAgents: activeAgents as any,
    agentMetadataMap: agentMetadataMap as any,
  });

  const voltAgent = new VoltAgent({
    agents,
    logger: logger as any,
    server: honoServer({
      port,
      configureApp: configureRoutes,
    }),
  });

  attachVoiceWebSocket(port + 2, voiceService);
  logger.info('Voice WebSocket listening', { port: port + 2 });
  logger.debug('Stallion Runtime initialized', { port });

  registerObservableGauges({
    activeAgents: () => activeAgents.size,
    mcpConnections: () => mcpConnectionStatus.size,
  });

  await eventLog.loadRecentEvents();
  startHealthChecks();

  feedbackService.setAnalyzeCallback(async (prompt: string) => {
    const agent =
      activeAgents.get('default') || activeAgents.values().next().value;
    if (!agent) throw new Error('No agents available for feedback analysis');
    const result = await agent.generateText(prompt);
    return result.text;
  });
  feedbackService.start();

  startRuntimeACPConnections({
    loadACPConfig: async () => (await configLoader.loadACPConfig()) as any,
    acpBridge,
    logger,
  });

  scheduleRuntimePluginUpdateCheck({
    timers,
    port,
    eventBus,
    logger,
  });

  return {
    appConfig,
    framework,
    orchestrationService,
    modelCatalog,
    usageAggregator: nextUsageAggregator,
    voltAgent,
    voiceWsAttached: true,
  };
}
