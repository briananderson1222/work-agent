import type { EventEmitter } from 'node:events';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { ConfigLoader } from '../domain/config-loader.js';
import { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import { MonitoringEmitter } from '../monitoring/emitter.js';
import { createProviderAdapterRegistry } from '../providers/registry.js';
import { ACPManager } from '../services/acp-bridge.js';
import { AgentService } from '../services/agent-service.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import { ConnectionService } from '../services/connection-service.js';
import type { EventBus } from '../services/event-bus.js';
import { FeedbackService } from '../services/feedback-service.js';
import { FileTreeService } from '../services/file-tree-service.js';
import { KnowledgeService } from '../services/knowledge-service.js';
import { LayoutService } from '../services/layout-service.js';
import { MCPService } from '../services/mcp-service.js';
import { ProjectService } from '../services/project-service.js';
import { ProviderService } from '../services/provider-service.js';
import { SkillService } from '../services/skill-service.js';
import { TerminalService } from '../services/terminal-service.js';
import { TerminalWebSocketServer } from '../services/terminal-ws-server.js';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { FileTerminalHistoryStore } from '../adapters/file-terminal-history-store.js';
import { NodePtyAdapter } from '../adapters/node-pty-adapter.js';
import { NovaSonicProvider } from '../voice/providers/nova-sonic.js';
import { VoiceSessionService } from '../voice/voice-session.js';

type ToolNameMapping = Map<
  string,
  {
    original: string;
    normalized: string;
    server: string | null;
    tool: string;
  }
>;

interface RuntimeServiceBootstrapContext {
  projectHomeDir: string;
  port: number;
  logger: any;
  configLoader: ConfigLoader;
  approvalRegistry: ApprovalRegistry;
  eventBus: EventBus;
  monitoringEvents: EventEmitter;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  activeAgents: Map<string, any>;
  agentMetadataMap: Map<string, any>;
  agentSpecs: Map<string, AgentSpec>;
  agentTools: Map<string, any[]>;
  mcpConfigs: Map<string, any>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }>;
  toolNameMapping: ToolNameMapping;
  usageAggregatorRef: { get: () => any };
  getTerminalShell: () => string | undefined;
  persistEvent: (event: any) => Promise<void>;
  bootstrapVoiceAgent: () => Promise<void>;
  resolveVectorDbProvider: () => any;
  resolveEmbeddingProvider: () => any;
}

interface RuntimeServiceBootstrapFactories {
  createStorageAdapter?: (projectHomeDir: string) => any;
  createAgentService?: (...args: any[]) => any;
  createSkillService?: (...args: any[]) => any;
  createMcpService?: (...args: any[]) => any;
  createLayoutService?: (...args: any[]) => any;
  createProjectService?: (...args: any[]) => any;
  createProviderService?: (...args: any[]) => any;
  createKnowledgeService?: (...args: any[]) => any;
  createFileTreeService?: () => any;
  createPtyAdapter?: () => any;
  createHistoryStore?: () => any;
  createTerminalService?: (...args: any[]) => any;
  createTerminalWsServer?: (terminalService: any) => any;
  createVoiceService?: (options: any) => any;
  createMonitoringEmitter?: (events: EventEmitter, persist: (event: any) => Promise<void>) => any;
  createACPManager?: (...args: any[]) => any;
  createConnectionService?: (...args: any[]) => any;
  createFeedbackService?: (projectHomeDir: string) => any;
}

