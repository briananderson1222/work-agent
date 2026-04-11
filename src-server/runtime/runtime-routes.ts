import type { Agent } from '@voltagent/core';
import type { HonoServerConfig } from '@voltagent/server-hono';
import { ACPStatus } from '@stallion-ai/contracts/acp';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { createOtlpReceiverRoutes } from '../monitoring/otlp-receiver.js';
import { getNotificationProviders } from '../providers/registry.js';
import { createACPRoutes } from '../routes/acp.js';
import { createAgentToolRoutes } from '../routes/agent-tools.js';
import { createAgentRoutes } from '../routes/agents.js';
import { createAnalyticsRoutes } from '../routes/analytics.js';
import {
  createAuthRoutes,
  createUserRoutes,
} from '../routes/auth.js';
import { createBedrockRoutes } from '../routes/bedrock.js';
import { createBrandingRoutes } from '../routes/branding.js';
import { createChatRoutes } from '../routes/chat.js';
import { createCodingRoutes } from '../routes/coding.js';
import { createConfigRoutes } from '../routes/config.js';
import { createConnectionRoutes } from '../routes/connections.js';
import {
  createConversationRoutes,
  createGlobalConversationRoutes,
} from '../routes/conversations.js';
import { createEnrichedAgentRoutes } from '../routes/enriched-agents.js';
import { createEventRoutes } from '../routes/events.js';
import { createFeedbackRoutes } from '../routes/feedback.js';
import { createFsRoutes } from '../routes/fs.js';
import { createInsightsRoutes } from '../routes/insights.js';
import { createInvokeRoutes } from '../routes/invoke.js';
import {
  createCrossProjectKnowledgeRoutes,
  createKnowledgeRoutes,
} from '../routes/knowledge.js';
import { createWorkflowRoutes } from '../routes/layouts.js';
import modelsRoute from '../routes/models.js';
import { createMonitoringRoutes } from '../routes/monitoring.js';
import { createNotificationRoutes } from '../routes/notifications.js';
import { createOrchestrationRoutes } from '../routes/orchestration.js';
import { createPluginRoutes } from '../routes/plugins.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createPromptRoutes } from '../routes/prompts.js';
import { createProviderRoutes } from '../routes/providers.js';
import { createRegistryRoutes } from '../routes/registry.js';
import { createSchedulerRoutes } from '../routes/scheduler.js';
import { createSkillRoutes } from '../routes/skills.js';
import { createSystemRoutes } from '../routes/system.js';
import { createTelemetryRoutes } from '../routes/telemetry-events.js';
import { createTemplateRoutes } from '../routes/templates.js';
import { createToolRoutes } from '../routes/tools.js';
import { createUICommandRoutes } from '../routes/ui-commands.js';
import { createVoiceRoutes } from '../routes/voice.js';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ACPManager } from '../services/acp-bridge.js';
import type { AgentService } from '../services/agent-service.js';
import type { ConnectionService } from '../services/connection-service.js';
import type { EventBus } from '../services/event-bus.js';
import type { FeedbackService } from '../services/feedback-service.js';
import type { FileTreeService } from '../services/file-tree-service.js';
import type { KnowledgeService } from '../services/knowledge-service.js';
import type { LayoutService } from '../services/layout-service.js';
import type { MCPService } from '../services/mcp-service.js';
import { NotificationService } from '../services/notification-service.js';
import type { OrchestrationService } from '../services/orchestration-service.js';
import type { ProjectService } from '../services/project-service.js';
import { PromptService } from '../services/prompt-service.js';
import type { ProviderService } from '../services/provider-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import type { SkillService } from '../services/skill-service.js';
import type { MonitoringEmitter } from '../monitoring/emitter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { configureRuntimeHttp } from './runtime-http.js';
import type { RuntimeContext } from './types.js';
import type { Logger } from '../utils/logger.js';

type HonoApp = Parameters<NonNullable<HonoServerConfig['configureApp']>>[0];

