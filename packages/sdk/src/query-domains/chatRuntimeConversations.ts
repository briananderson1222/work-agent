import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import {
  type MutationOptions,
  type QueryConfig,
  resolveApiBase,
} from '../query-core';
import { conversationQueries } from '../queryFactories';
import { mapConversationMessages } from './chatRuntimeStream';
import type {
  ConversationLookup,
  ConversationMessage,
  ConversationSummary,
} from './chatRuntimeTypes';

export type {
  ConversationLookup,
  ConversationMessage,
  ConversationMessagePart,
  ConversationSummary,
} from './chatRuntimeTypes';

export async function fetchAgentConversations(
  agentSlug: string,
): Promise<ConversationSummary[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/conversations`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: ConversationSummary[];
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch conversations');
  }
  return result.data ?? [];
}

export async function renameConversation(
  agentSlug: string,
  conversationId: string,
  title: string,
): Promise<unknown> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to rename conversation');
  }
  return result.data;
}

export async function deleteConversation(
  agentSlug: string,
  conversationId: string,
): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to delete conversation');
  }
}

export async function fetchConversationMessages(
  agentSlug: string,
  conversationId: string,
  toolMappings: Record<
    string,
    { server?: string; toolName?: string; originalName?: string }
  > = {},
): Promise<ConversationMessage[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: Array<{
      role: 'user' | 'assistant';
      parts?: Array<{
        type: string;
        text?: string;
        content?: string;
        url?: string;
        mediaType?: string;
        name?: string;
        server?: string;
        toolName?: string;
        originalName?: string;
      }>;
      metadata?: { timestamp?: string; traceId?: string };
      timestamp?: string;
    }>;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch conversation messages');
  }

  return mapConversationMessages(result.data ?? [], toolMappings);
}

export async function fetchConversationById(
  conversationId: string,
  apiBase?: string,
): Promise<ConversationLookup | null> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/conversations/${encodeURIComponent(conversationId)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: ConversationLookup;
    error?: string;
  };
  if (!result.success) {
    return null;
  }
  return result.data ?? null;
}

export function useConversationsQuery(
  agentSlug: string | undefined,
  config?: QueryConfig<any>,
) {
  return useQuery({
    ...(agentSlug
      ? conversationQueries.list(agentSlug)
      : {
          queryKey: ['conversations'],
          queryFn: async () => [],
          staleTime: 0,
        }),
    enabled: !!agentSlug && (config?.enabled ?? true),
    staleTime: config?.staleTime,
    gcTime: config?.gcTime,
  });
}

export function useRenameConversationMutation(
  options?: MutationOptions<
    unknown,
    { agentSlug: string; conversationId: string; title: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agentSlug,
      conversationId,
      title,
    }: {
      agentSlug: string;
      conversationId: string;
      title: string;
    }) => renameConversation(agentSlug, conversationId, title),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.agentSlug],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useDeleteConversationMutation(
  options?: MutationOptions<
    void,
    { agentSlug: string; conversationId: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agentSlug,
      conversationId,
    }: {
      agentSlug: string;
      conversationId: string;
    }) => deleteConversation(agentSlug, conversationId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.agentSlug],
      });
      queryClient.removeQueries({
        queryKey: ['messages', variables.agentSlug, variables.conversationId],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}
