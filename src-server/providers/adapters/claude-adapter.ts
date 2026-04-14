import crypto from 'node:crypto';
import {
  type Options,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  query,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/contracts/tool';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';
import { buildCliRuntimePrerequisites } from '../cli-auth.js';
import {
  type ClaudeMessageState,
  mapClaudeSdkMessage,
} from './claude-adapter-events.js';
import {
  AsyncEventQueue,
  AsyncUserMessageQueue,
} from './claude-adapter-queues.js';

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
  readonly metadata = {
    displayName: 'Claude Runtime',
    description:
      'Claude Agent SDK runtime with approvals and reasoning events.',
    capabilities: [
      'agent-runtime',
      'session-lifecycle',
      'tool-calls',
      'interrupt',
      'approvals',
      'reasoning-events',
    ],
    runtimeId: 'claude-runtime',
    builtin: true,
    executionClass: 'connected',
  } as const;

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

  async listModels(): Promise<
    Array<{
      id: string;
      name: string;
      originalId: string;
    }>
  > {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim() || null;
    if (!apiKey && !authToken) {
      return [];
    }

    const client = new Anthropic({
      apiKey,
      authToken,
    });
    const page = await client.models.list({ limit: 100 });
    return (page.data ?? []).map((model) => ({
      id: model.id,
      name: model.display_name || model.id,
      originalId: model.id,
    }));
  }

  async getCommands() {
    return [
      {
        name: 'compact',
        description: 'Compact conversation context',
        passthrough: true,
      },
      {
        name: 'clear',
        description: 'Clear conversation history',
        passthrough: true,
      },
      {
        name: 'undo',
        description: 'Undo last assistant action',
        passthrough: true,
      },
      {
        name: 'resume',
        description: 'Resume a previous session',
        passthrough: true,
      },
      {
        name: 'help',
        description: 'Show available commands',
        passthrough: true,
      },
      {
        name: 'init',
        description: 'Reset session to initial state',
        passthrough: true,
      },
      { name: 'bug', description: 'Report a bug', passthrough: true },
      { name: 'doctor', description: 'Run diagnostics', passthrough: true },
    ];
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
    mapClaudeSdkMessage({
      provider: this.provider,
      record: record as ClaudeMessageState,
      message,
      publish: (event) => this.publish(event),
    });
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
