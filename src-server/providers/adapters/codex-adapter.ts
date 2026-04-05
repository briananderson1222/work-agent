import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import type {
  CanonicalRuntimeEvent,
  RequestOpenedEvent,
  RequestResolvedEvent,
} from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/shared';
import {
  adapterSessionStartDuration,
  adapterTurnDuration,
  providerOps,
} from '../../telemetry/metrics.js';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';
import { buildCliRuntimePrerequisites, findCliBinary } from '../cli-auth.js';
import type { CodexModelOptions } from './codex-models.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

interface CodexProcessLike {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'exit', listener: (code: number | null) => void): this;
}

interface PendingRpcRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface PendingApprovalRequest {
  rpcRequestId: string;
  method: string;
  title: string;
  threadId: string;
  payload: Record<string, unknown>;
}

interface CodexSessionRecord {
  externalThreadId: string;
  codexThreadId: string;
  process: CodexProcessLike;
  session: ProviderSession;
  rpcRequestCounter: number;
  pendingRpcRequests: Map<string, PendingRpcRequest>;
  pendingApprovals: Map<string, PendingApprovalRequest>;
  activeTurnId?: string;
  activeTurnStartedAt?: number;
  lastSessionState: 'idle' | 'running' | 'errored';
  turnOutput: Map<string, string>;
  toolNames: Map<string, string>;
  toolStarted: Set<string>;
}

interface CodexAdapterOptions {
  processFactory?: () => CodexProcessLike;
  now?: () => Date;
}