interface ConfigureRuntimeRoutesContext {
  app: HonoApp;
  logger: Logger;
  eventBus: EventBus;
  appConfig: AppConfig;
  port: number;
  usageAggregator?: any;
  skillService: SkillService;
  configLoader: ConfigLoader;
  feedbackService: FeedbackService;
  fileTreeService: FileTreeService;
  storageAdapter: FileStorageAdapter;
  providerService: ProviderService;
  projectService: ProjectService;
  agentService: AgentService;
  connectionService: ConnectionService;
  mcpService: MCPService;
  orchestrationService: OrchestrationService;
  layoutService: LayoutService;
  modelCatalog?: BedrockModelCatalog;
  acpBridge: ACPManager;
  knowledgeService: KnowledgeService;
  voiceService: any;
  activeAgents: Map<string, Agent>;
  agentMetadataMap: Map<string, any>;
  memoryAdapters: Map<string, any>;
  agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >;
  agentTools: Map<string, any[]>;
  agentStats: Map<
    string,
    { conversationCount: number; messageCount: number; lastUpdated: number }
  >;
  agentStatus: Map<string, string>;
  metricsLog: any[];
  monitoringEvents: any;
  monitoringEmitter: MonitoringEmitter;
  eventLogPath: string;
  queryEventsFromDisk: (
    start: number,
    end: number,
    userId: string,
  ) => Promise<any[]>;
  buildRuntimeContext: () => RuntimeContext;
  reloadAgents: () => Promise<void>;
  reloadSkillsAndAgents: () => Promise<void>;
  initialize: () => Promise<void>;
  getVoltAgent: () => any;
  defaultAutoApprovedTools: string[];
  createMemoryAdapter: (slug: string) => FileMemoryAdapter;
}

interface ConfigureRuntimeRoutesResult {
  schedulerService: SchedulerService;
  notificationService: NotificationService;
}

