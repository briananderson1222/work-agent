import type { AgentExecutionConfig } from '@stallion-ai/contracts/agent';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  ConnectionConfig,
  ConnectionStatus,
  ModelOption,
  RuntimeCatalogSource,
  RuntimeConnectionView,
} from '@stallion-ai/contracts/tool';

export function connectionTypeLabel(type: string): string {
  switch (type) {
    case 'bedrock':
      return 'Amazon Bedrock';
    case 'ollama':
      return 'Ollama';
    case 'openai-compat':
      return 'OpenAI-Compatible';
    case 'bedrock-runtime':
      return 'Managed';
    case 'claude-runtime':
      return 'Claude Code';
    case 'codex-runtime':
      return 'Codex';
    case 'ollama-runtime':
      return 'Ollama';
    case 'acp':
      return 'ACP';
    default:
      return type;
  }
}

export function connectionStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'degraded':
      return 'Degraded';
    case 'missing_prerequisites':
      return 'Setup required';
    case 'disabled':
      return 'Disabled';
    case 'error':
      return 'Error';
    case 'awaiting-approval':
      return 'Awaiting approval';
    default:
      return (
        status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
      );
  }
}

export function prerequisiteStatusLabel(status: string): string {
  switch (status) {
    case 'installed':
      return 'Installed';
    case 'missing':
      return 'Not found';
    case 'warning':
      return 'Check required';
    default:
      return status;
  }
}

export function prerequisiteCategoryLabel(category: string): string {
  switch (category) {
    case 'required':
      return 'Required';
    case 'optional':
      return 'Optional';
    default:
      return category;
  }
}

export function capabilityLabel(capability: string): string {
  const map: Record<string, string> = {
    llm: 'Language model',
    embedding: 'Embeddings',
    'agent-runtime': 'Agent runtime',
    'session-lifecycle': 'Session lifecycle',
    'tool-calls': 'Tool calls',
    interrupt: 'Interrupt',
    approvals: 'Approvals',
    resume: 'Resume',
    'reasoning-events': 'Reasoning',
    'external-process': 'External process',
    acp: 'ACP',
    vectordb: 'Vector database',
  };
  return map[capability] ?? capability.replace(/-/g, ' ');
}

type AgentWithExecution = {
  slug?: string;
  name?: string;
  description?: string;
  execution?: AgentExecutionConfig;
  model?: string;
  toolsConfig?: {
    mcpServers?: string[];
  };
};

type ChatBindingState = {
  executionMode?: 'runtime' | 'provider-managed';
  runtimeConnectionId?: string | null;
  provider?: ProviderKind | null;
  providerId?: string | null;
  orchestrationProvider?: ProviderKind | null;
  model?: string | null;
};

export type SharedCapability =
  | 'system_prompt'
  | 'mcp'
  | 'tool_execution'
  | 'model_catalog'
  | 'model_selection';

export type EffectiveCapabilityState = Record<SharedCapability, boolean>;

export type BindingReadiness = 'ready' | 'degraded' | 'needs_configuration';

export type BindingStatus = {
  catalogSource: RuntimeCatalogSource;
  catalogReason?: string | null;
  bindingReadiness: BindingReadiness;
  capabilityState: EffectiveCapabilityState;
  visibleModels: ModelOption[];
};

export type ChatExecutionMetadata = {
  executionMode: 'runtime' | 'provider-managed';
  executionScope?: 'project' | 'global';
  runtimeConnectionId?: string;
  provider?: ProviderKind;
  providerId?: string;
  model?: string;
  providerOptions: Record<string, unknown>;
};

export type RuntimeExecutionClass = 'managed' | 'connected' | 'external';

function asModelOptions(value: unknown): ModelOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: entry.id,
        name: entry.name,
        originalId:
          typeof entry.originalId === 'string' ? entry.originalId : entry.id,
      },
    ];
  });
}

export function runtimeCatalogVisibleModels(
  runtimeConnection?: RuntimeConnectionView | ConnectionConfig | null,
): ModelOption[] {
  const runtimeCatalog = (runtimeConnection as RuntimeConnectionView | null)
    ?.runtimeCatalog;
  if (!runtimeCatalog) {
    return [];
  }
  if (runtimeCatalog.models.length > 0) {
    return runtimeCatalog.models;
  }
  if (runtimeCatalog.fallbackModels.length > 0) {
    return runtimeCatalog.fallbackModels;
  }
  return [];
}