type JsonRpcRequest = {
  id?: string | number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  id: string | number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

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

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMethod(
  value: unknown,
): value is { method: string; params?: unknown } {
  return isRecord(value) && typeof value.method === 'string';
}

function hasId(value: unknown): value is { id: string | number } {
  return (
    isRecord(value) &&
    (typeof value.id === 'string' || typeof value.id === 'number')
  );
}

function mapReasoningEffort(options?: CodexModelOptions): string | null {
  if (!options?.reasoningEffort) return null;
  return options.reasoningEffort;
}

function mapSessionStatus(
  state: 'idle' | 'running' | 'errored',
): ProviderSession['status'] {
  if (state === 'running') return 'running';
  if (state === 'errored') return 'error';
  return 'ready';
}

function mapThreadStatusToState(
  status: unknown,
): 'idle' | 'running' | 'errored' {
  if (!isRecord(status) || typeof status.type !== 'string') return 'idle';
  if (status.type === 'active') return 'running';
  if (status.type === 'systemError') return 'errored';
  return 'idle';
}

function mapTurnFinishReason(status: unknown): 'stop' | 'cancelled' | 'other' {
  if (status === 'completed') return 'stop';
  if (status === 'interrupted') return 'cancelled';
  return 'other';
}

function mapToolCompletionStatus(
  status: unknown,
): 'success' | 'error' | 'cancelled' {
  if (status === 'completed') return 'success';
  if (status === 'declined') return 'cancelled';
  return 'error';
}

export class CodexAdapter implements ProviderAdapterShape {
  readonly provider = 'codex' as const;

  private readonly events = new AsyncEventQueue();
  private readonly sessions = new Map<string, CodexSessionRecord>();
  private readonly threadLookup = new Map<string, CodexSessionRecord>();
  private readonly processFactory: () => CodexProcessLike;
  private readonly now: () => Date;

  constructor(options: CodexAdapterOptions = {}) {
    this.processFactory = options.processFactory ?? (() => this.spawnProcess());
    this.now = options.now ?? (() => new Date());
  }

  async getPrerequisites(): Promise<Prerequisite[]> {
    return buildCliRuntimePrerequisites({
      command: 'codex',
      displayName: 'Codex',
      versionArgs: ['--version'],
      authArgs: ['login', 'status'],
      installStep: 'Install the Codex CLI and ensure `codex` is on PATH.',
      authStep: 'Run `codex login` before starting Stallion.',
    });
  }

  async startSession(
    input: ProviderSessionStartInput,
  ): Promise<ProviderSession> {
    const startedAt = Date.now();
    const processHandle = this.processFactory();
    const nowIso = this.now().toISOString();
    const record: CodexSessionRecord = {
      externalThreadId: input.threadId,
      codexThreadId: '',
      process: processHandle,
      session: {
        provider: this.provider,
        threadId: input.threadId,
        status: 'connecting',
        model: input.modelId,
        resumeCursor: input.resumeCursor,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      rpcRequestCounter: 0,
      pendingRpcRequests: new Map(),
      pendingApprovals: new Map(),
      lastSessionState: 'idle',
      turnOutput: new Map(),
      toolNames: new Map(),
      toolStarted: new Set(),
    };

    this.sessions.set(input.threadId, record);
    this.attachProcess(record);

    try {
      await this.sendRequest(record, 'initialize', {
        clientInfo: {
          name: 'stallion',
          title: 'Stallion AI',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: false,
        },
      });
      this.sendNotification(record, 'initialized');

      const modelOptions = (input.modelOptions ?? {}) as CodexModelOptions;
      const result = isResumeCursor(input.resumeCursor)
        ? await this.sendRequest(record, 'thread/resume', {
            threadId: input.resumeCursor.codexThreadId,
            cwd: input.cwd,
            model: input.modelId,
            serviceTier: modelOptions.fastMode ? 'fast' : null,
            persistExtendedHistory: false,
          })
        : await this.sendRequest(record, 'thread/start', {
            cwd: input.cwd,
            model: input.modelId,
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
            experimentalRawEvents: false,
            persistExtendedHistory: false,
            serviceTier: modelOptions.fastMode ? 'fast' : null,
          });

      const codexThread = extractThread(result);
      record.codexThreadId = codexThread.id;
      record.session = {
        ...record.session,
        status: 'ready',
        model: extractStringField(result, 'model') ?? input.modelId,
        updatedAt: this.now().toISOString(),
        resumeCursor: { codexThreadId: codexThread.id },
      };
      this.threadLookup.set(codexThread.id, record);

      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: input.threadId,
        createdAt: this.now().toISOString(),
        method: 'session.started',
        sessionId: input.threadId,
        initialState: 'created',
        metadata: {
          codexThreadId: codexThread.id,
        },
      });
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: input.threadId,
        createdAt: this.now().toISOString(),
        method: 'session.configured',
        sessionId: input.threadId,
        model: record.session.model,
        cwd: input.cwd,
        metadata: {
          reasoningEffort: mapReasoningEffort(modelOptions),
          fastMode: modelOptions.fastMode ?? false,
          codexThreadId: codexThread.id,
        },
      });

      providerOps.add(1, {
        operation: 'adapter-session-start',
        provider: this.provider,
      });
      adapterSessionStartDuration.record(Date.now() - startedAt, {
        provider: this.provider,
      });

      return record.session;
    } catch (error) {
      this.sessions.delete(input.threadId);
      record.process.kill();
      throw error;
    }
  }

  async sendTurn(
    input: ProviderSendTurnInput,
  ): Promise<ProviderTurnStartResult> {
    const record = this.requireSession(input.threadId);
    const turnStartedAt = Date.now();
    const modelOptions = (input.modelOptions ?? {}) as CodexModelOptions;
    const result = await this.sendRequest(record, 'turn/start', {
      threadId: record.codexThreadId,
      input: [
        {
          type: 'text',
          text: input.input,
          text_elements: [],
        },
      ],
      model: input.modelId,
      effort: mapReasoningEffort(modelOptions),
      serviceTier: modelOptions.fastMode ? 'fast' : undefined,
    });

    const turnId = extractTurn(result).id;
    record.activeTurnId = turnId;
    record.activeTurnStartedAt = turnStartedAt;
    record.turnOutput.set(turnId, '');
    record.session = {
      ...record.session,
      status: 'running',
      updatedAt: this.now().toISOString(),
      model: input.modelId ?? record.session.model,
    };

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: this.now().toISOString(),
      method: 'turn.started',
      turnId,
      prompt: input.input,
    });

    return {
      threadId: input.threadId,
      turnId,
      resumeCursor: { codexThreadId: record.codexThreadId, turnId },
    };
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<void> {
    const record = this.requireSession(threadId);
    const targetTurnId = turnId ?? record.activeTurnId;
    if (!targetTurnId) {
      return;
    }

    await this.sendRequest(record, 'turn/interrupt', {
      threadId: record.codexThreadId,
      turnId: targetTurnId,
    });

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: this.now().toISOString(),
      turnId: targetTurnId,
      method: 'turn.aborted',
      reason: 'interrupted',
    });
  }

  async respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void> {
    const record = this.requireSession(threadId);
    const pending = record.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(`Unknown Codex approval request: ${requestId}`);
    }

    record.pendingApprovals.delete(requestId);
    const result = buildApprovalResult(
      pending.method,
      pending.payload,
      decision,
    );
    this.sendResponse(record, pending.rpcRequestId, result);

    const statusByDecision: Record<
      RequestResolvedEvent['status'] | 'acceptForSession',
      RequestResolvedEvent['status']
    > = {
      approved: 'approved',
      denied: 'denied',
      cancelled: 'cancelled',
      expired: 'expired',
      acceptForSession: 'approved',
    };
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: this.now().toISOString(),
      requestId,
      method: 'request.resolved',
      status:
        decision === 'accept'
          ? statusByDecision.approved
          : decision === 'acceptForSession'
            ? statusByDecision.acceptForSession
            : decision === 'decline'
              ? statusByDecision.denied
              : statusByDecision.cancelled,
    });
  }

  async stopSession(threadId: string): Promise<void> {
    const record = this.sessions.get(threadId);
    if (!record) return;
    this.sessions.delete(threadId);
    this.threadLookup.delete(record.codexThreadId);
    record.process.kill();
    record.session = {
      ...record.session,
      status: 'closed',
      updatedAt: this.now().toISOString(),
    };
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: this.now().toISOString(),
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

  private spawnProcess(): ChildProcessWithoutNullStreams {
    const binary = findCliBinary('codex') ?? 'codex';
    return spawn(binary, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    });
  }

  private attachProcess(record: CodexSessionRecord): void {
    const stdout = createInterface({ input: record.process.stdout });
    stdout.on('line', (line) => this.handleStdoutLine(record, line));

    const stderr = createInterface({ input: record.process.stderr });
    stderr.on('line', (line) => {
      if (!line.trim()) return;
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.externalThreadId,
        createdAt: this.now().toISOString(),
        method: 'runtime.warning',
        severity: 'warning',
        message: line.trim(),
        code: 'codex-stderr',
      });
    });

    record.process.on('exit', (code) => {
      const now = this.now().toISOString();
      for (const pending of record.pendingRpcRequests.values()) {
        pending.reject(
          new Error(
            `Codex app-server exited before responding (code: ${code ?? 'unknown'})`,
          ),
        );
      }
      record.pendingRpcRequests.clear();
      this.sessions.delete(record.externalThreadId);
      if (record.codexThreadId) {
        this.threadLookup.delete(record.codexThreadId);
      }
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.externalThreadId,
        createdAt: now,
        method: 'session.exited',
        sessionId: record.externalThreadId,
        exitCode: code ?? undefined,
        reason: code === 0 ? 'completed' : 'process-exit',
      });
    });
  }

  private handleStdoutLine(record: CodexSessionRecord, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: record.externalThreadId,
        createdAt: this.now().toISOString(),
        method: 'runtime.warning',
        severity: 'warning',
        message: `Failed to parse Codex JSON-RPC payload: ${trimmed}`,
        code: 'codex-json-parse',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    if (hasMethod(message) && hasId(message)) {
      this.handleServerRequest(
        record,
        message as JsonRpcRequest & { id: string | number },
      );
      return;
    }

    if (hasMethod(message)) {
      this.handleNotification(message as { method: string; params?: unknown });
      return;
    }

    if (hasId(message)) {
      this.handleResponse(record, message as JsonRpcResponse);
    }
  }

  private handleResponse(
    record: CodexSessionRecord,
    response: JsonRpcResponse,
  ): void {
    const requestId = String(response.id);
    const pending = record.pendingRpcRequests.get(requestId);
    if (!pending) return;
    record.pendingRpcRequests.delete(requestId);
    if (response.error) {
      pending.reject(
        new Error(
          response.error.message ??
            `Codex JSON-RPC error (${response.error.code ?? 'unknown'})`,
        ),
      );
      return;
    }
    pending.resolve(response.result);
  }

  private handleServerRequest(
    record: CodexSessionRecord,
    request: JsonRpcRequest & { id: string | number },
  ): void {
    const requestId = String(request.id);
    const canonicalRequestId = crypto.randomUUID();
    const event = mapServerRequestToEvent(
      record.externalThreadId,
      canonicalRequestId,
      request.method,
      request.params,
      this.now().toISOString(),
    );
    if (!event) {
      this.sendErrorResponse(
        record,
        requestId,
        `Unsupported server request: ${request.method}`,
      );
      return;
    }

    record.pendingApprovals.set(canonicalRequestId, {
      rpcRequestId: requestId,
      method: request.method,
      title: event.title,
      threadId: record.externalThreadId,
      payload: (request.params ?? {}) as Record<string, unknown>,
    });
    this.publish(event);
  }

  private handleNotification(notification: {
    method: string;
    params?: unknown;
  }): void {
    const threadId = extractThreadId(notification.params);
    const record = threadId ? this.threadLookup.get(threadId) : undefined;
    const externalThreadId = record?.externalThreadId;

    if (!record && threadId) {
      return;
    }

    switch (notification.method) {
      case 'thread/status/changed': {
        if (!record || !isRecord(notification.params)) return;
        const nextState = mapThreadStatusToState(notification.params.status);
        if (record.lastSessionState === nextState) return;
        const previousState = record.lastSessionState;
        record.lastSessionState = nextState;
        record.session = {
          ...record.session,
          status: mapSessionStatus(nextState),
          updatedAt: this.now().toISOString(),
        };
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'session.state-changed',
          sessionId: externalThreadId!,
          from:
            previousState === 'running'
              ? 'running'
              : previousState === 'errored'
                ? 'errored'
                : 'idle',
          to:
            nextState === 'running'
              ? 'running'
              : nextState === 'errored'
                ? 'errored'
                : 'idle',
        });
        return;
      }
      case 'item/agentMessage/delta': {
        if (!record || !isRecord(notification.params)) return;
        const turnId = extractString(notification.params.turnId);
        const itemId = extractString(notification.params.itemId);
        const delta = extractString(notification.params.delta);
        if (!turnId || !itemId || !delta) return;
        record.turnOutput.set(
          turnId,
          `${record.turnOutput.get(turnId) ?? ''}${delta}`,
        );
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'content.text-delta',
          turnId,
          itemId,
          delta,
        });
        return;
      }
      case 'item/reasoning/textDelta': {
        if (!record || !isRecord(notification.params)) return;
        const turnId = extractString(notification.params.turnId);
        const itemId = extractString(notification.params.itemId);
        const delta = extractString(notification.params.delta);
        if (!turnId || !itemId || !delta) return;
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'content.reasoning-delta',
          turnId,
          itemId,
          delta,
        });
        return;
      }
      case 'thread/tokenUsage/updated': {
        if (
          !record ||
          !isRecord(notification.params) ||
          !isRecord(notification.params.tokenUsage)
        ) {
          return;
        }
        const usage = isRecord(notification.params.tokenUsage.total)
          ? notification.params.tokenUsage.total
          : notification.params.tokenUsage;
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'token-usage.updated',
          turnId: extractString(notification.params.turnId) ?? undefined,
          promptTokens: extractNumber(usage.inputTokens) ?? undefined,
          completionTokens: extractNumber(usage.outputTokens) ?? undefined,
          totalTokens: extractNumber(usage.totalTokens) ?? undefined,
          cacheReadTokens: extractNumber(usage.cachedInputTokens) ?? undefined,
        });
        return;
      }
      case 'item/started': {
        this.handleItemStarted(record, notification.params);
        return;
      }
      case 'item/completed': {
        this.handleItemCompleted(record, notification.params);
        return;
      }
      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta':
      case 'item/mcpToolCall/progress': {
        if (!record || !isRecord(notification.params)) return;
        const turnId = extractString(notification.params.turnId);
        const itemId = extractString(notification.params.itemId);
        const message =
          extractString(notification.params.delta) ??
          extractString(notification.params.message);
        if (!turnId || !itemId || !message) return;
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'tool.progress',
          turnId,
          itemId,
          toolCallId: itemId,
          message,
        });
        return;
      }
      case 'turn/completed': {
        if (
          !record ||
          !isRecord(notification.params) ||
          !isRecord(notification.params.turn)
        )
          return;
        const turnId = extractString(notification.params.turn.id);
        if (!turnId) return;
        const outputText = record.turnOutput.get(turnId);
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'turn.completed',
          turnId,
          finishReason: mapTurnFinishReason(notification.params.turn.status),
          outputText,
        });
        if (record.activeTurnStartedAt) {
          adapterTurnDuration.record(Date.now() - record.activeTurnStartedAt, {
            provider: this.provider,
          });
        }
        record.activeTurnId = undefined;
        record.activeTurnStartedAt = undefined;
        record.session = {
          ...record.session,
          status: 'ready',
          updatedAt: this.now().toISOString(),
          resumeCursor: { codexThreadId: record.codexThreadId, turnId },
        };
        providerOps.add(1, {
          operation: 'adapter-turn-complete',
          provider: this.provider,
        });
        return;
      }
      case 'error': {
        if (
          !record ||
          !isRecord(notification.params) ||
          !isRecord(notification.params.error)
        )
          return;
        this.publish({
          eventId: crypto.randomUUID(),
          provider: this.provider,
          threadId: externalThreadId!,
          createdAt: this.now().toISOString(),
          method: 'runtime.error',
          severity: 'error',
          turnId: extractString(notification.params.turnId) ?? undefined,
          message:
            extractString(notification.params.error.message) ??
            'Codex runtime error',
          retriable: Boolean(notification.params.willRetry),
          details: {
            additionalDetails: extractString(
              notification.params.error.additionalDetails,
            ),
          },
        });
        return;
      }
      default:
        return;
    }
  }

  private handleItemStarted(
    record: CodexSessionRecord | undefined,
    params: unknown,
  ): void {
    if (!record || !isRecord(params) || !isRecord(params.item)) return;
    const turnId = extractString(params.turnId);
    const itemId = extractString(params.item.id);
    const type = extractString(params.item.type);
    if (!turnId || !itemId || !type) return;

    const toolName = deriveToolName(params.item);
    if (!toolName) return;
    record.toolNames.set(itemId, toolName);
    record.toolStarted.add(itemId);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: record.externalThreadId,
      createdAt: this.now().toISOString(),
      method: 'tool.started',
      turnId,
      itemId,
      toolCallId: itemId,
      toolName,
      arguments: deriveToolArguments(params.item),
    });
  }

  private handleItemCompleted(
    record: CodexSessionRecord | undefined,
    params: unknown,
  ): void {
    if (!record || !isRecord(params) || !isRecord(params.item)) return;
    const turnId = extractString(params.turnId);
    const itemId = extractString(params.item.id);
    if (!turnId || !itemId) return;
    const toolName = record.toolNames.get(itemId);
    if (!toolName || !record.toolStarted.has(itemId)) return;
    record.toolStarted.delete(itemId);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: record.externalThreadId,
      createdAt: this.now().toISOString(),
      method: 'tool.completed',
      turnId,
      itemId,
      toolCallId: itemId,
      toolName,
      status: mapToolCompletionStatus(extractToolStatus(params.item)),
      output: deriveToolOutput(params.item),
      error: extractToolError(params.item),
    });
  }

  private sendNotification(
    record: CodexSessionRecord,
    method: string,
    params?: unknown,
  ): void {
    const payload =
      params === undefined
        ? { jsonrpc: '2.0', method }
        : { jsonrpc: '2.0', method, params };
    record.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private sendResponse(
    record: CodexSessionRecord,
    requestId: string,
    result: unknown,
  ): void {
    record.process.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: requestId, result })}\n`,
    );
  }

  private sendErrorResponse(
    record: CodexSessionRecord,
    requestId: string,
    message: string,
  ): void {
    record.process.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32601, message },
      })}\n`,
    );
  }

  private async sendRequest<T = unknown>(
    record: CodexSessionRecord,
    method: string,
    params?: unknown,
  ): Promise<T> {
    const id = String(++record.rpcRequestCounter);
    const payload =
      params === undefined
        ? { jsonrpc: '2.0', id, method }
        : { jsonrpc: '2.0', id, method, params };
    const response = new Promise<T>((resolve, reject) => {
      record.pendingRpcRequests.set(id, { resolve, reject });
    });
    record.process.stdin.write(`${JSON.stringify(payload)}\n`);
    return response;
  }

  private requireSession(threadId: string): CodexSessionRecord {
    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error(`Codex session not found for thread: ${threadId}`);
    }
    return record;
  }

  private publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }
}

