import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { Agent } from '@voltagent/core';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { FileStorageAdapter } from '../domain/file-storage-adapter.js';
import { getActiveRuntimeProjectSlug } from './runtime-startup.js';

export async function reloadRuntimeAgents({
  configLoader,
  activeAgents,
  agentMetadataMap,
  agentSpecs,
  agentTools,
  memoryAdapters,
  mcpConfigs,
  mcpConnectionStatus,
  integrationMetadata,
  voltAgent,
  logger,
  eventBus,
  createVoltAgentInstance,
  loadAppConfig,
  applyLogLevel,
}: {
  configLoader: ConfigLoader;
  activeAgents: Map<string, Agent>;
  agentMetadataMap: Map<string, any>;
  agentSpecs: Map<string, AgentSpec>;
  agentTools: Map<string, any[]>;
  memoryAdapters: Map<string, any>;
  mcpConfigs: Map<string, { disconnect(): Promise<void> }>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  >;
  voltAgent?: { registerAgent(agent: Agent): void };
  logger: any;
  eventBus: { emit(event: string, data?: Record<string, unknown>): void };
  createVoltAgentInstance: (slug: string) => Promise<Agent>;
  loadAppConfig: () => Promise<AppConfig>;
  applyLogLevel: (appConfig: AppConfig) => void;
}): Promise<AppConfig> {
  const appConfig = await loadAppConfig();
  applyLogLevel(appConfig);

  const agentMetadataList = await configLoader.listAgents();
  const currentSlugs = new Set(
    agentMetadataList.map((metadata) => metadata.slug),
  );

  for (const slug of activeAgents.keys()) {
    if (slug === 'default') continue;
    if (currentSlugs.has(slug)) continue;

    for (const [key, config] of mcpConfigs.entries()) {
      if (!key.startsWith(`${slug}:`)) continue;
      await config.disconnect();
      mcpConfigs.delete(key);
      mcpConnectionStatus.delete(key);
      integrationMetadata.delete(key);
    }

    activeAgents.delete(slug);
    agentMetadataMap.delete(slug);
    agentSpecs.delete(slug);
    agentTools.delete(slug);
    memoryAdapters.delete(slug);
    logger.info('Agent removed', { agent: slug });
  }

  for (const metadata of agentMetadataList) {
    if (activeAgents.has(metadata.slug)) continue;
    try {
      const agent = await createVoltAgentInstance(metadata.slug);
      activeAgents.set(metadata.slug, agent);
      voltAgent?.registerAgent(agent);
      logger.info('Agent added', { agent: metadata.slug });
    } catch (error) {
      logger.error('Failed to add agent', { agent: metadata.slug, error });
    }
  }

  const defaultMeta = agentMetadataMap.get('default');
  agentMetadataMap.clear();
  for (const metadata of agentMetadataList) {
    agentMetadataMap.set(metadata.slug, metadata);
  }
  if (defaultMeta) {
    agentMetadataMap.set('default', defaultMeta);
  }

  logger.info('Agents reloaded', { count: agentMetadataList.length });
  eventBus.emit('agents:changed', { count: agentMetadataList.length });
  return appConfig;
}

export async function reloadRuntimeSkillsAndAgents({
  skillService,
  configLoader,
  storageAdapter,
  activeAgents,
  logger,
  createVoltAgentInstance,
}: {
  skillService: {
    discoverSkills(
      projectHomeDir: string,
      activeProject?: string,
    ): Promise<void>;
  };
  configLoader: ConfigLoader;
  storageAdapter: FileStorageAdapter;
  activeAgents: Map<string, Agent>;
  logger: any;
  createVoltAgentInstance: (slug: string) => Promise<Agent>;
}): Promise<void> {
  const activeProject = getActiveRuntimeProjectSlug(storageAdapter);
  await skillService.discoverSkills(
    configLoader.getProjectHomeDir(),
    activeProject,
  );

  const agentMetadataList = await configLoader.listAgents();
  for (const metadata of agentMetadataList) {
    try {
      const agent = await createVoltAgentInstance(metadata.slug);
      activeAgents.set(metadata.slug, agent);
      logger.info('Agent rebuilt with updated skills', {
        agent: metadata.slug,
      });
    } catch (error) {
      logger.error('Failed to rebuild agent', {
        agent: metadata.slug,
        error,
      });
    }
  }
}

export async function switchRuntimeAgent({
  targetSlug,
  activeAgents,
  voltAgent,
  logger,
  createVoltAgentInstance,
}: {
  targetSlug: string;
  activeAgents: Map<string, Agent>;
  voltAgent?: { registerAgent(agent: Agent): void };
  logger: any;
  createVoltAgentInstance: (slug: string) => Promise<Agent>;
}): Promise<Agent> {
  logger.info('Switching agent', { from: 'current', to: targetSlug });

  const existingAgent = activeAgents.get(targetSlug);
  if (existingAgent) {
    logger.info('Agent already loaded', { agent: targetSlug });
    return existingAgent;
  }

  const agent = await createVoltAgentInstance(targetSlug);
  activeAgents.set(targetSlug, agent);
  voltAgent?.registerAgent(agent);
  logger.info('Agent switched successfully', { agent: targetSlug });
  return agent;
}
