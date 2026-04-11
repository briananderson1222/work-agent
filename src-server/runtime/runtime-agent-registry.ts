import type { Agent } from '@voltagent/core';

interface RuntimeAgentRegistryLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface RuntimeAgentMetadata {
  slug: string;
}

interface RuntimeAgentRegistryContext {
  configLoader: {
    listAgents(): Promise<RuntimeAgentMetadata[]>;
  };
  logger: RuntimeAgentRegistryLogger;
  bootstrapDefaultAgent(): Promise<Record<string, Agent>>;
  createVoltAgentInstance(slug: string): Promise<Agent>;
  activeAgents: Map<string, Agent>;
  agentMetadataMap: Map<string, RuntimeAgentMetadata | unknown>;
}

export async function initializeRuntimeAgents(
  context: RuntimeAgentRegistryContext,
): Promise<Record<string, Agent>> {
  const agentMetadataList = await context.configLoader.listAgents();
  context.logger.info('Found agents', { count: agentMetadataList.length });

  const agents = await context.bootstrapDefaultAgent();

  for (const metadata of agentMetadataList) {
    try {
      const agent = await context.createVoltAgentInstance(metadata.slug);
      agents[metadata.slug] = agent;
      context.activeAgents.set(metadata.slug, agent);
      context.logger.info('Agent loaded', { agent: metadata.slug });
    } catch (error) {
      context.logger.error('Failed to load agent', {
        agent: metadata.slug,
        error,
      });
    }
  }

  replaceRuntimeAgentMetadataMap(
    context.agentMetadataMap,
    agentMetadataList,
    context.logger,
  );

  return agents;
}

export function replaceRuntimeAgentMetadataMap(
  agentMetadataMap: Map<string, RuntimeAgentMetadata | unknown>,
  agentMetadataList: RuntimeAgentMetadata[],
  logger: Pick<RuntimeAgentRegistryLogger, 'info'>,
): void {
  const savedDefaultMetadata = agentMetadataMap.get('default');
  agentMetadataMap.clear();
  for (const metadata of agentMetadataList) {
    agentMetadataMap.set(metadata.slug, metadata);
  }
  if (savedDefaultMetadata) {
    agentMetadataMap.set('default', savedDefaultMetadata);
  }

  logger.info('Agent metadata map created', {
    count: agentMetadataMap.size,
    keys: Array.from(agentMetadataMap.keys()),
    sample: agentMetadataList[0]
      ? agentMetadataMap.get(agentMetadataList[0].slug)
      : undefined,
  });
}
