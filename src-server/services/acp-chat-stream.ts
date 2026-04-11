import type { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { Context } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { MonitoringEmitter } from '../monitoring/emitter.js';
import { acpOps } from '../telemetry/metrics.js';
import type { ConversationMessage, MessagePart } from './acp-bridge-types.js';

export interface ACPCommandExecutionPayload {
  cmdInput?: string;
  cmdName: string;
  commandPayload: { command: string; input?: string };
}

interface ACPChatStreamLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

interface ACPChatStreamMonitoring {
  emit: (event: 'event', data: Record<string, unknown>) => void;
}

interface ACPChatStreamStateAccess {
  getActiveWriter(): ((chunk: any) => Promise<void>) | null;
  setActiveWriter(writer: ((chunk: any) => Promise<void>) | null): void;
  getResponseAccumulator(): string;
  setResponseAccumulator(value: string): void;
  getResponseParts(): MessagePart[];
  setResponseParts(parts: MessagePart[]): void;
}

interface ACPChatStreamDeps extends ACPChatStreamStateAccess {
  adapter: FileMemoryAdapter | null;
  connection: ClientSideConnection;
  conversationId: string;
  getCurrentModelName: () => string | null;
  input: unknown;
  inputText: string;
  isNewConversation: boolean;
  logger: ACPChatStreamLogger;
  monitoringEmitter?: MonitoringEmitter;
  monitoringEvents?: ACPChatStreamMonitoring;
  options: Record<string, any>;
  persistEvent?: (event: Record<string, unknown>) => Promise<void>;
  promptContent: any[];
  sessionId: string;
  slug: string;
  updateToolResult: (
    toolCallId: string,
    result: string | undefined,
    isError?: boolean,
  ) => void;
  usageAggregatorRef?: { get: () => any };
  userId: string;
}

export function buildACPCommandExecutionPayload(
  inputText: string,
): ACPCommandExecutionPayload | null {
  if (!inputText.startsWith('/')) {
    return null;
  }

  const spaceIdx = inputText.indexOf(' ');
  const cmdName = (
    spaceIdx > 0 ? inputText.substring(0, spaceIdx) : inputText
  ).replace(/^\//, '');
  const cmdInput = spaceIdx > 0 ? inputText.substring(spaceIdx + 1) : undefined;
  const pascalCmd = cmdName.charAt(0).toUpperCase() + cmdName.slice(1);

  return {
    cmdName,
    cmdInput,
    commandPayload: cmdInput
      ? { command: pascalCmd, input: cmdInput }
      : { command: pascalCmd },
  };
}

export function markACPInterruptedToolCalls(
  responseParts: MessagePart[],
): number {
  let interruptedCount = 0;
  for (const part of responseParts) {
    if (part.type !== 'tool-invocation' || part.state !== 'call') {
      continue;
    }
    part.state = 'error';
    part.result = 'Tool call interrupted — agent session ended unexpectedly';
    interruptedCount += 1;
  }
  return interruptedCount;
}

function flushACPTextPart(state: ACPChatStreamStateAccess): void {
  const responseAccumulator = state.getResponseAccumulator();
  if (!responseAccumulator) {
    return;
  }

  state.setResponseParts([
    ...state.getResponseParts(),
    { type: 'text', text: responseAccumulator },
  ]);
  state.setResponseAccumulator('');
}

function buildACPAssistantParts(
  state: ACPChatStreamStateAccess,
): MessagePart[] {
  flushACPTextPart(state);
  const parts = state.getResponseParts();
  return parts.length > 0 ? parts : [{ type: 'text', text: '' }];
}

export function buildACPAgentStartEvent(args: {
  conversationId: string;
  inputText: string;
  slug: string;
  timestampMs: number;
  traceId: string;
  userId: string;
}): Record<string, unknown> {
  return {
    type: 'agent-start',
    timestamp: new Date(args.timestampMs).toISOString(),
    timestampMs: args.timestampMs,
    agentSlug: args.slug,
    conversationId: args.conversationId,
    userId: args.userId,
    traceId: args.traceId,
    input:
      args.inputText.length > 200
        ? `${args.inputText.substring(0, 200)}...`
        : args.inputText,
  };
}

export function buildACPAgentCompleteEvent(args: {
  cancelled: boolean;
  conversationId: string;
  inputText: string;
  responseParts: MessagePart[];
  responseText: string;
  slug: string;
  timestampMs: number;
  traceId: string;
  userId: string;
}): Record<string, unknown> {
  return {
    type: 'agent-complete',
    timestamp: new Date(args.timestampMs).toISOString(),
    timestampMs: args.timestampMs,
    agentSlug: args.slug,
    conversationId: args.conversationId,
    userId: args.userId,
    traceId: args.traceId,
    reason: args.cancelled ? 'cancelled' : 'end_turn',
    inputChars: args.inputText.length,
    outputChars: args.responseText.length,
    toolCallCount: args.responseParts.filter(
      (part) => part.type === 'tool-invocation',
    ).length,
  };
}

export function streamACPChatResponse(
  context: Context,
  deps: ACPChatStreamDeps,
): Response {
  return honoStream(context, async (streamWriter) => {
    const write = async (chunk: any) => {
      await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    deps.setActiveWriter(write);
    deps.setResponseAccumulator('');
    deps.setResponseParts([]);

    let lastOutputAt = Date.now();
    let waitingEmitted = false;
    const STALE_THRESHOLD_MS = 60_000;
    const POLL_INTERVAL_MS = 5_000;

    const trackedWrite = async (chunk: any) => {
      if (
        chunk.type === 'text-delta' ||
        chunk.type === 'tool-call' ||
        chunk.type === 'tool-result' ||
        chunk.type === 'reasoning-delta'
      ) {
        lastOutputAt = Date.now();
        if (waitingEmitted) {
          waitingEmitted = false;
          await write({ type: 'waiting-cleared' });
        }
      }
      return write(chunk);
    };
    deps.setActiveWriter(trackedWrite);

    const waitingTimer = setInterval(async () => {
      if (!deps.getActiveWriter()) {
        return;
      }
      const elapsed = Date.now() - lastOutputAt;
      if (elapsed < STALE_THRESHOLD_MS) {
        return;
      }

      waitingEmitted = true;
      acpOps.add(1, { operation: 'waiting-detected' });
      try {
        await write({ type: 'waiting', elapsedMs: elapsed });
      } catch (error) {
        deps.logger.debug('Failed to write waiting event to stream', {
          error,
        });
      }
    }, POLL_INTERVAL_MS);

    let cancelled = false;
    const abortHandler = () => {
      cancelled = true;
      deps.connection
        .cancel({ sessionId: deps.sessionId })
        .catch((error: unknown) =>
          deps.logger.error('[acp] cancel failed:', { error }),
        );
    };
    context.req.raw.signal?.addEventListener('abort', abortHandler);

    const chatStartMs = Date.now();
    const traceId = `acp:${deps.slug}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const agentStartEvent = buildACPAgentStartEvent({
      conversationId: deps.conversationId,
      inputText: deps.inputText,
      slug: deps.slug,
      timestampMs: chatStartMs,
      traceId,
      userId: deps.userId,
    });
    deps.monitoringEvents?.emit('event', agentStartEvent);
    deps.persistEvent?.(agentStartEvent).catch(() => {});
    deps.monitoringEmitter?.emitAgentStart({
      slug: deps.slug,
      conversationId: deps.conversationId,
      userId: deps.userId,
      traceId,
      input: typeof deps.input === 'string' ? deps.input : '[complex input]',
      provider: 'acp',
    });

    try {
      if (deps.isNewConversation) {
        await write({
          type: 'conversation-started',
          conversationId: deps.conversationId,
          title: deps.options.title || deps.inputText.substring(0, 50),
        });
      }

      const commandPayload = buildACPCommandExecutionPayload(deps.inputText);
      if (commandPayload) {
        try {
          deps.connection
            .extMethod('_kiro.dev/commands/execute', {
              sessionId: deps.sessionId,
              ...commandPayload.commandPayload,
            })
            .catch((error: unknown) =>
              deps.logger.warn('[ACPBridge] extMethod error', {
                error: String(error),
              }),
            );
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (deps.getResponseAccumulator().length === 0) {
            const ack = `/${commandPayload.cmdName}${commandPayload.cmdInput ? ` ${commandPayload.cmdInput}` : ''} ✓`;
            await write({ type: 'text-delta', text: ack });
            deps.setResponseAccumulator(ack);
          }
        } catch (error: any) {
          deps.logger.warn(
            '[ACPBridge] Command extension failed, falling back to prompt',
            { error: error.message },
          );
          await deps.connection.prompt({
            sessionId: deps.sessionId,
            prompt: deps.promptContent,
          });
        }
      } else {
        await deps.connection.prompt({
          sessionId: deps.sessionId,
          prompt: deps.promptContent,
        });
      }

      if (
        deps.adapter &&
        (deps.getResponseAccumulator() || deps.getResponseParts().length > 0)
      ) {
        const parts = buildACPAssistantParts(deps);
        const assistantMsg: ConversationMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts,
          metadata: {
            timestamp: Date.now(),
            model: deps.getCurrentModelName(),
          },
        };
        await deps.adapter.addMessage(
          assistantMsg as unknown as any,
          deps.userId,
          deps.conversationId,
        );
        if (deps.usageAggregatorRef?.get()) {
          await deps.usageAggregatorRef
            .get()
            .incrementalUpdate(assistantMsg, deps.slug, deps.conversationId)
            .catch((error: unknown) =>
              deps.logger.error('[acp] usage update failed:', { error }),
            );
        }
      }

      await write({
        type: 'finish',
        finishReason: cancelled ? 'cancelled' : 'end_turn',
      });
      await streamWriter.write('data: [DONE]\n\n');
    } catch (error: any) {
      const responseParts = deps.getResponseParts();
      const interruptedCount = markACPInterruptedToolCalls(responseParts);
      deps.setResponseParts(responseParts);
      if (interruptedCount > 0) {
        acpOps.add(interruptedCount, { operation: 'tool-interrupted' });
        for (const part of responseParts) {
          if (part.type === 'tool-invocation' && part.state === 'error') {
            await deps.getActiveWriter()?.({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              error:
                'Tool call interrupted — agent session ended unexpectedly',
            });
          }
        }
      }

      if (
        deps.adapter &&
        (deps.getResponseAccumulator() || deps.getResponseParts().length > 0)
      ) {
        if (cancelled) {
          deps.setResponseAccumulator(
            `${deps.getResponseAccumulator()}\n\n---\n\n_⚠️ Response cancelled by user_`,
          );
        }
        const partialMessage: ConversationMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: buildACPAssistantParts(deps),
        };
        await deps.adapter
          .addMessage(
            partialMessage as unknown as any,
            deps.userId,
            deps.conversationId,
          )
          .catch((innerError: unknown) =>
            deps.logger.error('[acp] operation failed:', { error: innerError }),
          );
      }

      if (cancelled) {
        await write({ type: 'finish', finishReason: 'cancelled' });
      } else {
        deps.logger.error('[ACPBridge] Prompt error', {
          error: error.message,
        });
        await write({ type: 'error', errorText: error.message });
      }
      await streamWriter.write('data: [DONE]\n\n');
    } finally {
      clearInterval(waitingTimer);
      context.req.raw.signal?.removeEventListener('abort', abortHandler);

      const agentCompleteEvent = buildACPAgentCompleteEvent({
        cancelled,
        conversationId: deps.conversationId,
        inputText: deps.inputText,
        responseParts: deps.getResponseParts(),
        responseText: deps.getResponseAccumulator(),
        slug: deps.slug,
        timestampMs: Date.now(),
        traceId,
        userId: deps.userId,
      });
      deps.monitoringEvents?.emit('event', agentCompleteEvent);
      deps.persistEvent?.(agentCompleteEvent).catch(() => {});
      deps.monitoringEmitter?.emitAgentComplete({
        slug: deps.slug,
        conversationId: deps.conversationId,
        userId: deps.userId,
        traceId,
        reason: cancelled ? 'cancelled' : 'complete',
      });

      deps.setActiveWriter(null);
      deps.setResponseAccumulator('');
      deps.setResponseParts([]);
    }
  });
}
