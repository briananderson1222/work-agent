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
  ModelOption,
  Prerequisite,
  ProviderConnectionConfig,
  RuntimeCatalogStatus,
  RuntimeConnectionSettings,
  RuntimeConnectionView,
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

function runtimeModelOptionsForAdapter(
  adapter: ProviderAdapterShape,
): ModelOption[] | undefined {
  switch (adapter.provider) {
    case 'claude':
      return [
        {
          id: 'claude-sonnet-4-6',
          name: 'Claude Sonnet 4.6',
          originalId: 'claude-sonnet-4-6',
        },
        {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
          originalId: 'claude-opus-4-6',
        },
      ];
    case 'codex':
      return [
        {
          id: 'gpt-5.3-codex',
          name: 'GPT-5.3 Codex',
          originalId: 'gpt-5.3-codex',
        },
        {
          id: 'gpt-5.3-codex-spark',
          name: 'GPT-5.3 Codex Spark',
          originalId: 'gpt-5.3-codex-spark',
        },
      ];
    default:
      return undefined;
  }
}

function normalizeModelOptions(value: unknown): ModelOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        name: item.name,
        originalId:
          typeof item.originalId === 'string' ? item.originalId : item.id,
      },
    ];
  });
}

function buildRuntimeCatalogStatus({
  adapter,
  settings,
  liveModelOptions,
}: {
  adapter: ProviderAdapterShape;
  settings: RuntimeConnectionSettings;
  liveModelOptions?: ModelOption[];
}): RuntimeCatalogStatus | undefined {
  const fallbackModels = runtimeModelOptionsForAdapter(adapter) ?? [];
  const config = settings.config ?? {};
  const cachedModels = normalizeModelOptions(
    (config as Record<string, unknown>).cachedModelOptions,
  );
  const cachedFallbackModels = normalizeModelOptions(
    (config as Record<string, unknown>).cachedFallbackModelOptions,
  );
  const cachedFetchedAt =
    typeof (config as Record<string, unknown>).cachedCatalogFetchedAt ===
    'string'
      ? ((config as Record<string, unknown>).cachedCatalogFetchedAt as string)
      : null;
  const cachedReason =
    typeof (config as Record<string, unknown>).cachedCatalogReason === 'string'
      ? ((config as Record<string, unknown>).cachedCatalogReason as string)
      : null;

  if (liveModelOptions && liveModelOptions.length > 0) {
    return {
      source: 'live',
      fetchedAt: new Date().toISOString(),
      reason: null,
      models: liveModelOptions,
      fallbackModels,
    };
  }

  if (cachedModels.length > 0 || cachedFallbackModels.length > 0) {
    return {
      source: 'cached',
      fetchedAt: cachedFetchedAt,
      reason:
        cachedReason ??
        'Using the most recent cached runtime catalog while live discovery is unavailable.',
      models: cachedModels,
      fallbackModels:
        cachedFallbackModels.length > 0 ? cachedFallbackModels : fallbackModels,
    };
  }

  if (fallbackModels.length > 0) {
    return {
      source: 'fallback',
      fetchedAt: null,
      reason: adapter.listModels
        ? 'Live runtime catalog is unavailable, so Stallion is showing built-in fallback models.'
        : 'This runtime uses built-in fallback models because it does not expose a live catalog.',
      models: [],
      fallbackModels,
    };
  }

  return {
    source: 'none',
    fetchedAt: null,
    reason: 'No runtime model catalog is available for this connection.',
    models: [],
    fallbackModels: [],
  };
}

export async function listRuntimeConnectionsForAdapters(options: {
  adapters: ProviderAdapterShape[];
  appConfig: AppConfig;
  acpConnections: ACPConnectionConfig[];
  acpStatus: { connections?: ACPConnectionStatus[] };
}): Promise<RuntimeConnectionView[]> {
  const runtimeConnections: RuntimeConnectionView[] = await Promise.all(
    options.adapters.map(async (adapter) => {
      const prerequisites = (await adapter.getPrerequisites?.()) ?? [];
      const id = runtimeIdForAdapter(adapter);
      const settings = runtimeSettingsFor(options.appConfig, id);
      const enabled = settings.enabled ?? true;
      const liveModelOptions = await adapter
        .listModels?.()
        .catch(() => undefined);
      const runtimeCatalog = buildRuntimeCatalogStatus({
        adapter,
        settings,
        liveModelOptions,
      });
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
        runtimeCatalog,
        prerequisites,
        status: statusFromPrerequisites(enabled, prerequisites),
        lastCheckedAt: null,
      } satisfies RuntimeConnectionView;
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