function runtimeExecutionClass(
  runtimeConnection?: RuntimeConnectionView | ConnectionConfig | null,
): RuntimeExecutionClass | undefined {
  const executionClass = runtimeConnection?.config.executionClass;
  if (
    executionClass === 'managed' ||
    executionClass === 'connected' ||
    executionClass === 'external'
  ) {
    return executionClass;
  }
  if (runtimeConnection?.id === 'acp' || runtimeConnection?.type === 'acp') {
    return 'external';
  }
  return undefined;
}

export function runtimeCatalogSourceLabel(
  source: RuntimeCatalogSource,
): string {
  switch (source) {
    case 'live':
      return 'Live';
    case 'cached':
      return 'Cached';
    case 'fallback':
      return 'Fallback';
    case 'none':
      return 'None';
    default:
      return source;
  }
}

function bindingReadinessForConnection(
  runtimeConnection?: RuntimeConnectionView | ConnectionConfig | null,
): BindingReadiness {
  if (!runtimeConnection) {
    return 'needs_configuration';
  }
  if (
    runtimeConnection.status === 'missing_prerequisites' ||
    runtimeConnection.status === 'disabled' ||
    runtimeConnection.status === 'error'
  ) {
    return 'needs_configuration';
  }
  if (runtimeConnection.status === 'degraded') {
    return 'degraded';
  }
  return 'ready';
}

export function supportsProviderManagedBinding(
  agent: AgentWithExecution | null | undefined,
): boolean {
  if (!agent) return false;
  return !agent.toolsConfig?.mcpServers?.length;
}

export function resolveBindingStatus({
  agent,
  chatState,
  runtimeConnection,
  globalModels = [],
}: {
  agent:
    | (AgentWithExecution & { modelOptions?: Array<unknown> | null })
    | null
    | undefined;
  chatState?: ChatBindingState | null;
  runtimeConnection?: RuntimeConnectionView | ConnectionConfig | null;
  globalModels?: ModelOption[];
}): BindingStatus {
  const runtimeConnectionId =
    chatState?.runtimeConnectionId ??
    agent?.execution?.runtimeConnectionId ??
    null;
  const activeProvider =
    chatState?.orchestrationProvider ??
    chatState?.provider ??
    runtimeConnectionIdToProviderKind(runtimeConnectionId);
  const executionClass = runtimeExecutionClass(runtimeConnection);
  const agentModels = asModelOptions(agent?.modelOptions);
  const runtimeModels = runtimeCatalogVisibleModels(runtimeConnection);
  const usesGlobalCatalog =
    chatState?.executionMode !== 'provider-managed' &&
    executionClass === 'managed';
  const visibleModels =
    agentModels.length > 0
      ? agentModels
      : runtimeModels.length > 0
        ? runtimeModels
        : usesGlobalCatalog
          ? globalModels
          : [];
  const runtimeCatalog = (runtimeConnection as RuntimeConnectionView | null)
    ?.runtimeCatalog;
  const catalogSource: RuntimeCatalogSource =
    runtimeCatalog?.source ??
    (visibleModels.length > 0 && usesGlobalCatalog ? 'live' : 'none');
  const capabilityState: EffectiveCapabilityState =
    chatState?.executionMode === 'provider-managed'
      ? {
          system_prompt: true,
          mcp: false,
          tool_execution: false,
          model_catalog: false,
          model_selection: false,
        }
      : executionClass === 'managed'
        ? {
            system_prompt: !!agent,
            mcp: !!agent?.toolsConfig?.mcpServers?.length,
            tool_execution: !!agent?.toolsConfig?.mcpServers?.length,
            model_catalog: visibleModels.length > 0,
            model_selection: visibleModels.length > 0,
          }
        : {
            system_prompt: !!agent || !!activeProvider,
            mcp: false,
            tool_execution: false,
            model_catalog: visibleModels.length > 0,
            model_selection: visibleModels.length > 0,
          };

  return {
    catalogSource,
    catalogReason: runtimeCatalog?.reason ?? null,
    bindingReadiness:
      chatState?.executionMode === 'provider-managed'
        ? 'ready'
        : bindingReadinessForConnection(runtimeConnection),
    capabilityState,
    visibleModels,
  };
}

