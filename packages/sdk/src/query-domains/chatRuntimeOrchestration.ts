import { type QueryConfig, resolveApiBase, useApiQuery } from '../query-core';
import { orchestrationQueries } from '../queryFactories';
import type {
  OrchestrationCommandInput,
  OrchestrationProviderKind,
  OrchestrationProviderSummary,
  OrchestrationSessionDetail,
  OrchestrationSessionSummary,
  TerminalProcessDetail,
  TerminalProcessSummary,
} from './chatRuntimeTypes';

export type {
  OrchestrationCommandInput,
  OrchestrationProviderKind,
  OrchestrationProviderSummary,
  OrchestrationSessionDetail,
  OrchestrationSessionSummary,
  TerminalProcessDetail,
  TerminalProcessSummary,
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

export async function fetchOrchestrationSessions(
  apiBase?: string,
): Promise<OrchestrationSessionSummary[]> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/sessions/read-model`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: OrchestrationSessionSummary[];
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data ?? [];
}

export async function fetchLoadedOrchestrationSessions(
  apiBase?: string,
): Promise<OrchestrationSessionSummary[]> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/sessions/loaded`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: OrchestrationSessionSummary[];
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data ?? [];
}

export async function fetchOrchestrationSession(
  threadId: string,
  apiBase?: string,
): Promise<OrchestrationSessionDetail> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/sessions/${encodeURIComponent(threadId)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: OrchestrationSessionDetail;
    error?: string;
  };
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data;
}

export async function fetchTerminalProcesses(
  apiBase?: string,
): Promise<TerminalProcessSummary[]> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/processes/terminals`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: TerminalProcessSummary[];
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data ?? [];
}

export async function fetchTerminalProcess(
  sessionId: string,
  apiBase?: string,
): Promise<TerminalProcessDetail> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/processes/terminals/${encodeURIComponent(sessionId)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: TerminalProcessDetail;
    error?: string;
  };
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.data;
}

export async function cleanupTerminalProcess(input: {
  sessionId: string;
  apiBase?: string;
}): Promise<void> {
  const resolvedApiBase = await resolveApiBase(input.apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/orchestration/processes/terminals/${encodeURIComponent(input.sessionId)}`,
    {
      method: 'DELETE',
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
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

export function useOrchestrationSessionsQuery(
  config?: QueryConfig<OrchestrationSessionSummary[]>,
) {
  return useApiQuery(
    orchestrationQueries.sessions().queryKey,
    () => fetchOrchestrationSessions(),
    {
      staleTime: config?.staleTime ?? orchestrationQueries.sessions().staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled,
    },
  );
}

export function useLoadedOrchestrationSessionsQuery(
  config?: QueryConfig<OrchestrationSessionSummary[]>,
) {
  return useApiQuery(
    orchestrationQueries.loadedSessions().queryKey,
    () => fetchLoadedOrchestrationSessions(),
    {
      staleTime:
        config?.staleTime ?? orchestrationQueries.loadedSessions().staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled,
    },
  );
}

export function useOrchestrationSessionQuery(
  threadId: string,
  config?: QueryConfig<OrchestrationSessionDetail>,
) {
  return useApiQuery(
    orchestrationQueries.session(threadId).queryKey,
    () => fetchOrchestrationSession(threadId),
    {
      staleTime:
        config?.staleTime ?? orchestrationQueries.session(threadId).staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled ?? threadId.length > 0,
    },
  );
}

export function useTerminalProcessesQuery(
  config?: QueryConfig<TerminalProcessSummary[]>,
) {
  return useApiQuery(
    orchestrationQueries.terminalProcesses().queryKey,
    () => fetchTerminalProcesses(),
    {
      staleTime:
        config?.staleTime ?? orchestrationQueries.terminalProcesses().staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled,
    },
  );
}

export function useTerminalProcessQuery(
  sessionId: string,
  config?: QueryConfig<TerminalProcessDetail>,
) {
  return useApiQuery(
    orchestrationQueries.terminalProcess(sessionId).queryKey,
    () => fetchTerminalProcess(sessionId),
    {
      staleTime:
        config?.staleTime ??
        orchestrationQueries.terminalProcess(sessionId).staleTime,
      gcTime: config?.gcTime,
      enabled: config?.enabled ?? sessionId.length > 0,
    },
  );
}
