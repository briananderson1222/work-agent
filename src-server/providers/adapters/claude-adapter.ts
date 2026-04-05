import crypto from 'node:crypto';
import {
  type Options,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/shared';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';
import { buildCliRuntimePrerequisites } from '../cli-auth.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class AsyncEventQueue implements AsyncIterable<CanonicalRuntimeEvent> {
  private items: CanonicalRuntimeEvent[] = [];
  private waiters: Array<Deferred<IteratorResult<CanonicalRuntimeEvent>>> = [];

  push(event: CanonicalRuntimeEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    this.items.push(event);
  }

  [Symbol.asyncIterator](): AsyncIterator<CanonicalRuntimeEvent> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) return { value: queued, done: false };
        const waiter = createDeferred<IteratorResult<CanonicalRuntimeEvent>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

class AsyncUserMessageQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiters: Array<Deferred<IteratorResult<SDKUserMessage>>> = [];
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: message, done: false });
      return;
    }
    this.items.push(message);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) return { value: queued, done: false };
        if (this.closed) return { value: undefined as never, done: true };
        const waiter = createDeferred<IteratorResult<SDKUserMessage>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

type PendingRequest = {
  resolve: (result: PermissionResult) => void;
  suggestions?: PermissionUpdate[];
};

type ClaudeSessionRecord = {
  session: ProviderSession;
  promptQueue: AsyncUserMessageQueue;
  query: Query;
  pendingRequests: Map<string, PendingRequest>;
  activeTurnId?: string;
  lastSessionState: 'idle' | 'running' | 'requires_action';
  streamTask: Promise<void>;
};

export class ClaudeAdapter implements ProviderAdapterShape {
  readonly provider = 'claude' as const;

  private readonly events = new AsyncEventQueue();
  private readonly sessions = new Map<string, ClaudeSessionRecord>();

  async startSession(
    input: ProviderSessionStartInput,
  ): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const promptQueue = new AsyncUserMessageQueue();
    const sdkQuery = query({
      prompt: promptQueue,
      options: this.buildOptions(input),
    });

    const session: ProviderSession = {
      provider: this.provider,
      threadId: input.threadId,
      status: 'connecting',
      model: input.modelId,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
    };

