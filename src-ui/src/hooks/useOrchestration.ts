import type { ProviderKind } from '@stallion-ai/contracts/provider';
import {
  sendOrchestrationTurn as sendOrchestrationTurnRequest,
  startOrchestrationSession as startOrchestrationSessionRequest,
  useOrchestrationProvidersQuery,
} from '@stallion-ai/sdk';
import { useEffect } from 'react';
import { ensureOrchestrationEventStream } from './orchestration/ensureOrchestrationEventStream';

export function useOrchestration(apiBase: string) {
  useEffect(() => {
    ensureOrchestrationEventStream(apiBase);
  }, [apiBase]);

  const providersQuery = useOrchestrationProvidersQuery();

  return {
    providers: providersQuery.data || [],
    isLoadingProviders: providersQuery.isLoading,
  };
}

export async function startOrchestrationSession(input: {
  apiBase: string;
  threadId: string;
  provider: ProviderKind;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
  cwd?: string;
}) {
  return startOrchestrationSessionRequest({
    apiBase: input.apiBase,
    threadId: input.threadId,
    provider: input.provider,
    modelId: input.modelId,
    modelOptions: input.modelOptions,
    cwd: input.cwd,
  });
}

export async function sendOrchestrationTurn(input: {
  apiBase: string;
  threadId: string;
  text: string;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
}) {
  return sendOrchestrationTurnRequest({
    apiBase: input.apiBase,
    threadId: input.threadId,
    text: input.text,
    modelId: input.modelId,
    modelOptions: input.modelOptions,
  });
}
