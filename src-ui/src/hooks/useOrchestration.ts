import type { ProviderKind } from '@stallion-ai/contracts/provider';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { activeChatsStore } from '../contexts/ActiveChatsContext';
import { toastStore } from '../contexts/ToastContext';

type ProviderSummary = {
  provider: ProviderKind;
  activeSessions: number;
  prerequisites: Array<{
    id?: string;
    key?: string;
    name: string;
    status: string;
    description?: string;
  }>;
};

type OrchestrationEvent =
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'content.text-delta' | 'content.reasoning-delta';
      itemId: string;
      delta: string;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.started';
      itemId: string;
      toolCallId: string;
      toolName: string;
      arguments?: unknown;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.progress';
      itemId: string;
      toolCallId: string;
      message: string;
      progress?: number;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.completed';
      itemId: string;
      toolCallId: string;
      toolName: string;
      status: 'success' | 'error' | 'cancelled';
      output?: unknown;
      error?: string;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'request.opened';
      requestId: string;
      requestType: string;
      title: string;
      description?: string;
      payload?: Record<string, unknown>;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'request.resolved';
      requestId: string;
      status: 'approved' | 'denied' | 'cancelled' | 'expired';
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.started';
      turnId: string;
      prompt?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.completed';
      turnId: string;
      outputText?: string;
      finishReason?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.aborted';
      turnId: string;
      reason: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'session.started' | 'session.configured' | 'session.exited';
      sessionId: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'session.state-changed';
      sessionId: string;
      from: string;
      to: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'runtime.error' | 'runtime.warning';
      message: string;
    };

type SnapshotPayload = {
  sessions: Array<{
    provider: ProviderKind;
    threadId: string;
    status: string;
    model?: string;
  }>;
};

const activeSources = new Map<string, EventSource>();

function upsertTextPart(
  parts: Array<{ type: string; content?: string; tool?: any }> | undefined,
  type: 'text' | 'reasoning',
  delta: string,
) {
  const next = [...(parts || [])];
  const index = next.findIndex((part) => part.type === type);
  if (index >= 0) {
    next[index] = {
      ...next[index],
      content: `${next[index].content || ''}${delta}`,
    };
    return next;
  }
  next.push({ type, content: delta });
  return next;
}

function upsertToolPart(
  parts: Array<{ type: string; content?: string; tool?: any }> | undefined,
  toolCallId: string,
  updates: Record<string, unknown>,
) {
  const next = [...(parts || [])];
  const index = next.findIndex(
    (part) => part.type === 'tool' && part.tool?.id === toolCallId,
  );
  if (index >= 0) {
    next[index] = {
      type: 'tool',
      tool: { ...next[index].tool, ...updates },
    };
    return next;
  }
  next.push({
    type: 'tool',
    tool: {
      id: toolCallId,
      name: String(updates.name || updates.toolName || toolCallId),
      args: updates.args || {},
      ...updates,
    },
  });
  return next;
}

function finalizeAssistantTurn(threadId: string, fallbackText?: string) {
  const chat = activeChatsStore.getSnapshot()[threadId];
  if (!chat) return;
  const streamingMessage = chat.streamingMessage;
  const content =
    streamingMessage?.content ||
    streamingMessage?.contentParts
      ?.filter((part) => part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.content || '')
      .join('\n') ||
    fallbackText ||
    '';

  if (!content && !(streamingMessage?.contentParts || []).length) {
    activeChatsStore.updateChat(threadId, {
      status: 'idle',
      streamingMessage: undefined,
      isProcessingStep: false,
    });
    return;
  }

  activeChatsStore.updateChat(threadId, {
    messages: [
      ...(chat.messages || []),
      {
        role: 'assistant',
        content,
        contentParts: streamingMessage?.contentParts,
      },
    ],
    streamingMessage: undefined,
    status: 'idle',
    isProcessingStep: false,
  });
}

