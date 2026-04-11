import type { Agent } from '@voltagent/core';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';
import type { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import type { EventBus } from '../services/event-bus.js';
import type { EventStore } from '../services/event-store.js';
import type { FeedbackService } from '../services/feedback-service.js';
import type { SkillService } from '../services/skill-service.js';
import type { VoiceSessionService } from '../voice/voice-session.js';
import type { ACPManager } from '../services/acp-bridge.js';
import type { BedrockAdapter } from '../providers/adapters/bedrock-adapter.js';
import type { ClaudeAdapter } from '../providers/adapters/claude-adapter.js';
import type { CodexAdapter } from '../providers/adapters/codex-adapter.js';
import type { RuntimeEventLog } from './runtime-event-log.js';
import type { InitializeRuntimeDeps } from './runtime-initialize.js';
import type { Logger } from '../utils/logger.js';

type RuntimeIntegrationMetadata = Map<
  string,
  { type: string; transport?: string; toolCount?: number }
>;

type ToolNameMapping = Map<
  string,
  {
    original: string;
    normalized: string;
    server: string | null;
    tool: string;
  }
>;

export interface RuntimeInitializationContext {
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
  skillService: SkillService;
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
  integrationMetadata: RuntimeIntegrationMetadata;
  toolNameMapping: ToolNameMapping;
  toolNameReverseMapping: Map<string, string>;
  eventLog: RuntimeEventLog;
  bedrockAdapter: BedrockAdapter;
  claudeAdapter: ClaudeAdapter;
  codexAdapter: CodexAdapter;
  createVoltAgentInstance: (slug: string) => Promise<Agent>;
  configureRoutes: (app: any) => void;
  reloadAgents: () => Promise<void>;
  replaceTemplateVariables: (text: string, agentName?: string) => string;
  checkBedrockCredentials: () => Promise<boolean>;
  createDefaultSkillRegistryProvider: () => Promise<unknown>;
  runStartupMigrations: (projectHomeDir: string) => Promise<void>;
  startHealthChecks: () => void;
}

export function createRuntimeInitializationDeps(
  context: RuntimeInitializationContext,
): InitializeRuntimeDeps {
  return {
    port: context.port,
    logger: context.logger,
    eventBus: context.eventBus,
    timers: context.timers,
    configLoader: context.configLoader,
    storageAdapter: context.storageAdapter,
    skillService: context.skillService,
    feedbackService: context.feedbackService,
    voiceService: context.voiceService,
    acpBridge: context.acpBridge,
    orchestrationEventStore: context.orchestrationEventStore,
    usageAggregator: context.usageAggregator,
    activeAgents: context.activeAgents,
    agentMetadataMap: context.agentMetadataMap,
    memoryAdapters: context.memoryAdapters,
    agentTools: context.agentTools,
    agentSpecs: context.agentSpecs,
    mcpConfigs: context.mcpConfigs,
    mcpConnectionStatus: context.mcpConnectionStatus,
    integrationMetadata: context.integrationMetadata,
    toolNameMapping: context.toolNameMapping,
    toolNameReverseMapping: context.toolNameReverseMapping,
    eventLog: context.eventLog,
    bedrockAdapter: context.bedrockAdapter,
    claudeAdapter: context.claudeAdapter,
    codexAdapter: context.codexAdapter,
    createVoltAgentInstance: context.createVoltAgentInstance,
    configureRoutes: context.configureRoutes,
    reloadAgents: context.reloadAgents,
    replaceTemplateVariables: context.replaceTemplateVariables,
    checkBedrockCredentials: context.checkBedrockCredentials,
    createDefaultSkillRegistryProvider:
      context.createDefaultSkillRegistryProvider,
    runStartupMigrations: context.runStartupMigrations,
    startHealthChecks: context.startHealthChecks,
  };
}