function isResumeCursor(value: unknown): value is { codexThreadId: string } {
  return isRecord(value) && typeof value.codexThreadId === 'string';
}

function extractThread(result: unknown): { id: string } {
  if (
    !isRecord(result) ||
    !isRecord(result.thread) ||
    typeof result.thread.id !== 'string'
  ) {
    throw new Error('Codex thread response did not include a thread id');
  }
  return { id: result.thread.id };
}

function extractTurn(result: unknown): { id: string } {
  if (
    !isRecord(result) ||
    !isRecord(result.turn) ||
    typeof result.turn.id !== 'string'
  ) {
    throw new Error('Codex turn response did not include a turn id');
  }
  return { id: result.turn.id };
}

function extractThreadId(params: unknown): string | undefined {
  if (!isRecord(params) || typeof params.threadId !== 'string')
    return undefined;
  return params.threadId;
}

function extractString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function extractStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null;
  return extractString(value[field]);
}

function extractNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function mapServerRequestToEvent(
  threadId: string,
  requestId: string,
  method: string,
  params: unknown,
  createdAt: string,
): RequestOpenedEvent | null {
  const payload = isRecord(params) ? params : {};
  switch (method) {
    case 'item/permissions/requestApproval':
      return {
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId,
        createdAt,
        requestId,
        method: 'request.opened',
        requestType: 'permission',
        title: 'Approve permissions',
        description:
          extractString(payload.reason) ??
          'Codex requested additional permissions.',
        payload,
      };
    case 'item/commandExecution/requestApproval':
      return {
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId,
        createdAt,
        requestId,
        method: 'request.opened',
        requestType: 'approval',
        title: extractString(payload.command) ?? 'Approve command execution',
        description: extractString(payload.reason) ?? undefined,
        payload,
      };
    case 'item/fileChange/requestApproval':
      return {
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId,
        createdAt,
        requestId,
        method: 'request.opened',
        requestType: 'approval',
        title: 'Approve file changes',
        description: extractString(payload.reason) ?? undefined,
        payload,
      };
    default:
      return null;
  }
}

