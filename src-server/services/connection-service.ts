import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  AppConfig,
  ConnectionCapability,
  ConnectionConfig,
  ConnectionStatus,
  Prerequisite,
  ProviderConnectionConfig,
  RuntimeConnectionSettings,
} from '@stallion-ai/shared';
import type { ProviderAdapterShape } from '../providers/adapter-shape.js';
import {
  createEmbeddingProvider,
  createLLMProvider,
  createVectorDbProvider,
} from '../providers/connection-factories.js';
import { configOps } from '../telemetry/metrics.js';
import type { ProviderService } from './provider-service.js';

type ACPConnectionConfig = {
  id: string;
  name?: string;
  enabled?: boolean;
};

type ACPConnectionStatus = {
  id: string;
  status?: string;
};

const MODEL_CAPABILITY_SET = new Set<ConnectionCapability>([
  'llm',
  'embedding',
]);

const RUNTIME_CAPABILITY_MAP: Record<ProviderKind, ConnectionCapability[]> = {
  bedrock: ['agent-runtime', 'session-lifecycle', 'tool-calls', 'interrupt'],
  claude: [
    'agent-runtime',
    'session-lifecycle',
    'tool-calls',
    'interrupt',
    'approvals',
    'reasoning-events',
  ],
  codex: [
    'agent-runtime',
    'session-lifecycle',
    'tool-calls',
    'interrupt',
    'approvals',
    'resume',
    'external-process',
  ],
};

function hasRequiredMissing(prerequisites: Prerequisite[]): boolean {
  return prerequisites.some(
    (prerequisite) =>
      prerequisite.category === 'required' &&
      prerequisite.status !== 'installed',
  );
}

function statusFromPrerequisites(
  enabled: boolean,
  prerequisites: Prerequisite[],
): ConnectionStatus {
  if (!enabled) return 'disabled';
  if (hasRequiredMissing(prerequisites)) return 'missing_prerequisites';
  return 'ready';
}

function toModelConnection(
  connection: ProviderConnectionConfig,
  prerequisites: Prerequisite[],
): ConnectionConfig {
  const capabilities = connection.capabilities.filter((capability) =>
    MODEL_CAPABILITY_SET.has(capability as ConnectionCapability),
  ) as ConnectionCapability[];
  return {
    id: connection.id,
    kind: 'model',
    type: connection.type,
    name: connection.name,
    enabled: connection.enabled,
    capabilities,
    config: connection.config,
    description: connection.type,
    prerequisites,
    status: statusFromPrerequisites(connection.enabled, prerequisites),
    lastCheckedAt: null,
  };
}

function runtimeIdForProvider(provider: ProviderKind): string {
  return `${provider}-runtime`;
}

function runtimeNameForProvider(provider: ProviderKind): string {
  if (provider === 'bedrock') return 'Bedrock Runtime';
  if (provider === 'claude') return 'Claude Runtime';
  return 'Codex Runtime';
}

function runtimeDescriptionForProvider(provider: ProviderKind): string {
  if (provider === 'bedrock') {
    return 'Built-in Stallion runtime backed by VoltAgent/Strands.';
  }
  if (provider === 'claude') {
    return 'Claude Agent SDK runtime with approvals and reasoning events.';
  }
  return 'Codex app-server runtime over the local Codex CLI.';
}

function runtimeSettingsFor(
  appConfig: AppConfig,
  id: string,
): RuntimeConnectionSettings {
  return appConfig.runtimeConnections?.[id] ?? {};
}

function runtimeDefaultConfig(
  id: string,
  appConfig: AppConfig,
): Record<string, unknown> {
  if (id === 'acp') return {};
  return {
    defaultModel: appConfig.defaultModel,
  };
}

function sanitizeRuntimeConfig(
  id: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (id === 'acp') return {};
  const defaultModel = config.defaultModel;
  return typeof defaultModel === 'string' && defaultModel.trim().length > 0
    ? { defaultModel: defaultModel.trim() }
    : {};
}

function mergeRuntimeConfig(
  id: string,
  appConfig: AppConfig,
  overrides: RuntimeConnectionSettings,
): Record<string, unknown> {
  return {
    ...runtimeDefaultConfig(id, appConfig),
    ...sanitizeRuntimeConfig(id, overrides.config ?? {}),
  };
}

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
      connections.map(async (connection) =>
        toModelConnection(
          connection,
          await this.collectModelPrerequisites(connection),
        ),
      ),
    );
  }

  async listRuntimeConnections(): Promise<ConnectionConfig[]> {
    const appConfig = await this.getAppConfig();
    const runtimeConnections: ConnectionConfig[] = await Promise.all(
      this.getProviderAdapters().map(async (adapter) => {
        const prerequisites = (await adapter.getPrerequisites?.()) ?? [];
        const id = runtimeIdForProvider(adapter.provider);
        const settings = runtimeSettingsFor(appConfig, id);
        const enabled = settings.enabled ?? true;
        return {
          id,
          kind: 'runtime',
          type: runtimeIdForProvider(adapter.provider),
          name:
            settings.name?.trim() || runtimeNameForProvider(adapter.provider),
          enabled,
          description: runtimeDescriptionForProvider(adapter.provider),
          capabilities: RUNTIME_CAPABILITY_MAP[adapter.provider],
          config: mergeRuntimeConfig(id, appConfig, settings),
          prerequisites,
          status: statusFromPrerequisites(enabled, prerequisites),
          lastCheckedAt: null,
        } satisfies ConnectionConfig;
      }),
    );

    const acpConnections = await this.getACPConnections();
    const acpStatus = this.getACPStatus();
    const configuredCount = acpConnections.filter(
      (connection) => connection.enabled !== false,
    ).length;
    const connectedCount = (acpStatus.connections ?? []).filter(
      (connection) => connection.status === 'available',
    ).length;
    const acpPrerequisites: Prerequisite[] = [
      {
        id: 'acp-connections',
        name: 'ACP connections',
        description: 'Configure at least one ACP connection to use ACP agents.',
        status: configuredCount > 0 ? 'installed' : 'missing',
        category: 'optional',
      },
    ];
    const acpSettings = runtimeSettingsFor(appConfig, 'acp');
    const acpEnabled = acpSettings.enabled ?? true;
    runtimeConnections.push({
      id: 'acp',
      kind: 'runtime',
      type: 'acp',
      name: acpSettings.name?.trim() || 'ACP',
      enabled: acpEnabled,
      description: 'External agent runtime connections managed through ACP.',
      capabilities: [
        'agent-runtime',
        'session-lifecycle',
        'tool-calls',
        'interrupt',
        'approvals',
        'acp',
      ],
      config: {
        configuredCount,
        connectedCount,
      },
      prerequisites: acpPrerequisites,
      status: acpEnabled
        ? configuredCount > 0
          ? 'ready'
          : 'degraded'
        : 'disabled',
      lastCheckedAt: null,
    });

    return runtimeConnections;
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
