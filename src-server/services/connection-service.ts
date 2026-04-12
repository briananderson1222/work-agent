import type { ACPConnectionConfig } from '@stallion-ai/contracts/acp';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type {
  ConnectionConfig,
  ConnectionStatus,
  Prerequisite,
  ProviderConnectionConfig,
} from '@stallion-ai/contracts/tool';
import type { ProviderAdapterShape } from '../providers/adapter-shape.js';
import {
  createEmbeddingProvider,
  createLLMProvider,
  createVectorDbProvider,
} from '../providers/connection-factories.js';
import { configOps } from '../telemetry/metrics.js';
import {
  type ACPConnectionStatus,
  hasRequiredMissing,
  listRuntimeConnectionsForAdapters,
  MODEL_CAPABILITY_SET,
  sanitizeRuntimeConfig,
  toModelConnection,
} from './connection-service-helpers.js';
import type { ProviderService } from './provider-service.js';

export class ConnectionService {
  constructor(
    private readonly providerService: Pick<
      ProviderService,
      | 'listProviderConnections'
      | 'saveProviderConnection'
      | 'deleteProviderConnection'
      | 'checkHealth'
    >,
    private readonly getProviderAdapters: () => ProviderAdapterShape[],
    private readonly getACPConnections: () => Promise<ACPConnectionConfig[]>,
    private readonly getACPStatus: () => {
      connections?: ACPConnectionStatus[];
    },
    private readonly getAppConfig: () => Promise<AppConfig>,
    private readonly updateAppConfig: (
      updates: Partial<AppConfig>,
    ) => Promise<AppConfig>,
  ) {}

  async listConnections(): Promise<ConnectionConfig[]> {
    const [models, runtimes] = await Promise.all([
      this.listModelConnections(),
      this.listRuntimeConnections(),
    ]);
    return [...models, ...runtimes];
  }

  async listModelConnections(): Promise<ConnectionConfig[]> {
    const connections = this.providerService.listProviderConnections();
    return Promise.all(
      connections.map(async (connection) => {
        const prerequisites = await this.collectModelPrerequisites(connection);
        const base = toModelConnection(connection, prerequisites);
        const llmProvider = createLLMProvider(connection);
        const modelOptions = llmProvider
          ? await llmProvider
              .listModels()
              .then((models) =>
                models.map((model) => ({
                  id: model.id,
                  name: model.name,
                  originalId: model.id,
                })),
              )
              .catch(() => [])
          : [];
        return {
          ...base,
          config:
            modelOptions.length > 0
              ? { ...base.config, modelOptions }
              : base.config,
        };
      }),
    );
  }

  async listRuntimeConnections(): Promise<ConnectionConfig[]> {
    const [appConfig, acpConnections] = await Promise.all([
      this.getAppConfig(),
      this.getACPConnections(),
    ]);
    return listRuntimeConnectionsForAdapters({
      adapters: this.getProviderAdapters(),
      appConfig,
      acpConnections,
      acpStatus: this.getACPStatus(),
    });
  }

  async getConnection(id: string): Promise<ConnectionConfig | null> {
    const connections = await this.listConnections();
    return connections.find((connection) => connection.id === id) ?? null;
  }

  async saveConnection(
    connection: ConnectionConfig,
  ): Promise<ConnectionConfig> {
    if (connection.kind === 'model') {
      this.providerService.saveProviderConnection({
        id: connection.id,
        type: connection.type,
        name: connection.name,
        config: connection.config,
        enabled: connection.enabled,
        capabilities: connection.capabilities.filter((capability) =>
          MODEL_CAPABILITY_SET.has(capability),
        ) as ProviderConnectionConfig['capabilities'],
      });
    } else {
      const current = await this.getConnection(connection.id);
      if (!current || current.kind !== 'runtime') {
        throw new Error(`Connection '${connection.id}' not found`);
      }

      const appConfig = await this.getAppConfig();
      const nextRuntimeConnections = {
        ...(appConfig.runtimeConnections ?? {}),
        [connection.id]: {
          ...(appConfig.runtimeConnections?.[connection.id] ?? {}),
          name: connection.name,
          enabled: connection.enabled,
          config: sanitizeRuntimeConfig(connection.id, connection.config),
        },
      };
      await this.updateAppConfig({
        runtimeConnections: nextRuntimeConnections,
      });
      configOps.add(1, { op: 'update_runtime_connection', id: connection.id });
    }

    const saved = await this.getConnection(connection.id);
    if (!saved) {
      throw new Error(
        `Failed to reload connection '${connection.id}' after save.`,
      );
    }
    return saved;
  }

  async deleteConnection(id: string): Promise<void> {
    const connection = await this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection '${id}' not found`);
    }
    if (connection.kind === 'model') {
      this.providerService.deleteProviderConnection(id);
      return;
    }

    const appConfig = await this.getAppConfig();
    if (!appConfig.runtimeConnections?.[id]) {
      return;
    }

    const nextRuntimeConnections = { ...appConfig.runtimeConnections };
    delete nextRuntimeConnections[id];
    await this.updateAppConfig({
      runtimeConnections: nextRuntimeConnections,
    });
    configOps.add(1, { op: 'reset_runtime_connection', id });
  }

  async testConnection(id: string): Promise<{
    healthy: boolean;
    status: ConnectionStatus;
    prerequisites: Prerequisite[];
  }> {
    const connection = await this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection '${id}' not found`);
    }

    if (connection.kind === 'model') {
      const providerConnection = this.providerService
        .listProviderConnections()
        .find((candidate) => candidate.id === id);
      if (!providerConnection) {
        throw new Error(`Connection '${id}' not found`);
      }

      const llmProvider = createLLMProvider(providerConnection);
      const healthy = llmProvider
        ? await this.providerService.checkHealth(
            llmProvider,
            providerConnection.type,
          )
        : !hasRequiredMissing(connection.prerequisites);
      return {
        healthy,
        status:
          healthy && connection.status === 'ready'
            ? 'ready'
            : connection.status,
        prerequisites: connection.prerequisites,
      };
    }

    return {
      healthy: !hasRequiredMissing(connection.prerequisites),
      status: connection.status,
      prerequisites: connection.prerequisites,
    };
  }

  private async collectModelPrerequisites(
    connection: ProviderConnectionConfig,
  ): Promise<Prerequisite[]> {
    const providers = [
      createLLMProvider(connection),
      createEmbeddingProvider(connection),
      createVectorDbProvider(connection),
    ].filter(Boolean);

    const prerequisiteSets = await Promise.all(
      providers.map(async (provider) => {
        if (
          provider &&
          'getPrerequisites' in provider &&
          typeof provider.getPrerequisites === 'function'
        ) {
          return (await provider.getPrerequisites()) ?? [];
        }
        return [];
      }),
    );

    const deduped = new Map<string, Prerequisite>();
    for (const prerequisites of prerequisiteSets) {
      for (const prerequisite of prerequisites) {
        deduped.set(prerequisite.id, prerequisite);
      }
    }
    return [...deduped.values()];
  }
}
