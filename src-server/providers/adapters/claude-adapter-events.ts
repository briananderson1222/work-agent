import crypto from 'node:crypto';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { ProviderSession } from '../adapter-shape.js';

export interface ClaudeMessageState {
  session: ProviderSession;
  activeTurnId?: string;
  lastSessionState: 'idle' | 'running' | 'requires_action';
}

interface MapClaudeMessageParams {
  provider: ProviderSession['provider'];
  record: ClaudeMessageState;
  message: SDKMessage;
  publish: (event: CanonicalRuntimeEvent) => void;
}

export function mapClaudeSdkMessage({
  provider,
  record,
  message,
  publish,
}: MapClaudeMessageParams): void {
  const createdAt = new Date().toISOString();

  if (
    message.type === 'system' &&
    message.subtype === 'session_state_changed'
  ) {
    const from = mapClaudeSessionState(record.lastSessionState);
    const to = mapClaudeSessionState(message.state);
    record.lastSessionState = message.state;
    record.session.status =
      message.state === 'running'
        ? 'running'
        : message.state === 'requires_action'
          ? 'ready'
          : 'ready';
    record.session.updatedAt = createdAt;
    publish({
      eventId: crypto.randomUUID(),
      provider,
      threadId: record.session.threadId,
      createdAt,
      method: 'session.state-changed',
      sessionId: record.session.threadId,
      from,
      to,
    });
    return;
  }

  if (message.type === 'stream_event') {
    const streamEvent = message.event as any;
    const itemId = `${message.session_id}:${message.uuid}`;
    if (
      streamEvent?.type === 'content_block_delta' &&
      streamEvent.delta?.type === 'text_delta' &&
      typeof streamEvent.delta.text === 'string'
    ) {
      publish({
        eventId: crypto.randomUUID(),
        provider,
        threadId: record.session.threadId,
        createdAt,
        turnId: record.activeTurnId,
        itemId,
        method: 'content.text-delta',
        delta: streamEvent.delta.text,
      });
    }
    if (
      streamEvent?.type === 'content_block_delta' &&
      (streamEvent.delta?.type === 'thinking_delta' ||
        streamEvent.delta?.type === 'signature_delta') &&
      typeof streamEvent.delta.thinking === 'string'
    ) {
      publish({
        eventId: crypto.randomUUID(),
        provider,
        threadId: record.session.threadId,
        createdAt,
        turnId: record.activeTurnId,
        itemId,
        method: 'content.reasoning-delta',
        delta: streamEvent.delta.thinking,
      });
    }
    return;
  }

  if (message.type === 'tool_progress') {
    publish({
      eventId: crypto.randomUUID(),
      provider,
      threadId: record.session.threadId,
      createdAt,
      turnId: record.activeTurnId,
      itemId: message.tool_use_id,
      method: 'tool.progress',
      toolCallId: message.tool_use_id,
      message: `Running ${message.tool_name}`,
      progress: undefined,
    });
    return;
  }

  if (message.type === 'result') {
    publish({
      eventId: crypto.randomUUID(),
      provider,
      threadId: record.session.threadId,
      createdAt,
      turnId: record.activeTurnId,
      method: 'token-usage.updated',
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
    });
    if (record.activeTurnId) {
      publish({
        eventId: crypto.randomUUID(),
        provider,
        threadId: record.session.threadId,
        createdAt,
        turnId: record.activeTurnId,
        method: 'turn.completed',
        finishReason:
          message.stop_reason === 'tool_use' ? 'tool-calls' : 'stop',
        outputText:
          message.type === 'result' && 'result' in message
            ? message.result
            : undefined,
      });
    }
    return;
  }

  if (message.type === 'assistant') {
    return;
  }

  if (message.type === 'auth_status' && message.error) {
    publish({
      eventId: crypto.randomUUID(),
      provider,
      threadId: record.session.threadId,
      createdAt,
      method: 'runtime.warning',
      severity: 'warning',
      message: message.error,
    });
  }
}

export function mapClaudeSessionState(
  state: 'idle' | 'running' | 'requires_action',
): 'idle' | 'running' | 'awaiting-approval' {
  if (state === 'requires_action') {
    return 'awaiting-approval';
  }
  return state;
}
