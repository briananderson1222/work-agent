export async function shutdownRuntimeServices({
  logger,
  timers,
  schedulerService,
  mcpConfigs,
  activeAgents,
  acpBridge,
  feedbackService,
  notificationService,
  voiceService,
  terminalWsServer,
  terminalService,
  configLoader,
}: {
  logger: any;
  timers: NodeJS.Timeout[];
  schedulerService: { stop(): Promise<void> };
  mcpConfigs: Map<string, { disconnect(): Promise<void> }>;
  activeAgents: Map<string, any>;
  acpBridge: { shutdown(): Promise<void> };
  feedbackService: { stop(): void };
  notificationService: { stop(): void };
  voiceService: { stop(): Promise<void> };
  terminalWsServer: { stop(): void };
  terminalService: { dispose(): Promise<void> };
  configLoader: { dispose(): Promise<void> };
}): Promise<void> {
  logger.info('Shutting down Stallion Runtime...');

  for (const timer of timers) clearTimeout(timer);
  timers.length = 0;

  await schedulerService.stop();

  for (const [key, mcpConfig] of mcpConfigs.entries()) {
    try {
      await mcpConfig.disconnect();
      logger.info('MCP disconnected', { mcp: key });
    } catch (error) {
      logger.error('Failed to disconnect MCP', { mcp: key, error });
    }
  }

  mcpConfigs.clear();
  activeAgents.clear();

  await acpBridge.shutdown();
  feedbackService.stop();
  notificationService.stop();
  await voiceService.stop();
  terminalWsServer.stop();
  await terminalService.dispose();
  await configLoader.dispose();

  logger.info('Shutdown complete');
}