export function bindingHasModelCatalog({
  agent,
  chatState,
  globalModelCount,
}: {
  agent:
    | (AgentWithExecution & { modelOptions?: Array<unknown> | null })
    | null
    | undefined;
  chatState?: ChatBindingState | null;
  globalModelCount: number;
}): boolean {
  return resolveBindingStatus({
    agent,
    chatState,
    globalModels: Array.from({ length: globalModelCount }, (_, index) => ({
      id: `model-${index}`,
      name: `model-${index}`,
      originalId: `model-${index}`,
    })),
  }).capabilityState.model_catalog;
}

export function bindingUsesGlobalModelCatalog({
  agent,
  chatState,
}: {
  agent: AgentWithExecution | null | undefined;
  chatState?: ChatBindingState | null;
}): boolean {
  return (
    resolveBindingStatus({
      agent,
      chatState,
      globalModels: [{ id: 'global', name: 'Global', originalId: 'global' }],
    }).catalogSource === 'live' && !((agent?.modelOptions?.length ?? 0) > 0)
  );
}

export function resolveEffectiveCapabilityState({
  agent,
  chatState,
  hasModelCatalog,
  runtimeConnection,
}: {
  agent: AgentWithExecution | null | undefined;
  chatState?: ChatBindingState | null;
  hasModelCatalog: boolean;
  runtimeConnection?: RuntimeConnectionView | ConnectionConfig | null;
}): EffectiveCapabilityState {
  return resolveBindingStatus({
    agent,
    chatState,
    runtimeConnection,
    globalModels: hasModelCatalog
      ? [{ id: 'catalog', name: 'Catalog', originalId: 'catalog' }]
      : [],
  }).capabilityState;
}

type SessionExecutionSummary = {
  provider?: ProviderKind | null;
  model?: string | null;
  status?: string | null;
  orchestrationProvider?: ProviderKind | null;
  orchestrationModel?: string | null;
  orchestrationStatus?: string | null;
};

type SessionExecutionActivity = SessionExecutionSummary & {
  status?: string | null;
};

export function runtimeConnectionIdToProviderKind(
  runtimeConnectionId?: string | null,
): ProviderKind | undefined {
  if (!runtimeConnectionId || runtimeConnectionId === 'acp') {
    return undefined;
  }
  if (runtimeConnectionId === 'claude-runtime') return 'claude';
  if (runtimeConnectionId === 'codex-runtime') return 'codex';
  if (runtimeConnectionId === 'bedrock-runtime') return 'bedrock';
  if (runtimeConnectionId.endsWith('-runtime')) {
    return runtimeConnectionId.slice(0, -'-runtime'.length);
  }
  return undefined;
}

export function isManagedRuntimeConnectionId(
  runtimeConnectionId?: string | null,
  runtimeConnections: ConnectionConfig[] = [],
): boolean {
  if (!runtimeConnectionId) {
    return false;
  }
  return (
    runtimeExecutionClass(
      runtimeConnections.find(
        (connection) => connection.id === runtimeConnectionId,
      ),
    ) === 'managed'
  );
}

export function defaultManagedRuntimeConnection(
  runtimeConnections: ConnectionConfig[],
): ConnectionConfig | null {
  return (
    runtimeConnections.find(
      (connection) =>
        connection.kind === 'runtime' &&
        connection.enabled &&
        connection.type !== 'acp' &&
        connection.capabilities.includes('agent-runtime') &&
        runtimeExecutionClass(connection) === 'managed',
    ) ?? null
  );
}

export function preferredConnectedRuntime(
  runtimeConnections: ConnectionConfig[],
): ConnectionConfig | null {
  const connected = runtimeConnections.filter(
    (connection) =>
      connection.kind === 'runtime' &&
      connection.enabled &&
      connection.capabilities.includes('agent-runtime') &&
      runtimeExecutionClass(connection) === 'connected',
  );
  const preferredIds = ['claude-runtime', 'codex-runtime'];
  for (const id of preferredIds) {
    const match = connected.find((connection) => connection.id === id);
    if (match) return match;
  }
  return connected[0] ?? null;
}

export function runtimeConnectionLabel(
  runtimeConnectionId?: string | null,
): string {
  switch (runtimeConnectionId) {
    case 'bedrock-runtime':
      return 'Managed Runtime';
    case 'claude-runtime':
      return 'Claude Code';
    case 'codex-runtime':
      return 'Codex';
    case 'ollama-runtime':
      return 'Ollama';
    case 'acp':
      return 'ACP';
    default:
      return connectionTypeLabel(runtimeConnectionId ?? '');
  }
}

