import type { AgentExecutionConfig } from '@stallion-ai/contracts/agent';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  ConnectionConfig,
  ConnectionStatus,
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
      return 'Bedrock';
    case 'claude-runtime':
      return 'Claude';
    case 'codex-runtime':
      return 'Codex';
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
): boolean {
  return runtimeConnectionId === 'bedrock-runtime';
}

export function preferredConnectedRuntime(
  runtimeConnections: ConnectionConfig[],
): ConnectionConfig | null {
  const connected = runtimeConnections.filter(
    (connection) =>
      connection.kind === 'runtime' &&
      connection.enabled &&
      connection.type !== 'acp' &&
      !isManagedRuntimeConnectionId(connection.id) &&
      connection.capabilities.includes('agent-runtime'),
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
      return 'Bedrock Runtime';
    case 'claude-runtime':
      return 'Claude Runtime';
    case 'codex-runtime':
      return 'Codex Runtime';
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
  const runtimeConnectionId =
    agent.execution?.runtimeConnectionId || 'bedrock-runtime';
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
    provider:
      runtimeConnectionIdToProviderKind(runtimeConnectionId) ?? 'bedrock',
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
  const runtimeConnectionId =
    agent.execution?.runtimeConnectionId || 'bedrock-runtime';
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
  const runtimeConnectionId =
    agent.execution?.runtimeConnectionId || 'bedrock-runtime';
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
  if (!target.defaultModel) {
    return null;
  }
  const enabledLlmConnections = modelConnections.filter(
    (connection) =>
      connection.kind === 'model' &&
      connection.enabled &&
      connection.capabilities.includes('llm') &&
      connection.type !== 'bedrock',
  );
  const providerConnection =
    (target.defaultProviderId
      ? enabledLlmConnections.find(
          (connection) => connection.id === target.defaultProviderId,
        )
      : undefined) ??
    (target.allowSingleProviderFallback && enabledLlmConnections.length === 1
      ? enabledLlmConnections[0]
      : null);
  if (!providerConnection) {
    return null;
  }
  return {
    executionMode: 'provider-managed',
    executionScope: target.executionScope,
    provider: providerConnection.type,
    providerId: providerConnection.id,
    model: target.defaultModel,
    providerOptions: {},
  };
}

export function buildRuntimeChatAgent(
  connection: ConnectionConfig,
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
  };
}

export function preferredChatRuntime(
  runtimeConnections: ConnectionConfig[],
): ConnectionConfig | null {
  const ready = runtimeConnections.filter(isRuntimeConnectionSelectable);
  const preferredIds = ['claude-runtime', 'codex-runtime', 'bedrock-runtime'];
  for (const id of preferredIds) {
    const match = ready.find((connection) => connection.id === id);
    if (match) return match;
  }
  return ready[0] ?? null;
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