    const record: ClaudeSessionRecord = {
      session,
      promptQueue,
      query: sdkQuery,
      pendingRequests: new Map(),
      lastSessionState: 'idle',
      streamTask: Promise.resolve(),
    };
    record.streamTask = this.consumeMessages(record);
    this.sessions.set(input.threadId, record);

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      method: 'session.started',
      sessionId: input.threadId,
      initialState: 'created',
      metadata: { cwd: input.cwd },
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      method: 'session.configured',
      sessionId: input.threadId,
      model: input.modelId,
      cwd: input.cwd,
      metadata: input.modelOptions,
    });

    return session;
  }

  async sendTurn(
    input: ProviderSendTurnInput,
  ): Promise<ProviderTurnStartResult> {
    const record = this.requireSession(input.threadId);
    const turnId = crypto.randomUUID();
    record.activeTurnId = turnId;
    record.promptQueue.push({
      type: 'user',
      message: {
        role: 'user',
        content: input.input,
      },
      parent_tool_use_id: null,
      session_id: input.threadId,
      uuid: turnId,
      timestamp: new Date().toISOString(),
    });

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      turnId,
      method: 'turn.started',
      prompt: input.input,
    });

    return {
      threadId: input.threadId,
      turnId,
      resumeCursor: record.session.resumeCursor,
    };
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<void> {
    const record = this.requireSession(threadId);
    await record.query.interrupt();
    if (turnId) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId,
        createdAt: new Date().toISOString(),
        turnId,
        method: 'turn.aborted',
        reason: 'interrupted',
      });
    }
  }

  async respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void> {
    const record = this.requireSession(threadId);
    const pending = record.pendingRequests.get(requestId);
    if (!pending) {
      throw new Error(`Unknown Claude permission request: ${requestId}`);
    }

    record.pendingRequests.delete(requestId);
    if (decision === 'accept' || decision === 'acceptForSession') {
      pending.resolve({
        behavior: 'allow',
        updatedPermissions:
          decision === 'acceptForSession' ? pending.suggestions : undefined,
      });
    } else {
      pending.resolve({
        behavior: 'deny',
        message:
          decision === 'decline'
            ? 'User declined the permission request.'
            : 'User cancelled the permission request.',
        interrupt: decision === 'cancel',
      });
    }

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: new Date().toISOString(),
      requestId,
      method: 'request.resolved',
      status:
        decision === 'accept' || decision === 'acceptForSession'
          ? 'approved'
          : decision === 'decline'
            ? 'denied'
            : 'cancelled',
    });
  }

  async stopSession(threadId: string): Promise<void> {
    const record = this.sessions.get(threadId);
    if (!record) return;
    record.promptQueue.close();
    record.query.close();
    this.sessions.delete(threadId);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: new Date().toISOString(),
      method: 'session.exited',
      sessionId: threadId,
      reason: 'stopped',
    });
  }

  async listSessions(): Promise<ProviderSession[]> {
    return [...this.sessions.values()].map((record) => record.session);
  }

  async hasSession(threadId: string): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.keys()].map((threadId) => this.stopSession(threadId)),
    );
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  async getPrerequisites(): Promise<Prerequisite[]> {
    return buildCliRuntimePrerequisites({
      command: 'claude',
      displayName: 'Claude',
      versionArgs: ['--version'],
      authArgs: ['auth', 'status'],
      installStep: 'Install the Claude CLI and ensure `claude` is on PATH.',
      authStep: 'Run `claude auth login` before starting Stallion.',
    });
  }

  private buildOptions(input: ProviderSessionStartInput): Options {
    return {
      cwd: input.cwd,
      model: input.modelId,
      resume:
        typeof input.resumeCursor === 'string' ? input.resumeCursor : undefined,
      includePartialMessages: true,
      persistSession: false,
      canUseTool: async (toolName, toolInput, options) => {
        const requestId = crypto.randomUUID();
        const record = this.requireSession(input.threadId);
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          requestId,
          method: 'request.opened',
          requestType: 'approval',
          title: options.title ?? `Allow ${toolName}`,
          description: options.description,
          payload: {
            toolName,
            toolInput,
            blockedPath: options.blockedPath,
            displayName: options.displayName,
            suggestions: options.suggestions,
          },
        });

        return await new Promise<PermissionResult>((resolve) => {
          record.pendingRequests.set(requestId, {
            resolve,
            suggestions: options.suggestions,
          });
        });
      },
      permissionMode:
        input.modelOptions?.permissionMode === 'plan' ? 'plan' : 'default',
      thinking:
        input.modelOptions?.thinking === false
          ? { type: 'disabled' }
          : undefined,
      effort:
        input.modelOptions?.effort === 'low' ||
        input.modelOptions?.effort === 'medium' ||
        input.modelOptions?.effort === 'high' ||
        input.modelOptions?.effort === 'max'
          ? input.modelOptions.effort
          : undefined,
    };
  }

  private async consumeMessages(record: ClaudeSessionRecord): Promise<void> {
    try {
      for await (const message of record.query) {
        this.mapMessage(record, message);
      }
    } catch (error) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.session.threadId,
        createdAt: new Date().toISOString(),
        method: 'runtime.error',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      record.session.status = 'error';
    }
  }

  private mapMessage(record: ClaudeSessionRecord, message: SDKMessage): void {
    const createdAt = new Date().toISOString();
    if (
      message.type === 'system' &&
      message.subtype === 'session_state_changed'
    ) {
      const from = this.mapSessionState(record.lastSessionState);
      const to = this.mapSessionState(message.state);
      record.lastSessionState = message.state;
      record.session.status =
        message.state === 'running'
          ? 'running'
          : message.state === 'requires_action'
            ? 'ready'
            : 'ready';
      record.session.updatedAt = createdAt;
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
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
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
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
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
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
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
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
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.session.threadId,
        createdAt,
        turnId: record.activeTurnId,
        method: 'token-usage.updated',
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      });
      if (record.activeTurnId) {
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
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
      const content = (message.message as any)?.content;
      const textParts = Array.isArray(content)
        ? content
            .filter(
              (part: any) =>
                part?.type === 'text' && typeof part.text === 'string',
            )
            .map((part: any) => part.text)
            .join('')
        : '';
      if (textParts) {
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: record.session.threadId,
          createdAt,
          turnId: record.activeTurnId,
          itemId: `${message.session_id}:${message.uuid}`,
          method: 'content.text-delta',
          delta: textParts,
        });
      }
      return;
    }

    if (message.type === 'auth_status' && message.error) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.session.threadId,
        createdAt,
        method: 'runtime.warning',
        severity: 'warning',
        message: message.error,
      });
    }
  }

  private mapSessionState(
    state: 'idle' | 'running' | 'requires_action',
  ): 'idle' | 'running' | 'awaiting-approval' {
    if (state === 'requires_action') return 'awaiting-approval';
    return state;
  }

  private publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }

  private requireSession(threadId: string): ClaudeSessionRecord {
    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error(`Unknown Claude session: ${threadId}`);
    }
    return record;
  }
}