async function dispatchCommand(
  apiBase: string,
  command: Record<string, unknown>,
): Promise<any> {
  const response = await fetch(`${apiBase}/api/orchestration/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.data;
}

async function resolveApproval(
  apiBase: string,
  threadId: string,
  requestId: string,
  decision: 'accept' | 'acceptForSession' | 'decline',
) {
  await dispatchCommand(apiBase, {
    type: 'respondToRequest',
    threadId,
    requestId,
    decision,
  });
}

function handleEvent(apiBase: string, event: OrchestrationEvent) {
  const chat = activeChatsStore.getSnapshot()[event.threadId];
  if (!chat) return;

  switch (event.method) {
    case 'session.started':
    case 'session.configured':
      activeChatsStore.updateChat(event.threadId, {
        provider: event.provider,
        orchestrationProvider: event.provider,
        orchestrationSessionStarted: true,
      });
      return;
    case 'session.state-changed':
      activeChatsStore.updateChat(event.threadId, {
        status: event.to === 'running' ? 'sending' : 'idle',
        provider: event.provider,
        orchestrationProvider: event.provider,
        orchestrationStatus: event.to,
        orchestrationSessionStarted: true,
      });
      return;
    case 'session.exited':
      activeChatsStore.updateChat(event.threadId, {
        status: 'idle',
        orchestrationStatus: 'exited',
        orchestrationSessionStarted: false,
      });
      return;
    case 'turn.started':
      activeChatsStore.updateChat(event.threadId, {
        status: 'sending',
        isProcessingStep: false,
        streamingMessage: {
          role: 'assistant',
          content: '',
          contentParts: [],
        },
      });
      return;
    case 'content.text-delta': {
      const streamingMessage = chat.streamingMessage || {
        role: 'assistant' as const,
        content: '',
        contentParts: [],
      };
      activeChatsStore.updateChat(event.threadId, {
        status: 'sending',
        streamingMessage: {
          role: 'assistant',
          content: `${streamingMessage.content || ''}${event.delta}`,
          contentParts: upsertTextPart(
            streamingMessage.contentParts,
            'text',
            event.delta,
          ),
        },
      });
      return;
    }
    case 'content.reasoning-delta': {
      const streamingMessage = chat.streamingMessage || {
        role: 'assistant' as const,
        content: '',
        contentParts: [],
      };
      activeChatsStore.updateChat(event.threadId, {
        status: 'sending',
        streamingMessage: {
          ...streamingMessage,
          contentParts: upsertTextPart(
            streamingMessage.contentParts,
            'reasoning',
            event.delta,
          ),
        },
      });
      return;
    }
    case 'tool.started': {
      const streamingMessage = chat.streamingMessage || {
        role: 'assistant' as const,
        content: '',
        contentParts: [],
      };
      activeChatsStore.updateChat(event.threadId, {
        isProcessingStep: true,
        streamingMessage: {
          ...streamingMessage,
          contentParts: upsertToolPart(
            streamingMessage.contentParts,
            event.toolCallId,
            {
              name: event.toolName,
              toolName: event.toolName,
              args: event.arguments || {},
              state: 'running',
            },
          ),
        },
      });
      return;
    }
    case 'tool.progress': {
      const streamingMessage = chat.streamingMessage || {
        role: 'assistant' as const,
        content: '',
        contentParts: [],
      };
      activeChatsStore.updateChat(event.threadId, {
        isProcessingStep: true,
        streamingMessage: {
          ...streamingMessage,
          contentParts: upsertToolPart(
            streamingMessage.contentParts,
            event.toolCallId,
            {
              state: 'running',
              progressMessage: event.message,
            },
          ),
        },
      });
      return;
    }
    case 'tool.completed': {
      const streamingMessage = chat.streamingMessage || {
        role: 'assistant' as const,
        content: '',
        contentParts: [],
      };
      activeChatsStore.updateChat(event.threadId, {
        isProcessingStep: false,
        streamingMessage: {
          ...streamingMessage,
          contentParts: upsertToolPart(
            streamingMessage.contentParts,
            event.toolCallId,
            {
              name: event.toolName,
              toolName: event.toolName,
              state:
                event.status === 'success'
                  ? 'completed'
                  : event.status === 'cancelled'
                    ? 'cancelled'
                    : 'error',
              result: event.output,
              error: event.error,
            },
          ),
        },
      });
      return;
    }
    case 'request.opened': {
      const pendingApprovals = [...(chat.pendingApprovals || [])];
      if (!pendingApprovals.includes(event.requestId)) {
        pendingApprovals.push(event.requestId);
      }
      activeChatsStore.updateChat(event.threadId, {
        pendingApprovals,
        orchestrationStatus: 'awaiting-approval',
      });
      const agentName = chat.agentName || chat.agentSlug || event.provider;
      const toastId = toastStore.showToolApproval({
        sessionId: event.threadId,
        toolName: String(
          event.payload?.toolName || event.title || 'Tool request',
        ),
        agentName,
        conversationTitle: chat.title,
        actions: [
          {
            label: 'Allow Once',
            variant: 'primary',
            onClick: () => {
              void resolveApproval(
                apiBase,
                event.threadId,
                event.requestId,
                'accept',
              );
            },
          },
          {
            label: 'Allow for Session',
            variant: 'secondary',
            onClick: () => {
              void resolveApproval(
                apiBase,
                event.threadId,
                event.requestId,
                'acceptForSession',
              );
            },
          },
          {
            label: 'Deny',
            variant: 'danger',
            onClick: () => {
              void resolveApproval(
                apiBase,
                event.threadId,
                event.requestId,
                'decline',
              );
            },
          },
        ],
      });
      const approvalToasts = new Map(chat.approvalToasts || []);
      approvalToasts.set(event.requestId, toastId);
      activeChatsStore.updateChat(event.threadId, { approvalToasts });
      return;
    }
    case 'request.resolved': {
      const pendingApprovals = (chat.pendingApprovals || []).filter(
        (id) => id !== event.requestId,
      );
      const approvalToasts = new Map(chat.approvalToasts || []);
      const toastId = approvalToasts.get(event.requestId);
      if (toastId) {
        toastStore.dismiss(toastId);
      }
      approvalToasts.delete(event.requestId);
      activeChatsStore.updateChat(event.threadId, {
        pendingApprovals,
        approvalToasts,
        orchestrationStatus:
          pendingApprovals.length > 0 ? 'awaiting-approval' : 'running',
      });
      return;
    }
    case 'turn.completed':
      finalizeAssistantTurn(event.threadId, event.outputText);
      return;
    case 'turn.aborted':
      activeChatsStore.updateChat(event.threadId, {
        status: 'idle',
        error: event.reason,
        orchestrationStatus: 'aborted',
        streamingMessage: undefined,
        isProcessingStep: false,
      });
      return;
    case 'runtime.error':
      activeChatsStore.updateChat(event.threadId, {
        status: 'error',
        error: event.message,
        orchestrationStatus: 'errored',
      });
      return;
    case 'runtime.warning':
      toastStore.show(event.message, event.threadId, 5000);
      return;
  }
}

function ensureEventStream(apiBase: string) {
  if (activeSources.has(apiBase)) return;
  const source = new EventSource(`${apiBase}/api/orchestration/events`);
  source.addEventListener('orchestration:snapshot', (raw) => {
    const payload = JSON.parse((raw as MessageEvent).data) as SnapshotPayload;
    const liveThreadIds = new Set(
      payload.sessions.map((session) => session.threadId),
    );

    for (const session of payload.sessions) {
      const chat = activeChatsStore.getSnapshot()[session.threadId];
      if (!chat) continue;
      activeChatsStore.updateChat(session.threadId, {
        provider: session.provider,
        model: session.model,
        orchestrationProvider: session.provider,
        orchestrationModel: session.model,
        orchestrationSessionStarted: true,
        orchestrationStatus: session.status,
        status: session.status === 'running' ? 'sending' : 'idle',
      });
    }

    for (const [threadId, chat] of Object.entries(
      activeChatsStore.getSnapshot(),
    )) {
      if (
        chat.provider !== 'bedrock' &&
        chat.orchestrationSessionStarted &&
        !liveThreadIds.has(threadId)
      ) {
        activeChatsStore.updateChat(threadId, {
          orchestrationSessionStarted: false,
          orchestrationStatus: 'exited',
          status: 'idle',
          isProcessingStep: false,
          streamingMessage: undefined,
        });
      }
    }
  });
  source.addEventListener('orchestration:event', (raw) => {
    const payload = JSON.parse((raw as MessageEvent).data) as {
      event: OrchestrationEvent;
    };
    handleEvent(apiBase, payload.event);
  });
  source.onerror = () => {
    source.close();
    activeSources.delete(apiBase);
    window.setTimeout(() => ensureEventStream(apiBase), 2000);
  };
  activeSources.set(apiBase, source);
}

export function useOrchestration(apiBase: string) {
  useEffect(() => {
    ensureEventStream(apiBase);
  }, [apiBase]);

  const providersQuery = useQuery({
    queryKey: ['orchestration-providers', apiBase],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/api/orchestration/providers`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data.data as ProviderSummary[];
    },
    staleTime: 30_000,
  });

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
  return dispatchCommand(input.apiBase, {
    type: 'startSession',
    input: {
      threadId: input.threadId,
      provider: input.provider,
      modelId: input.modelId,
      modelOptions: input.modelOptions,
      cwd: input.cwd,
    },
  });
}

export async function sendOrchestrationTurn(input: {
  apiBase: string;
  threadId: string;
  text: string;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
}) {
  return dispatchCommand(input.apiBase, {
    type: 'sendTurn',
    input: {
      threadId: input.threadId,
      input: input.text,
      modelId: input.modelId,
      modelOptions: input.modelOptions,
    },
  });
}