export function configureRuntimeRoutes(
  context: ConfigureRuntimeRoutesContext,
): ConfigureRuntimeRoutesResult {
  configureRuntimeHttp({
    app: context.app,
    logger: context.logger,
    eventBus: context.eventBus,
  });

  context.app.route('/api/models', modelsRoute);
  context.app.route(
    '/api/system',
    createSystemRoutes(
      {
        getACPStatus: () => {
          const status = context.acpBridge.getStatus();
          return {
            connected: status.connections.some(
              (connection: any) => connection.status === ACPStatus.AVAILABLE,
            ),
            connections: status.connections,
          };
        },
        getAppConfig: () => context.appConfig,
        eventBus: context.eventBus,
        appConfig: context.appConfig,
        port: context.port,
        skillService: context.skillService,
      },
      context.logger,
    ),
  );
  context.app.route(
    '/api/analytics',
    createAnalyticsRoutes(context.usageAggregator),
  );
  context.app.route('/api/telemetry', createTelemetryRoutes(context.logger));
  context.app.route('/api/auth', createAuthRoutes());
  context.app.route('/api/users', createUserRoutes());
  context.app.route(
    '/api/plugins',
    createPluginRoutes(
      context.configLoader.getProjectHomeDir(),
      context.logger,
      context.eventBus,
    ),
  );
  context.app.route('/api/fs', createFsRoutes());
  context.app.route(
    '/api/registry',
    createRegistryRoutes(
      context.configLoader,
      async () => {
        const acpConfig = await context.configLoader.loadACPConfig();
        await context.acpBridge.startAll(acpConfig.connections);
      },
      context.reloadSkillsAndAgents,
      context.skillService,
    ),
  );

  context.app.route(
    '/agents',
    createAgentRoutes(
      context.agentService,
      context.skillService,
      context.reloadAgents,
      context.getVoltAgent,
    ),
  );
  context.app.route(
    '/api/skills',
    createSkillRoutes(context.skillService, () =>
      context.configLoader.getProjectHomeDir(),
    ),
  );
  context.app.route(
    '/integrations',
    createToolRoutes(context.mcpService, context.initialize),
  );
  context.app.route(
    '/events',
    createEventRoutes({
      eventBus: context.eventBus,
      getACPStatus: () => {
        const status = context.acpBridge.getStatus();
        return {
          connected: status.connections.some(
            (connection: any) => connection.status === ACPStatus.AVAILABLE,
          ),
          connections: status.connections,
        };
      },
      logger: context.logger,
    }),
  );
  context.app.route('/api/ui', createUICommandRoutes(context.eventBus));
  context.app.route(
    '/api/orchestration',
    createOrchestrationRoutes(context.orchestrationService, {
      eventBus: context.eventBus,
      logger: context.logger,
    }),
  );

  const runtimeContext = context.buildRuntimeContext();

  context.app.route(
    '/api/agents',
    createEnrichedAgentRoutes({
      agentMetadataMap: context.agentMetadataMap,
      activeAgents: context.activeAgents,
      loadAgent: (slug) => context.configLoader.loadAgent(slug),
      defaultModel: context.appConfig.defaultModel,
      defaultTools: {
        mcpServers: ['stallion-control'],
        autoApprove: context.defaultAutoApprovedTools,
      },
      getVirtualAgents: () => context.acpBridge.getVirtualAgents(),
      isACPConnected: () => context.acpBridge.isConnected(),
      reloadAgents: context.reloadAgents,
      logger: context.logger,
    }),
  );

  context.app.route('/acp', createACPRoutes(runtimeContext));
  context.app.route('/agents', createAgentToolRoutes(runtimeContext));
  context.app.route('/', createInvokeRoutes(runtimeContext));
  context.app.route('/api/agents', createChatRoutes(runtimeContext));
  context.app.route('/agents', createWorkflowRoutes(context.layoutService));
  context.app.route(
    '/api/projects',
    createProjectRoutes(
      context.projectService,
      context.storageAdapter,
      context.configLoader.getProjectHomeDir(),
    ),
  );
  context.app.route(
    '/api/providers',
    createProviderRoutes(context.providerService),
  );
  context.app.route(
    '/api/connections',
    createConnectionRoutes(context.connectionService),
  );
  context.app.get('/api/projects/:slug/conversations', async (routeContext) => {
    const limit = Number(routeContext.req.query('limit') || 50);
    const adapter = context.memoryAdapters.values().next().value;
    if (!adapter) {
      return routeContext.json({ success: true, data: [] });
    }
    const conversations = await adapter.queryConversations({});
    conversations.sort((a: any, b: any) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    );
    return routeContext.json({
      success: true,
      data: conversations.slice(0, limit),
    });
  });
  context.app.route(
    '/api/projects/:slug/knowledge',
    createKnowledgeRoutes(context.knowledgeService),
  );
  context.app.route(
    '/api/knowledge',
    createCrossProjectKnowledgeRoutes(
      context.knowledgeService,
      context.storageAdapter,
      context.providerService,
    ),
  );
  context.app.route('/api/coding', createCodingRoutes(context.fileTreeService));
  context.app.route(
    '/api/templates',
    createTemplateRoutes(context.storageAdapter),
  );
  context.app.route(
    '/config',
    createConfigRoutes(
      context.configLoader,
      context.logger,
      context.eventBus,
      context.reloadAgents,
    ),
  );
  context.app.route(
    '/bedrock',
    createBedrockRoutes(
      () => context.modelCatalog!,
      context.appConfig,
      context.logger,
    ),
  );
  context.app.route('/api/branding', createBrandingRoutes());
  context.app.route(
    '/monitoring',
    createMonitoringRoutes({
      activeAgents: context.activeAgents as any,
      agentStats: context.agentStats,
      agentStatus: context.agentStatus as any,
      memoryAdapters: context.memoryAdapters,
      metricsLog: context.metricsLog,
      monitoringEvents: context.monitoringEvents,
      queryEventsFromDisk: context.queryEventsFromDisk,
      acpBridge: context.acpBridge,
    }),
  );
  context.app.route(
    '',
    createOtlpReceiverRoutes((event) =>
      context.monitoringEmitter.emitRaw(event),
    ),
  );
  context.app.route(
    '/agents',
    createConversationRoutes(
      context.memoryAdapters,
      context.logger,
      context.agentFixedTokens,
      context.agentTools,
      context.configLoader,
      context.appConfig,
      context.modelCatalog,
      context.createMemoryAdapter,
    ),
  );
  context.app.route(
    '/api/conversations',
    createGlobalConversationRoutes(
      context.memoryAdapters,
      context.storageAdapter,
      context.logger,
    ),
  );

  const schedulerService = new SchedulerService(context.logger);
  schedulerService.setChatFn(async (agentSlug, prompt) => {
    const resolvedSlug =
      agentSlug === 'default'
        ? context.activeAgents.keys().next().value || agentSlug
        : agentSlug;
    const agent = context.activeAgents.get(resolvedSlug);
    if (!agent) {
      throw new Error(`Agent '${resolvedSlug}' not found`);
    }
    const result = await agent.generateText(prompt);
    return result.text;
  });
  context.app.route(
    '/scheduler',
    createSchedulerRoutes(schedulerService, context.logger),
  );

  const notificationService = new NotificationService(
    context.eventBus,
    context.configLoader.getProjectHomeDir(),
    60_000,
  );
  for (const { provider } of getNotificationProviders()) {
    notificationService.addProvider(provider);
  }
  notificationService.start();
  schedulerService.setNotificationService(notificationService);
  context.app.route(
    '/notifications',
    createNotificationRoutes(notificationService),
  );
  context.app.route(
    '/api/feedback',
    createFeedbackRoutes(context.feedbackService),
  );
  context.app.route('/api/insights', createInsightsRoutes(context.eventLogPath));
  context.app.route('/api/voice', createVoiceRoutes(context.voiceService));

  const promptRoutes = createPromptRoutes(new PromptService(), context.logger);
  context.app.route('/api/prompts', promptRoutes);
  context.app.route('/api/playbooks', promptRoutes);

  return { schedulerService, notificationService };
}
