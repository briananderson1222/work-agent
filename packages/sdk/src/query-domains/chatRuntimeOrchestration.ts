import { useApiQuery, type QueryConfig } from '../query-core';
import { resolveApiBase } from '../query-core';
import { orchestrationQueries } from '../queryFactories';
import type {
  OrchestrationCommandInput,
  OrchestrationProviderKind,
  OrchestrationProviderSummary,
} from './chatRuntimeTypes';

export type {
  OrchestrationCommandInput,
  OrchestrationProviderKind,
  OrchestrationProviderSummary,
} from './chatRuntimeTypes';

export async function fetchOrchestrationProviders(
  apiBase?: string,
): Promise<OrchestrationProviderSummary[]> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/providers`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: OrchestrationProviderSummary[];
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data ?? [];
}

export async function dispatchOrchestrationCommand<T = unknown>(
  command: OrchestrationCommandInput,
  apiBase?: string,
): Promise<T> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/commands`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data as T;
}

export async function resolveOrchestrationRequest(input: {
  threadId: string;
  requestId: string;
  decision: 'accept' | 'acceptForSession' | 'decline';
  apiBase?: string;
}): Promise<void> {
  await dispatchOrchestrationCommand(
    {
      type: 'respondToRequest',
      threadId: input.threadId,
      requestId: input.requestId,
      decision: input.decision,
    },
    input.apiBase,
  );
}

export async function startOrchestrationSession(input: {
  threadId: string;
  provider: OrchestrationProviderKind;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
  cwd?: string;
  apiBase?: string;
}) {
  return dispatchOrchestrationCommand(
    {
      type: 'startSession',
      input: {
        threadId: input.threadId,
        provider: input.provider,
        modelId: input.modelId,
        modelOptions: input.modelOptions,
        cwd: input.cwd,
      },
    },
    input.apiBase,
  );
}

export async function sendOrchestrationTurn(input: {
  threadId: string;
  text: string;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
  apiBase?: string;
}) {
  return dispatchOrchestrationCommand(
    {
      type: 'sendTurn',
      input: {
        threadId: input.threadId,
        input: input.text,
        modelId: input.modelId,
        modelOptions: input.modelOptions,
      },
    },
    input.apiBase,
  );
}

export function useOrchestrationProvidersQuery(
  config?: QueryConfig<OrchestrationProviderSummary[]>,
) {
  return useApiQuery(
    orchestrationQueries.providers().queryKey,
    () => fetchOrchestrationProviders(),
    {
      staleTime:
        config?.staleTime ?? orchestrationQueries.providers().staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled,
    },
  );
}
