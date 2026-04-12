import { ACPStatus } from '@stallion-ai/contracts/acp';
import { getNotificationProviders } from '../providers/registry.js';
import {
  ApprovalInboxNotificationProvider,
  wireApprovalInboxNotifications,
} from '../services/approval-inbox.js';
import { NotificationService } from '../services/notification-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import type { ConfigureRuntimeRoutesContext } from './runtime-routes.js';

export function createRuntimeSystemRouteDeps(
  context: ConfigureRuntimeRoutesContext,
) {
  return {
    getACPStatus: () => {
      const status = context.acpBridge.getStatus();
      return {
        connected: status.connections.some(
          (connection: any) => connection.status === ACPStatus.AVAILABLE,
        ),
        connections: status.connections,
      };
    },
    listProviderConnections: () =>
      context.providerService.listProviderConnections().map((connection) => ({
        id: connection.id,
        type: connection.type,
        enabled: connection.enabled,
        capabilities: connection.capabilities,
      })),
    checkOllamaAvailability: context.checkOllamaAvailability,
    getAppConfig: () => context.appConfig,
    eventBus: context.eventBus,
    appConfig: context.appConfig,
    port: context.port,
    skillService: context.skillService,
  };
}

export function configureRuntimeSupportServices(
  context: ConfigureRuntimeRoutesContext,
) {
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

  const notificationService = new NotificationService(
    context.eventBus,
    context.configLoader.getProjectHomeDir(),
    60_000,
  );
  const approvalInboxProvider = new ApprovalInboxNotificationProvider({
    approvalRegistry: context.approvalRegistry,
    orchestrationService: context.orchestrationService,
  });
  notificationService.addProvider(approvalInboxProvider);
  for (const { provider } of getNotificationProviders()) {
    notificationService.addProvider(provider);
  }
  wireApprovalInboxNotifications(
    context.eventBus,
    approvalInboxProvider,
    notificationService,
    context.logger,
  );
  notificationService.start();
  schedulerService.setNotificationService(notificationService);

  return { schedulerService, notificationService };
}
