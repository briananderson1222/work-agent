import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import {
  createEmbeddingProvider,
  createLLMProvider,
  createVectorDbProvider,
} from '../providers/connection-factories.js';
import { safeListModels } from '../providers/model-catalog.js';
import type { ProviderService } from '../services/provider-service.js';
import type { IAgentFramework } from './types.js';

type ProviderConnection = ReturnType<
  ProviderService['listProviderConnections']
>[number];
type ProviderCapability = ProviderConnection['capabilities'][number];

export interface ResolvedManagedModelBinding {
  providerConnection: ProviderConnectionConfig | null;
  providerType: string;
  modelId: string;
}

export async function createRuntimeFrameworkModel(
  spec: AgentSpec,
  options: {
    framework: IAgentFramework;
    appConfig: AppConfig;
    projectHomeDir: string;
    modelCatalog?: BedrockModelCatalog;
    listProviderConnections?: () => ProviderConnectionConfig[];
  },
) {
  return options.framework.createModel(spec, {
    appConfig: options.appConfig,
    projectHomeDir: options.projectHomeDir,
    modelCatalog: options.modelCatalog,
    listProviderConnections: options.listProviderConnections,
  });
}

export async function resolveConfiguredModelId(
  spec: Pick<AgentSpec, 'model'>,
  options: {
    appConfig: Pick<AppConfig, 'defaultModel'>;
    modelCatalog?: Pick<BedrockModelCatalog, 'resolveModelId'>;
  },
): Promise<string> {
  const modelId = spec.model || options.appConfig.defaultModel || '';
  if (!modelId) {
    return '';
  }
  return options.modelCatalog
    ? await options.modelCatalog.resolveModelId(modelId)
    : modelId;
}

export async function resolveManagedModelBinding(
  spec: Pick<AgentSpec, 'model' | 'execution'>,
  options: {
    appConfig: Pick<AppConfig, 'defaultLLMProvider' | 'defaultModel'>;
    listProviderConnections?: () => ProviderConnectionConfig[];
    modelCatalog?: Pick<BedrockModelCatalog, 'resolveModelId'>;
  },
): Promise<ResolvedManagedModelBinding> {
  const enabledLlmConnections = (
    options.listProviderConnections?.() ?? []
  ).filter(
    (connection) =>
      connection.enabled && connection.capabilities.includes('llm'),
  );
  const providerConnection = resolveManagedProviderConnection(
    spec,
    options.appConfig,
    enabledLlmConnections,
  );
  const modelId = await resolveManagedModelId(spec, {
    appConfig: options.appConfig,
    providerConnection,
    modelCatalog: options.modelCatalog,
  });

  return {
    providerConnection,
    providerType: providerConnection?.type ?? 'bedrock',
    modelId,
  };
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

function resolveManagedProviderConnection(
  spec: Pick<AgentSpec, 'execution'>,
  appConfig: Pick<AppConfig, 'defaultLLMProvider'>,
  providerConnections: ProviderConnectionConfig[],
): ProviderConnectionConfig | null {
  const explicitConnectionId =
    typeof spec.execution?.modelConnectionId === 'string'
      ? spec.execution.modelConnectionId.trim()
      : '';
  if (explicitConnectionId) {
    const explicitConnection = providerConnections.find(
      (connection) => connection.id === explicitConnectionId,
    );
    if (explicitConnection) {
      return explicitConnection;
    }
  }

  const defaultConnectionId =
    typeof appConfig.defaultLLMProvider === 'string'
      ? appConfig.defaultLLMProvider.trim()
      : '';
  if (defaultConnectionId) {
    const defaultConnection = providerConnections.find(
      (connection) => connection.id === defaultConnectionId,
    );
    if (defaultConnection) {
      return defaultConnection;
    }
  }

  return providerConnections[0] ?? null;
}

async function resolveManagedModelId(
  spec: Pick<AgentSpec, 'model' | 'execution'>,
  options: {
    appConfig: Pick<AppConfig, 'defaultModel'>;
    providerConnection: ProviderConnectionConfig | null;
    modelCatalog?: Pick<BedrockModelCatalog, 'resolveModelId'>;
  },
): Promise<string> {
  const preferredModel = firstDefinedString(
    spec.execution?.modelId,
    spec.model,
    getConnectionDefaultModel(options.providerConnection),
    options.appConfig.defaultModel,
  );
  if (!options.providerConnection) {
    return resolveConfiguredModelId(
      { model: preferredModel },
      {
        appConfig: { defaultModel: options.appConfig.defaultModel ?? '' },
        modelCatalog: options.modelCatalog,
      },
    );
  }

  if (options.providerConnection.type === 'bedrock') {
    return resolveConfiguredModelId(
      { model: preferredModel },
      {
        appConfig: { defaultModel: preferredModel },
        modelCatalog: options.modelCatalog,
      },
    );
  }

  const models = await safeListModels(
    createLLMProvider(options.providerConnection),
  );
  if (models.length === 0) {
    return preferredModel;
  }
  if (preferredModel && models.some((model) => model.id === preferredModel)) {
    return preferredModel;
  }

  return models[0]!.id;
}

function firstDefinedString(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function getConnectionDefaultModel(
  providerConnection: ProviderConnectionConfig | null,
): string {
  if (!providerConnection) {
    return '';
  }
  const value = providerConnection.config.defaultModel;
  return typeof value === 'string' ? value.trim() : '';
}
