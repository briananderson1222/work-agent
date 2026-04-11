import crypto from 'node:crypto';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/contracts/tool';
import {
  adapterSessionStartDuration,
  providerOps,
} from '../../telemetry/metrics.js';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';
import { buildCliRuntimePrerequisites } from '../cli-auth.js';
import {
  buildApprovalResult,
  extractStringField,
  extractThread,
  extractTurn,
  isResumeCursor,
  mapApprovalResolutionStatus,
} from './codex-adapter-events.js';
import type { CodexModelOptions } from './codex-models.js';
import {
  CodexAdapterTransport,
  createCodexProcess,
  createCodexSessionRecord,
} from './codex-adapter-transport.js';

interface CodexAdapterOptions {
  processFactory?: () => ReturnType<typeof createCodexProcess>;
  now?: () => Date;
}

function mapReasoningEffort(options?: CodexModelOptions): string | null {
  if (!options?.reasoningEffort) return null;
  return options.reasoningEffort;
}

export class CodexAdapter implements ProviderAdapterShape {
  readonly provider = 'codex' as const;

  private readonly transport: CodexAdapterTransport;
  private readonly processFactory: () => ReturnType<typeof createCodexProcess>;
  private readonly now: () => Date;

  constructor(options: CodexAdapterOptions = {}) {
    this.processFactory = options.processFactory ?? (() => createCodexProcess());
    this.now = options.now ?? (() => new Date());
    this.transport = new CodexAdapterTransport(this.now);
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
    const record = createCodexSessionRecord({
      externalThreadId: input.threadId,
      process: processHandle,
      provider: this.provider,
      threadId: input.threadId,
      model: input.modelId ?? '',
      resumeCursor: input.resumeCursor,
      nowIso: () => this.now().toISOString(),
    });

    this.transport.registerSession(record);
    this.transport.handleProcess(record);

    try {
      await this.transport.sendRequest(record, 'initialize', {
        clientInfo: {
          name: 'stallion',
          title: 'Stallion AI',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: false,
        },
      });
      this.transport.sendNotification(record, 'initialized');

      const modelOptions = (input.modelOptions ?? {}) as CodexModelOptions;
      const result = isResumeCursor(input.resumeCursor)
        ? await this.transport.sendRequest(record, 'thread/resume', {
            threadId: input.resumeCursor.codexThreadId,
            cwd: input.cwd,
            model: input.modelId,
            serviceTier: modelOptions.fastMode ? 'fast' : null,
            persistExtendedHistory: false,
          })
        : await this.transport.sendRequest(record, 'thread/start', {
            cwd: input.cwd,
            model: input.modelId,
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
            experimentalRawEvents: false,
            persistExtendedHistory: false,
            serviceTier: modelOptions.fastMode ? 'fast' : null,
          });

      const codexThread = extractThread(result);
      this.transport.setCodexThreadId(record, codexThread.id);
      record.session = {
        ...record.session,
        status: 'ready',
        model: extractStringField(result, 'model') ?? input.modelId,
        updatedAt: this.now().toISOString(),
        resumeCursor: { codexThreadId: codexThread.id },
      };

      this.transport.publish({
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
      this.transport.publish({
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
      this.transport.unregisterSession(record);
      record.process.kill();
      throw error;
    }
  }

  async sendTurn(
    input: ProviderSendTurnInput,
  ): Promise<ProviderTurnStartResult> {
    const record = this.transport.requireSession(input.threadId);
    const turnStartedAt = Date.now();
    const modelOptions = (input.modelOptions ?? {}) as CodexModelOptions;
    const result = await this.transport.sendRequest(record, 'turn/start', {
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

    this.transport.publish({
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
    const record = this.transport.requireSession(threadId);
    const targetTurnId = turnId ?? record.activeTurnId;
    if (!targetTurnId) {
      return;
    }

    await this.transport.sendRequest(record, 'turn/interrupt', {
      threadId: record.codexThreadId,
      turnId: targetTurnId,
    });

    this.transport.publish({
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
    const record = this.transport.requireSession(threadId);
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
    this.transport.sendResponse(record, pending.rpcRequestId, result);

    this.transport.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: this.now().toISOString(),
      requestId,
      method: 'request.resolved',
      status: mapApprovalResolutionStatus(decision),
    });
  }

  async stopSession(threadId: string): Promise<void> {
    this.transport.stopSession(threadId, () => this.now().toISOString());
  }

  async listSessions(): Promise<ProviderSession[]> {
    return this.transport.listSessions().map((record) => record.session);
  }

  async hasSession(threadId: string): Promise<boolean> {
    return this.transport.hasSession(threadId);
  }

  async stopAll(): Promise<void> {
    this.transport.stopAll(() => this.now().toISOString());
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.transport.streamEvents();
  }
}
