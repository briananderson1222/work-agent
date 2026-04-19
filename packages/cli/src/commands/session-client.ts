import { printJson, requestJson, streamSse } from './core-api.js';

export interface CliSessionSummary {
  id: string;
  agent: string;
  kind: 'managed' | 'runtime';
  status?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  isLoaded?: boolean;
  isPersisted?: boolean;
  eventCount?: number;
  lastEventMethod?: string;
}

export interface CliSessionDetail {
  session: CliSessionSummary;
  entries: Array<Record<string, unknown>>;
}

export interface ChatSendOptions {
  message: string;
  conversationId?: string;
  model?: string;
  title?: string;
  projectSlug?: string;
  jsonMode: boolean;
}

export interface CliSessionClient {
  listSessions(): Promise<CliSessionSummary[]>;
  readSession(id: string): Promise<CliSessionDetail>;
  interruptSession(id: string, turnId?: string): Promise<void>;
  sendMessage(options: ChatSendOptions): Promise<void>;
}

export function createSessionClient(
  apiBase: string,
  agentSlug: string,
): CliSessionClient {
  const runtimeProvider = runtimeAgentToOrchestrationProvider(agentSlug);
  if (runtimeProvider) {
    return createRuntimeSessionClient(apiBase, agentSlug, runtimeProvider);
  }
  return createManagedSessionClient(apiBase, agentSlug);
}

function createManagedSessionClient(
  apiBase: string,
  agentSlug: string,
): CliSessionClient {
  return {
    async listSessions() {
      const conversations = (await requestJson<Array<Record<string, unknown>>>(
        apiBase,
        `/agents/${encodeURIComponent(agentSlug)}/conversations`,
      )) as Array<Record<string, unknown>>;

      return conversations.map((conversation) => ({
        id: String(conversation.id),
        agent: agentSlug,
        kind: 'managed',
        title:
          typeof conversation.title === 'string'
            ? conversation.title
            : undefined,
        createdAt:
          typeof conversation.createdAt === 'string'
            ? conversation.createdAt
            : undefined,
        updatedAt:
          typeof conversation.updatedAt === 'string'
            ? conversation.updatedAt
            : undefined,
        status: 'persisted',
        isLoaded: false,
        isPersisted: true,
      }));
    },

    async readSession(id: string) {
      const messages = (await requestJson<Array<Record<string, unknown>>>(
        apiBase,
        `/agents/${encodeURIComponent(agentSlug)}/conversations/${encodeURIComponent(id)}/messages`,
      )) as Array<Record<string, unknown>>;

      return {
        session: {
          id,
          agent: agentSlug,
          kind: 'managed',
          status: 'persisted',
          isLoaded: false,
          isPersisted: true,
        },
        entries: messages.map((message) => ({
          kind: 'message',
          ...message,
        })),
      };
    },

    async interruptSession() {
      throw new Error(
        'Interrupt is only supported for orchestration-backed runtime sessions.',
      );
    },

    async sendMessage({
      message,
      conversationId,
      model,
      title,
      projectSlug,
      jsonMode,
    }) {
      const payload = {
        input: message,
        options: {
          ...(typeof conversationId === 'string' ? { conversationId } : {}),
          ...(typeof model === 'string' ? { model } : {}),
          ...(typeof title === 'string' ? { title } : {}),
        },
        ...(typeof projectSlug === 'string' ? { projectSlug } : {}),
      };

      const response = await fetch(
        `${apiBase}/api/agents/${encodeURIComponent(agentSlug)}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        let errorText = `Chat request failed with HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) {
            errorText = body.error;
          }
        } catch {}
        throw new Error(errorText);
      }

      let startedConversationId =
        typeof conversationId === 'string' ? conversationId : undefined;
      let finishReason: string | undefined;
      let accumulatedText = '';

      await streamSse(response, (event) => {
        if (
          (event.type === 'conversation-started' ||
            event.type === 'conversation') &&
          typeof event.conversationId === 'string'
        ) {
          startedConversationId = event.conversationId;
          return;
        }

        if (event.type === 'error') {
          throw new Error(resolveChatStreamError(event));
        }

        if (event.type === 'finish' && typeof event.finishReason === 'string') {
          finishReason = event.finishReason;
          return;
        }

        if (event.type !== 'text-delta') {
          return;
        }

        const delta =
          typeof event.text === 'string'
            ? event.text
            : typeof event.delta === 'string'
              ? event.delta
              : typeof event.textDelta === 'string'
                ? event.textDelta
                : '';

        if (!delta) {
          return;
        }

        accumulatedText += delta;
        if (!jsonMode) {
          process.stdout.write(delta);
        }
      });

      if (jsonMode) {
        printJson({
          agent: agentSlug,
          conversationId: startedConversationId,
          finishReason,
          text: accumulatedText,
        });
        return;
      }

      if (accumulatedText.length > 0) {
        process.stdout.write('\n');
      }
    },
  };
}