export function createRuntimeServiceBundle(
  context: RuntimeServiceBootstrapContext,
  factories: RuntimeServiceBootstrapFactories = {},
) {
  const storageAdapter =
    factories.createStorageAdapter?.(context.projectHomeDir) ??
    new FileStorageAdapter(context.configLoader.getProjectHomeDir());

  const agentService =
    factories.createAgentService?.(
      context.configLoader,
      storageAdapter,
      context.activeAgents,
      context.agentMetadataMap,
      context.agentSpecs,
      context.logger,
    ) ??
    new AgentService(
      context.configLoader,
      storageAdapter,
      context.activeAgents,
      context.agentMetadataMap,
      context.agentSpecs,
      context.logger,
    );

  const skillService =
    factories.createSkillService?.(context.configLoader, context.logger) ??
    new SkillService(context.configLoader, context.logger);

  const mcpService =
    factories.createMcpService?.(
      context.configLoader,
      context.mcpConfigs,
      context.mcpConnectionStatus,
      context.integrationMetadata,
      context.agentTools,
      context.toolNameMapping,
      context.logger,
    ) ??
    new MCPService(
      context.configLoader,
      context.mcpConfigs,
      context.mcpConnectionStatus,
      context.integrationMetadata,
      context.agentTools,
      context.toolNameMapping,
      context.logger,
    );

  const layoutService =
    factories.createLayoutService?.(context.configLoader, context.logger) ??
    new LayoutService(context.configLoader, context.logger);

  const projectService =
    factories.createProjectService?.(storageAdapter) ??
    new ProjectService(storageAdapter);

  const providerService =
    factories.createProviderService?.(storageAdapter, () =>
      context.configLoader.loadAppConfig(),
    ) ?? new ProviderService(storageAdapter, () => context.configLoader.loadAppConfig());

  const knowledgeService =
    factories.createKnowledgeService?.(
      () => context.resolveVectorDbProvider(),
      () => context.resolveEmbeddingProvider(),
      context.projectHomeDir,
      storageAdapter,
    ) ??
    new KnowledgeService(
      () => context.resolveVectorDbProvider(),
      () => context.resolveEmbeddingProvider(),
      context.projectHomeDir,
      storageAdapter,
    );

  const fileTreeService =
    factories.createFileTreeService?.() ?? new FileTreeService();
  const ptyAdapter = factories.createPtyAdapter?.() ?? new NodePtyAdapter();
  const historyStore =
    factories.createHistoryStore?.() ?? new FileTerminalHistoryStore();
  const terminalService =
    factories.createTerminalService?.(
      ptyAdapter,
      historyStore,
      context.getTerminalShell,
    ) ?? new TerminalService(ptyAdapter, historyStore, context.getTerminalShell);

  const terminalWsServer =
    factories.createTerminalWsServer?.(terminalService) ??
    new TerminalWebSocketServer(terminalService);
  terminalWsServer.start(context.port + 1);

  const voiceService =
    factories.createVoiceService?.({
      providerFactory: () => new NovaSonicProvider({ region: 'us-east-1' }),
      agentTools: context.agentTools,
      agentSpecs: context.agentSpecs,
      voiceAgentSlug: 'stallion-voice',
      onFirstSession: () => context.bootstrapVoiceAgent(),
    }) ??
    new VoiceSessionService({
      providerFactory: () => new NovaSonicProvider({ region: 'us-east-1' }),
      agentTools: context.agentTools,
      agentSpecs: context.agentSpecs,
      voiceAgentSlug: 'stallion-voice',
      onFirstSession: () => context.bootstrapVoiceAgent(),
    });

  const monitoringEmitter =
    factories.createMonitoringEmitter?.(
      context.monitoringEvents,
      context.persistEvent,
    ) ?? new MonitoringEmitter(context.monitoringEvents, context.persistEvent);

  const acpBridge =
    factories.createACPManager?.(
      context.approvalRegistry,
      context.logger,
      process.cwd(),
      context.memoryAdapters,
          (_slug: string) =>
        new FileMemoryAdapter({
          projectHomeDir: context.configLoader.getProjectHomeDir(),
          usageAggregator: context.usageAggregatorRef.get(),
        }),
      context.usageAggregatorRef,
      context.eventBus,
      context.monitoringEvents,
      context.persistEvent,
      monitoringEmitter,
    ) ??
    new ACPManager(
      context.approvalRegistry,
      context.logger,
      process.cwd(),
      context.memoryAdapters,
      (_slug: string) =>
        new FileMemoryAdapter({
          projectHomeDir: context.configLoader.getProjectHomeDir(),
          usageAggregator: context.usageAggregatorRef.get(),
        }),
      context.usageAggregatorRef,
      context.eventBus,
      context.monitoringEvents,
      context.persistEvent,
      monitoringEmitter,
    );

  const connectionService =
    factories.createConnectionService?.(
      providerService,
      () => createProviderAdapterRegistry().list(),
      async () => {
        const config = await context.configLoader.loadACPConfig();
        return config.connections;
      },
      () => acpBridge.getStatus(),
      () => context.configLoader.loadAppConfig(),
      (updates: any) => context.configLoader.updateAppConfig(updates),
    ) ??
    new ConnectionService(
      providerService,
      () => createProviderAdapterRegistry().list(),
      async () => {
        const config = await context.configLoader.loadACPConfig();
        return config.connections;
      },
      () => acpBridge.getStatus(),
      () => context.configLoader.loadAppConfig(),
      (updates) => context.configLoader.updateAppConfig(updates),
    );

  const feedbackService =
    factories.createFeedbackService?.(context.projectHomeDir) ??
    new FeedbackService(context.projectHomeDir);

  return {
    storageAdapter,
    agentService,
    skillService,
    mcpService,
    layoutService,
    projectService,
    providerService,
    knowledgeService,
    fileTreeService,
    terminalService,
    terminalWsServer,
    voiceService,
    monitoringEmitter,
    acpBridge,
    connectionService,
    feedbackService,
  };
}
