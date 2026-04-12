import type {
  ACPConnectionConfig,
  ACPStatusValue,
} from '@stallion-ai/contracts/acp';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  ConnectionCapability,
  ConnectionConfig,
  ConnectionStatus,
  Prerequisite,
  ProviderConnectionConfig,
  RuntimeConnectionSettings,
} from '@stallion-ai/contracts/tool';
import type { ProviderAdapterShape } from '../providers/adapter-shape.js';

export type ACPConnectionStatus = {
  id: string;
  status?: ACPStatusValue;
};

export const MODEL_CAPABILITY_SET = new Set<ConnectionCapability>([
  'llm',
  'embedding',
  'vectordb',
]);

export function hasRequiredMissing(prerequisites: Prerequisite[]): boolean {
  return prerequisites.some(
    (prerequisite) =>
      prerequisite.category === 'required' &&
      prerequisite.status !== 'installed',
  );
}

export function statusFromPrerequisites(
  enabled: boolean,
  prerequisites: Prerequisite[],
): ConnectionStatus {
  if (!enabled) {
    return 'disabled';
  }
  if (hasRequiredMissing(prerequisites)) {
    return 'missing_prerequisites';
  }
  return 'ready';
}

export function toModelConnection(
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

export function runtimeIdForProvider(provider: ProviderKind): string {
  return `${provider}-runtime`;
}

export function runtimeIdForAdapter(adapter: ProviderAdapterShape): string {
  return adapter.metadata.runtimeId ?? runtimeIdForProvider(adapter.provider);
}

export function providerLabelForAdapter(adapter: ProviderAdapterShape): string {
  return adapter.metadata.displayName.replace(/\s+Runtime$/, '');
}

export function runtimeSettingsFor(
  appConfig: AppConfig,
  id: string,
): RuntimeConnectionSettings {
  return appConfig.runtimeConnections?.[id] ?? {};
}

export function runtimeDefaultConfig(
  id: string,
  appConfig: AppConfig,
): Record<string, unknown> {
  if (id === 'acp') {
    return {};
  }
  return {
    defaultModel: appConfig.defaultModel,
  };
}

export function sanitizeRuntimeConfig(
  id: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (id === 'acp') {
    return {};
  }
  const defaultModel = config.defaultModel;
  return typeof defaultModel === 'string' && defaultModel.trim().length > 0
    ? { defaultModel: defaultModel.trim() }
    : {};
}

export function mergeRuntimeConfig(
  id: string,
  appConfig: AppConfig,
  overrides: RuntimeConnectionSettings,
): Record<string, unknown> {
  return {
    ...runtimeDefaultConfig(id, appConfig),
    ...sanitizeRuntimeConfig(id, overrides.config ?? {}),
  };
}

export async function listRuntimeConnectionsForAdapters(options: {
  adapters: ProviderAdapterShape[];
  appConfig: AppConfig;
  acpConnections: ACPConnectionConfig[];
  acpStatus: { connections?: ACPConnectionStatus[] };
}): Promise<ConnectionConfig[]> {
  const runtimeConnections: ConnectionConfig[] = await Promise.all(
    options.adapters.map(async (adapter) => {
      const prerequisites = (await adapter.getPrerequisites?.()) ?? [];
      const id = runtimeIdForAdapter(adapter);
      const settings = runtimeSettingsFor(options.appConfig, id);
      const enabled = settings.enabled ?? true;
      return {
        id,
        kind: 'runtime',
        type: id,
        name: settings.name?.trim() || adapter.metadata.displayName,
        enabled,
        description: adapter.metadata.description,
        capabilities: [...adapter.metadata.capabilities],
        config: {
          ...mergeRuntimeConfig(id, options.appConfig, settings),
          provider: adapter.provider,
          providerLabel: providerLabelForAdapter(adapter),
        },
        prerequisites,
        status: statusFromPrerequisites(enabled, prerequisites),
        lastCheckedAt: null,
      } satisfies ConnectionConfig;
    }),
  );

  const configuredCount = options.acpConnections.filter(
    (connection) => connection.enabled !== false,
  ).length;
  const connectedCount = (options.acpStatus.connections ?? []).filter(
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
  const acpSettings = runtimeSettingsFor(options.appConfig, 'acp');
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