export function providerLabel(provider?: ProviderKind | null): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  if (provider === 'bedrock') return 'Bedrock';
  return '';
}

export function executionStatusLabel(status?: string | null): string {
  if (!status) return 'Not started';
  return connectionStatusLabel(status);
}

export function buildProviderOptions(
  runtimeConnectionId?: string | null,
  runtimeOptions?: Record<string, unknown>,
): Record<string, unknown> {
  if (runtimeConnectionId === 'claude-runtime') {
    return {
      thinking: runtimeOptions?.thinking ?? true,
      effort: runtimeOptions?.effort ?? 'medium',
    };
  }
  if (runtimeConnectionId === 'codex-runtime') {
    return {
      reasoningEffort: runtimeOptions?.reasoningEffort ?? 'medium',
      fastMode: runtimeOptions?.fastMode === true,
    };
  }
  return {};
}

export function resolveAgentExecution(
  agent: AgentWithExecution,
): ChatExecutionMetadata {
  const runtimeConnectionId = agent.execution?.runtimeConnectionId || undefined;
  const runtimeOptions = agent.execution?.runtimeOptions ?? {};
  if (runtimeOptions.executionMode === 'provider-managed') {
    return {
      executionMode: 'provider-managed',
      executionScope:
        runtimeOptions.executionScope === 'project' ||
        runtimeOptions.executionScope === 'global'
          ? runtimeOptions.executionScope
          : undefined,
      runtimeConnectionId,
      provider:
        typeof runtimeOptions.providerKind === 'string'
          ? runtimeOptions.providerKind
          : undefined,
      providerId:
        typeof runtimeOptions.providerId === 'string'
          ? runtimeOptions.providerId
          : undefined,
      model:
        typeof runtimeOptions.displayModel === 'string'
          ? runtimeOptions.displayModel
          : agent.execution?.modelId || agent.model || undefined,
      providerOptions: {},
    };
  }
  return {
    executionMode: 'runtime',
    runtimeConnectionId,
    provider: runtimeConnectionIdToProviderKind(runtimeConnectionId),
    model: agent.execution?.modelId || agent.model || undefined,
    providerOptions: buildProviderOptions(
      runtimeConnectionId,
      agent.execution?.runtimeOptions,
    ),
  };
}

export function isRuntimeConnectionSelectable(
  connection?: ConnectionConfig | null,
): boolean {
  if (!connection) return false;
  return (
    connection.kind === 'runtime' &&
    connection.enabled &&
    connection.capabilities.includes('agent-runtime') &&
    connection.status === 'ready'
  );
}

export function agentRuntimeStatus(
  agent: AgentWithExecution,
  runtimeConnections: ConnectionConfig[],
): ConnectionStatus | 'missing' {
  const runtimeConnectionId = agent.execution?.runtimeConnectionId;
  if (!runtimeConnectionId) return 'missing';
  const connection = runtimeConnections.find(
    (candidate) => candidate.id === runtimeConnectionId,
  );
  if (!connection) return 'missing';
  return connection.status;
}

export function canAgentStartChat(
  agent: AgentWithExecution,
  runtimeConnections: ConnectionConfig[],
): boolean {
  const runtimeConnectionId = agent.execution?.runtimeConnectionId;
  if (!runtimeConnectionId) return false;
  const connection = runtimeConnections.find(
    (candidate) => candidate.id === runtimeConnectionId,
  );
  return isRuntimeConnectionSelectable(connection);
}

export function resolveProjectProviderManagedExecution(
  project:
    | {
        defaultProviderId?: string | null;
        defaultModel?: string | null;
      }
    | null
    | undefined,
  modelConnections: ConnectionConfig[],
): ChatExecutionMetadata | null {
  return resolveProviderManagedExecution(
    {
      defaultProviderId: project?.defaultProviderId,
      defaultModel: project?.defaultModel,
      executionScope: 'project',
      allowSingleProviderFallback: false,
    },
    modelConnections,
  );
}

export function resolveGlobalProviderManagedExecution(
  appConfig:
    | {
        defaultLLMProvider?: string | null;
        defaultModel?: string | null;
      }
    | null
    | undefined,
  modelConnections: ConnectionConfig[],
): ChatExecutionMetadata | null {
  return resolveProviderManagedExecution(
    {
      defaultProviderId: appConfig?.defaultLLMProvider,
      defaultModel: appConfig?.defaultModel,
      executionScope: 'global',
      allowSingleProviderFallback: true,
    },
    modelConnections,
  );
}