function createRuntimeSessionClient(
  apiBase: string,
  agentSlug: string,
  provider: 'claude' | 'codex' | 'ollama',
): CliSessionClient {
  return {
    async listSessions() {
      const sessions = (await requestJson<Array<Record<string, unknown>>>(
        apiBase,
        '/api/orchestration/sessions/read-model',
      )) as Array<Record<string, unknown>>;

      return sessions
        .filter((session) => session.provider === provider)
        .map((session) => ({
          id: String(session.threadId),
          agent: agentSlug,
          kind: 'runtime',
          status:
            typeof session.status === 'string' ? session.status : undefined,
          createdAt:
            typeof session.createdAt === 'string'
              ? session.createdAt
              : undefined,
          updatedAt:
            typeof session.updatedAt === 'string'
              ? session.updatedAt
              : undefined,
          isLoaded:
            typeof session.isLoaded === 'boolean'
              ? session.isLoaded
              : undefined,
          isPersisted:
            typeof session.isPersisted === 'boolean'
              ? session.isPersisted
              : undefined,
          eventCount:
            typeof session.eventCount === 'number'
              ? session.eventCount
              : undefined,
          lastEventMethod:
            typeof session.lastEventMethod === 'string'
              ? session.lastEventMethod
              : undefined,
        }));
    },

    async readSession(id: string) {
      const detail = (await requestJson<Record<string, unknown>>(
        apiBase,
        `/api/orchestration/sessions/${encodeURIComponent(id)}`,
      )) as Record<string, unknown>;
      const session = detail.session as Record<string, unknown>;
      const events = Array.isArray(detail.events)
        ? (detail.events as Array<Record<string, unknown>>)
        : [];

      return {
        session: {
          id,
          agent: agentSlug,
          kind: 'runtime',
          status:
            typeof session.status === 'string' ? session.status : undefined,
          createdAt:
            typeof session.createdAt === 'string'
              ? session.createdAt
              : undefined,
          updatedAt:
            typeof session.updatedAt === 'string'
              ? session.updatedAt
              : undefined,
          isLoaded:
            typeof session.isLoaded === 'boolean'
              ? session.isLoaded
              : undefined,
          isPersisted:
            typeof session.isPersisted === 'boolean'
              ? session.isPersisted
              : undefined,
          eventCount:
            typeof session.eventCount === 'number'
              ? session.eventCount
              : undefined,
          lastEventMethod:
            typeof session.lastEventMethod === 'string'
              ? session.lastEventMethod
              : undefined,
        },
        entries: events.map((event) => ({
          kind: 'event',
          ...event,
        })),
      };
    },

    async interruptSession(id: string, turnId?: string) {
      await requestJson(apiBase, '/api/orchestration/commands', {
        method: 'POST',
        body: JSON.stringify({
          type: 'interruptTurn',
          threadId: id,
          ...(typeof turnId === 'string' && turnId.length > 0
            ? { turnId }
            : {}),
        }),
      });
    },

    async sendMessage({ message, conversationId, model, jsonMode }) {
      const threadId =
        typeof conversationId === 'string'
          ? conversationId
          : `cli:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
      const shouldStopAfterTurn = typeof conversationId !== 'string';

      const detail = await readRuntimeSessionOrNull(apiBase, threadId);
      const session = detail?.session as Record<string, unknown> | undefined;
      const isLoaded = session?.isLoaded === true;

      const abortController = new AbortController();
      const response = await fetch(`${apiBase}/api/orchestration/events`, {
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Orchestration event stream failed with HTTP ${response.status}`,
        );
      }

      let finishReason: string | undefined;
      let accumulatedText = '';

      const eventsTask = consumeOrchestrationEvents({
        response,
        threadId,
        onTextDelta: (delta) => {
          accumulatedText += delta;
          if (!jsonMode) {
            process.stdout.write(delta);
          }
        },
        onFinish: (reason) => {
          finishReason = reason;
          abortController.abort();
        },
        onError: (error) => {
          throw new Error(error);
        },
      });

      try {
        if (!isLoaded) {
          const input: Record<string, unknown> = {
            threadId,
            provider,
            ...(model ? { modelId: model } : {}),
          };
          if (session?.resumeCursor !== undefined) {
            input.resumeCursor = session.resumeCursor;
          }
          await requestJson(apiBase, '/api/orchestration/commands', {
            method: 'POST',
            body: JSON.stringify({
              type: 'startSession',
              input,
            }),
          });
        }

        await requestJson(apiBase, '/api/orchestration/commands', {
          method: 'POST',
          body: JSON.stringify({
            type: 'sendTurn',
            input: {
              threadId,
              input: message,
              ...(model ? { modelId: model } : {}),
            },
          }),
        });

        await eventsTask;
      } finally {
        if (shouldStopAfterTurn) {
          try {
            await requestJson(apiBase, '/api/orchestration/commands', {
              method: 'POST',
              body: JSON.stringify({
                type: 'stopSession',
                threadId,
              }),
            });
          } catch {}
        }
      }

      if (jsonMode) {
        printJson({
          agent: agentSlug,
          conversationId: threadId,
          finishReason,
          text: accumulatedText,
        });
        return;
      }

      if (accumulatedText.length > 0) {
        process.stdout.write('\n');
      }
    },
  };
}

