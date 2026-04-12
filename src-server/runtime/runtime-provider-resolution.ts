import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import {
  createEmbeddingProvider,
  createVectorDbProvider,
} from '../providers/connection-factories.js';
import type { ProviderService } from '../services/provider-service.js';
import type { IAgentFramework } from './types.js';

type ProviderConnection = ReturnType<
  ProviderService['listProviderConnections']
>[number];
type ProviderCapability = ProviderConnection['capabilities'][number];

export async function createRuntimeFrameworkModel(
  spec: AgentSpec,
  options: {
    framework: IAgentFramework;
    appConfig: AppConfig;
    projectHomeDir: string;
    modelCatalog?: BedrockModelCatalog;
  },
) {
  return options.framework.createModel(spec, {
    appConfig: options.appConfig,
    projectHomeDir: options.projectHomeDir,
    modelCatalog: options.modelCatalog,
  });
}

export function resolveRuntimeVectorDbProvider(
  providerService: ProviderService,
) {
  const connection = findRuntimeCapabilityConnection(
    providerService,
    'vectordb',
  );
  return connection ? createVectorDbProvider(connection) : null;
}

export function resolveRuntimeEmbeddingProvider(
  providerService: ProviderService,
) {
  const connection = findRuntimeCapabilityConnection(
    providerService,
    'embedding',
  );
  return connection ? createEmbeddingProvider(connection) : null;
}

function findRuntimeCapabilityConnection(
  providerService: Pick<ProviderService, 'listProviderConnections'>,
  capability: ProviderCapability,
): ProviderConnection | undefined {
  return providerService
    .listProviderConnections()
    .find(
      (connection) =>
        connection.enabled && connection.capabilities.includes(capability),
    );
}