function resolveProviderManagedExecution(
  target: {
    defaultProviderId?: string | null;
    defaultModel?: string | null;
    executionScope?: 'project' | 'global';
    allowSingleProviderFallback: boolean;
  },
  modelConnections: ConnectionConfig[],
): ChatExecutionMetadata | null {
  const enabledLlmConnections = modelConnections.filter(
    (connection) =>
      connection.kind === 'model' &&
      connection.enabled &&
      connection.status === 'ready' &&
      connection.capabilities.includes('llm'),
  );
  const explicitProviderConnection = target.defaultProviderId
    ? enabledLlmConnections.find(
        (connection) => connection.id === target.defaultProviderId,
      )
    : undefined;
  const providerConnection =
    explicitProviderConnection ??
    (target.allowSingleProviderFallback && enabledLlmConnections.length === 1
      ? enabledLlmConnections[0]
      : null);
  if (!providerConnection) {
    return null;
  }
  const providerDefaultModel =
    typeof providerConnection.config.defaultModel === 'string'
      ? providerConnection.config.defaultModel
      : null;
  const providerModelOptions = Array.isArray(
    providerConnection.config.modelOptions,
  )
    ? (providerConnection.config.modelOptions as Array<{ id: string }>)
    : [];
  const targetModelIsSupported =
    !!target.defaultModel &&
    (providerModelOptions.length === 0 ||
      providerModelOptions.some((model) => model.id === target.defaultModel));
  const resolvedModel = targetModelIsSupported
    ? target.defaultModel
    : (providerDefaultModel ?? providerModelOptions[0]?.id ?? null);
  if (!resolvedModel) {
    return null;
  }
  return {
    executionMode: 'provider-managed',
    executionScope: target.executionScope,
    provider: providerConnection.type,
    providerId: providerConnection.id,
    model: resolvedModel,
    providerOptions: {},
  };
}

export function buildRuntimeChatAgent(
  connection: RuntimeConnectionView,
): AgentWithExecution & {
  slug: string;
  name: string;
  description: string;
  source: 'local';
} {
  return {
    slug: `__runtime:${connection.id}`,
    name: connection.name,
    description:
      connection.description ||
      `Direct chat using ${connection.name} with project working directory context when available.`,
    source: 'local',
    execution: {
      runtimeConnectionId: connection.id,
      modelId:
        typeof connection.config.defaultModel === 'string'
          ? connection.config.defaultModel
          : null,
    },
    modelOptions: runtimeCatalogVisibleModels(connection),
  };
}

export function preferredChatRuntime(
  runtimeConnections: ConnectionConfig[],
): ConnectionConfig | null {
  const ready = runtimeConnections.filter(isRuntimeConnectionSelectable);
  const connected = ready.filter(
    (connection) => runtimeExecutionClass(connection) === 'connected',
  );
  const managed = ready.filter(
    (connection) => runtimeExecutionClass(connection) === 'managed',
  );
  const preferredIds = ['claude-runtime', 'codex-runtime'];
  for (const id of preferredIds) {
    const match = connected.find((connection) => connection.id === id);
    if (match) return match;
  }
  return connected[0] ?? managed[0] ?? ready[0] ?? null;
}

export function resolveSessionExecutionSummary(
  session?: SessionExecutionSummary | null,
): {
  provider?: ProviderKind;
  model?: string;
  status?: string;
} {
  if (!session) return {};
  return {
    provider: session.orchestrationProvider ?? session.provider ?? undefined,
    model: session.orchestrationModel ?? session.model ?? undefined,
    status: session.orchestrationStatus ?? session.status ?? undefined,
  };
}

export function isSessionExecutionActive(
  session?: SessionExecutionActivity | null,
): boolean {
  if (!session) return false;
  if (session.orchestrationStatus) {
    return (
      session.orchestrationStatus === 'running' ||
      session.orchestrationStatus === 'awaiting-approval'
    );
  }
  return session.status === 'sending';
}

export function formatExecutionSummary(agent: AgentWithExecution): string {
  const runtime = runtimeConnectionLabel(agent.execution?.runtimeConnectionId);
  const model = agent.execution?.modelId || agent.model;
  return model ? `${runtime} · ${model}` : runtime;
}
