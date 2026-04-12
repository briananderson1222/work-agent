import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import { findCliBinary } from '../cli-auth.js';
import {
  extractThreadId,
  hasId,
  hasMethod,
  mapServerRequestToEvent,
} from './codex-adapter-events.js';
import { handleCodexNotification } from './codex-adapter-notifications.js';
import type {
  CodexProcessLike,
  CodexSessionRecord,
} from './codex-adapter-types.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
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

export function createCodexProcess(
  processFactory?: () => CodexProcessLike,
): CodexProcessLike {
  return processFactory ? processFactory() : spawnCodexProcess();
}

export function createCodexSessionRecord(options: {
  externalThreadId: string;
  process: CodexProcessLike;
  provider: 'codex';
  threadId: string;
  model: string;
  resumeCursor?: unknown;
  nowIso: () => string;
}): CodexSessionRecord {
  const {
    externalThreadId,
    process,
    provider,
    threadId,
    model,
    resumeCursor,
    nowIso,
  } = options;
  return {
    externalThreadId,
    codexThreadId: '',
    process,
    session: {
      provider,
      threadId,
      status: 'connecting',
      model,
      resumeCursor,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    rpcRequestCounter: 0,
    pendingRpcRequests: new Map(),
    pendingApprovals: new Map(),
    lastSessionState: 'idle',
    turnOutput: new Map(),
    toolNames: new Map(),
    toolStarted: new Set(),
  };
}

export class CodexAdapterTransport {
  private readonly events = new AsyncEventQueue();
  private readonly sessions = new Map<string, CodexSessionRecord>();
  private readonly threadLookup = new Map<string, CodexSessionRecord>();

  constructor(private readonly now: () => Date) {}

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  registerSession(record: CodexSessionRecord): void {
    this.sessions.set(record.externalThreadId, record);
  }

  unregisterSession(record: CodexSessionRecord): void {
    this.sessions.delete(record.externalThreadId);
    if (record.codexThreadId) {
      this.threadLookup.delete(record.codexThreadId);
    }
  }

  setCodexThreadId(record: CodexSessionRecord, codexThreadId: string): void {
    record.codexThreadId = codexThreadId;
    this.threadLookup.set(codexThreadId, record);
  }

  handleProcess(record: CodexSessionRecord): void {
    const stdout = createInterface({ input: record.process.stdout });
    stdout.on('line', (line) => this.handleStdoutLine(record, line));

    const stderr = createInterface({ input: record.process.stderr });
    stderr.on('line', (line) => {
      if (!line.trim()) return;
      this.publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: this.now().toISOString(),
        method: 'runtime.warning',
        severity: 'warning',
        message: line.trim(),
        code: 'codex-stderr',
      });
    });

    record.process.on('exit', (code) => {
      const nowIso = this.now().toISOString();
      for (const pending of record.pendingRpcRequests.values()) {
        pending.reject(
          new Error(
            `Codex app-server exited before responding (code: ${code ?? 'unknown'})`,
          ),
        );
      }
      record.pendingRpcRequests.clear();
      this.unregisterSession(record);
      this.publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso,
        method: 'session.exited',
        sessionId: record.externalThreadId,
        exitCode: code ?? undefined,
        reason: code === 0 ? 'completed' : 'process-exit',
      });
    });
  }

  handleStdoutLine(record: CodexSessionRecord, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
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

  sendNotification(
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

  sendResponse(
    record: CodexSessionRecord,
    requestId: string,
    result: unknown,
  ): void {
    record.process.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: requestId, result })}\n`,
    );
  }

  sendErrorResponse(
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

  async sendRequest<T = unknown>(
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

  requireSession(threadId: string): CodexSessionRecord {
    const record = this.sessions.get(threadId);
    if (!record) {
      throw new Error(`Codex session not found for thread: ${threadId}`);
    }
    return record;
  }

  publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }

  listSessions(): CodexSessionRecord[] {
    return [...this.sessions.values()];
  }

  hasSession(threadId: string): boolean {
    return this.sessions.has(threadId);
  }

  stopSession(threadId: string, nowIso: () => string): void {
    const record = this.sessions.get(threadId);
    if (!record) {
      return;
    }
    this.unregisterSession(record);
    record.process.kill();
    record.session = {
      ...record.session,
      status: 'closed',
      updatedAt: nowIso(),
    };
    this.publish({
      eventId: crypto.randomUUID(),
      provider: 'codex',
      threadId,
      createdAt: nowIso(),
      method: 'session.exited',
      sessionId: threadId,
      reason: 'stopped',
    });
  }

  stopAll(nowIso: () => string): void {
    for (const threadId of [...this.sessions.keys()]) {
      this.stopSession(threadId, nowIso);
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

    if (!record && threadId) {
      return;
    }

    handleCodexNotification({
      record,
      notification,
      nowIso: () => this.now().toISOString(),
      publish: (event) => this.publish(event),
    });
  }
}

function spawnCodexProcess(): ChildProcessWithoutNullStreams {
  const binary = findCliBinary('codex') ?? 'codex';
  return spawn(binary, ['app-server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
    windowsHide: true,
  });
}