async function readRuntimeSessionOrNull(apiBase: string, threadId: string) {
  const response = await fetch(
    `${apiBase}/api/orchestration/sessions/${encodeURIComponent(threadId)}`,
  );
  if (response.status === 404) {
    return null;
  }
  const payload = (await response.json()) as {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
  if (!response.ok || !payload.success) {
    throw new Error(
      payload.error || `Request failed with HTTP ${response.status}`,
    );
  }
  return payload.data ?? null;
}

function runtimeAgentToOrchestrationProvider(
  agentSlug: string,
): 'claude' | 'codex' | 'ollama' | null {
  if (!agentSlug.startsWith('__runtime:')) {
    return null;
  }
  const runtimeId = agentSlug.slice('__runtime:'.length);
  if (runtimeId === 'claude-runtime') return 'claude';
  if (runtimeId === 'codex-runtime') return 'codex';
  if (runtimeId === 'ollama-runtime') return 'ollama';
  return null;
}

async function consumeOrchestrationEvents({
  response,
  threadId,
  onTextDelta,
  onFinish,
  onError,
}: {
  response: Response;
  threadId: string;
  onTextDelta: (delta: string) => void;
  onFinish: (reason?: string) => void;
  onError: (message: string) => never;
}) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No orchestration event stream body available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() || '';

      for (const segment of segments) {
        const payload = extractSseData(segment);
        if (!payload || payload === '[DONE]') {
          continue;
        }

        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const event =
          parsed.event && typeof parsed.event === 'object'
            ? (parsed.event as Record<string, unknown>)
            : parsed;
        if (event.threadId !== threadId) {
          continue;
        }

        if (
          event.method === 'content.text-delta' &&
          typeof event.delta === 'string'
        ) {
          onTextDelta(event.delta);
          continue;
        }

        if (event.method === 'runtime.error') {
          onError(
            typeof event.message === 'string'
              ? event.message
              : 'Connected runtime failed',
          );
        }

        if (event.method === 'turn.aborted') {
          onError(
            typeof event.reason === 'string'
              ? event.reason
              : 'Connected runtime turn aborted',
          );
        }

        if (event.method === 'turn.completed') {
          onFinish(
            typeof event.finishReason === 'string'
              ? event.finishReason
              : undefined,
          );
          return;
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

function extractSseData(segment: string): string | null {
  const line = segment.split('\n').find((entry) => entry.startsWith('data: '));
  return line ? line.slice(6) : null;
}

function resolveChatStreamError(event: Record<string, unknown>): string {
  if (typeof event.errorText === 'string' && event.errorText.length > 0) {
    return event.errorText;
  }

  if (typeof event.error === 'string' && event.error.length > 0) {
    return event.error;
  }

  if (
    event.error &&
    typeof event.error === 'object' &&
    'message' in event.error &&
    typeof (event.error as { message?: unknown }).message === 'string'
  ) {
    return (event.error as { message: string }).message;
  }

  return 'Chat stream failed';
}
