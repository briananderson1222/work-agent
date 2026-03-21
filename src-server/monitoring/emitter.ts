import type { EventEmitter } from 'node:events';
import type { MonitoringEvent, HealthIntegration, GenAiOperationName } from './schema.js';
import { K, OP, SPAN } from './schema.js';

type PersistFn = (event: MonitoringEvent) => Promise<void>;

function base(
  operation: GenAiOperationName,
  kind: MonitoringEvent[typeof K.SPAN_KIND],
  traceId: string,
): MonitoringEvent {
  const now = Date.now();
  return {
    timestamp: new Date(now).toISOString(),
    [K.TIMESTAMP_MS]: now,
    [K.TRACE_ID]: traceId,
    [K.OP_NAME]: operation,
    [K.SPAN_KIND]: kind,
  };
}

export class MonitoringEmitter {
  constructor(
    private readonly events: EventEmitter,
    private readonly persist: PersistFn,
  ) {}

  private emit(event: MonitoringEvent): void {
    this.events.emit('event', event);
    this.persist(event).catch(() => {});
  }

  emitAgentStart(opts: {
    slug: string; conversationId: string; userId: string; traceId: string;
    input: string; model?: string; provider?: string;
  }): void {
    this.emit({
      ...base(OP.INVOKE_AGENT, SPAN.START, opts.traceId),
      [K.CONVERSATION_ID]: opts.conversationId,
      [K.MODEL]: opts.model,
      [K.PROVIDER]: opts.provider,
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
      [K.INPUT_CHARS]: opts.input.length,
    });
  }

  emitAgentComplete(opts: {
    slug: string; conversationId: string; userId: string; traceId: string;
    reason: string; steps?: number; maxSteps?: number; toolCallCount?: number;
    inputChars?: number; outputChars?: number;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    artifacts?: MonitoringEvent[typeof K.ARTIFACTS]; model?: string;
  }): void {
    this.emit({
      ...base(OP.INVOKE_AGENT, SPAN.END, opts.traceId),
      [K.CONVERSATION_ID]: opts.conversationId,
      [K.MODEL]: opts.model,
      [K.FINISH_REASONS]: [opts.reason],
      [K.INPUT_TOKENS]: opts.usage?.inputTokens,
      [K.OUTPUT_TOKENS]: opts.usage?.outputTokens,
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
      [K.AGENT_STEPS]: opts.steps,
      [K.AGENT_MAX_STEPS]: opts.maxSteps,
      [K.INPUT_CHARS]: opts.inputChars,
      [K.OUTPUT_CHARS]: opts.outputChars,
      [K.ARTIFACTS]: opts.artifacts,
    });
  }

  emitToolCall(opts: {
    slug: string; conversationId: string; userId: string; traceId: string;
    toolName: string; toolCallId: string; input?: unknown; toolCallNumber?: number;
  }): void {
    this.emit({
      ...base(OP.EXECUTE_TOOL, SPAN.START, opts.traceId),
      [K.CONVERSATION_ID]: opts.conversationId,
      [K.TOOL_NAME]: opts.toolName,
      [K.TOOL_CALL_ID]: opts.toolCallId,
      [K.TOOL_CALL_ARGS]: opts.input,
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
    });
  }

  emitToolResult(opts: {
    slug: string; conversationId: string; userId: string; traceId: string;
    toolName: string; toolCallId: string; result?: unknown;
  }): void {
    this.emit({
      ...base(OP.EXECUTE_TOOL, SPAN.END, opts.traceId),
      [K.CONVERSATION_ID]: opts.conversationId,
      [K.TOOL_NAME]: opts.toolName,
      [K.TOOL_CALL_ID]: opts.toolCallId,
      [K.TOOL_CALL_RESULT]: opts.result,
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
    });
  }

  emitReasoning(opts: {
    slug: string; conversationId: string; userId: string; traceId: string; text: string;
  }): void {
    this.emit({
      ...base(OP.CHAT, SPAN.EVENT, opts.traceId),
      [K.CONVERSATION_ID]: opts.conversationId,
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
      [K.REASONING_TEXT]: opts.text,
    });
  }

  emitHealth(opts: {
    slug: string; userId: string; traceId: string;
    healthy: boolean; checks?: Record<string, boolean>; integrations?: HealthIntegration[];
  }): void {
    this.emit({
      ...base(OP.INVOKE_AGENT, SPAN.LOG, opts.traceId),
      [K.AGENT_SLUG]: opts.slug,
      [K.USER_ID]: opts.userId,
      [K.HEALTHY]: opts.healthy,
      [K.HEALTH_CHECKS]: opts.checks,
      [K.HEALTH_INTEGRATIONS]: opts.integrations,
    });
  }

  emitRaw(event: MonitoringEvent): void {
    this.emit(event);
  }
}