function buildApprovalResult(
  method: string,
  payload: Record<string, unknown>,
  decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
): unknown {
  switch (method) {
    case 'item/permissions/requestApproval':
      return {
        permissions: payload.permissions ?? {},
        scope: decision === 'acceptForSession' ? 'session' : 'turn',
      };
    case 'item/commandExecution/requestApproval':
      return { decision };
    case 'item/fileChange/requestApproval':
      return { decision };
    default:
      throw new Error(`Unsupported Codex approval request method: ${method}`);
  }
}

function deriveToolName(item: Record<string, unknown>): string | null {
  switch (item.type) {
    case 'commandExecution':
      return 'shell_exec';
    case 'mcpToolCall':
      return `${extractString(item.server) ?? 'mcp'}/${extractString(item.tool) ?? 'tool'}`;
    case 'dynamicToolCall':
      return extractString(item.tool) ?? 'dynamic_tool';
    case 'fileChange':
      return 'apply_patch';
    default:
      return null;
  }
}

function deriveToolArguments(item: Record<string, unknown>): unknown {
  switch (item.type) {
    case 'commandExecution':
      return {
        command: extractString(item.command),
        cwd: extractString(item.cwd),
      };
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return item.arguments;
    case 'fileChange':
      return {
        changes: item.changes,
      };
    default:
      return undefined;
  }
}

function deriveToolOutput(item: Record<string, unknown>): unknown {
  switch (item.type) {
    case 'commandExecution':
      return {
        output: item.aggregatedOutput,
        exitCode: item.exitCode,
        durationMs: item.durationMs,
      };
    case 'mcpToolCall':
      return item.result;
    case 'dynamicToolCall':
      return item.contentItems;
    case 'fileChange':
      return item.changes;
    default:
      return undefined;
  }
}

function extractToolStatus(item: Record<string, unknown>): unknown {
  return item.status;
}

function extractToolError(item: Record<string, unknown>): string | undefined {
  if (item.type === 'mcpToolCall' && isRecord(item.error)) {
    return extractString(item.error.message) ?? undefined;
  }
  return undefined;
}
