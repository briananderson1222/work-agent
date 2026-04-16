import crypto from 'node:crypto';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  CanonicalRuntimeEvent,
  RequestResolvedEvent,
} from '@stallion-ai/contracts/runtime-events';
import type { Prerequisite } from '@stallion-ai/contracts/tool';
import type {
  ProviderAdapterShape,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
} from '../adapter-shape.js';
import { checkBedrockCredentials } from '../bedrock.js';
import { BedrockLLMProvider } from '../bedrock-llm-provider.js';
import type { LLMMessage } from '../model-provider-types.js';

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

export interface BedrockAdapterCallbacks {
  startSession?(
    input: ProviderSessionStartInput,
  ): Promise<Partial<ProviderSession> | undefined>;
  sendTurn?(
    input: ProviderSendTurnInput,
  ): Promise<
    (Partial<ProviderTurnStartResult> & { outputText?: string }) | undefined
  >;
  interruptTurn?(threadId: string, turnId?: string): Promise<void>;
  respondToRequest?(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void>;
  stopSession?(threadId: string): Promise<void>;
  stopAll?(): Promise<void>;
}

interface BedrockSession extends ProviderSession {
  systemPrompt?: string;
  history: LLMMessage[];
}

export class BedrockAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'bedrock';
  readonly metadata = {
    displayName: 'Managed Runtime',
    description: 'Built-in Stallion runtime backed by VoltAgent/Strands.',
    capabilities: [
      'agent-runtime',
      'session-lifecycle',
      'tool-calls',
      'interrupt',
    ],
    runtimeId: 'bedrock-runtime',
    builtin: true,
    executionClass: 'managed',
  } as const;

  private sessions = new Map<string, BedrockSession>();
  private readonly events = new AsyncEventQueue();
  private readonly llm = new BedrockLLMProvider({});

  constructor(private readonly callbacks: BedrockAdapterCallbacks = {}) {}

  async getPrerequisites(): Promise<Prerequisite[]> {
    const hasCredentials = await checkBedrockCredentials();
    return [
      {
        id: 'bedrock-credentials',
        name: 'Bedrock Credentials',
        description:
          'AWS credentials or profile with Amazon Bedrock model access.',
        status: hasCredentials ? 'installed' : 'missing',
        category: 'required',
        installGuide: {
          steps: [
            'Option 1: Configure AWS CLI credentials — run `aws configure` or edit ~/.aws/credentials',
            'Option 2: Use AWS SSO — run `aws sso login --profile <your-profile>` before starting Stallion',
            'Option 3: Set a credential_process helper in ~/.aws/config for automatic token refresh',
            'Ensure the credentials have Amazon Bedrock model access in the target region.',
          ],
          links: [
            'https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html',
            'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html',
          ],
        },
      },
    ];
  }

  async startSession(
    input: ProviderSessionStartInput,
  ): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const callbackResult = await this.callbacks.startSession?.(input);
    const systemPrompt =
      typeof input.modelOptions?.systemPrompt === 'string'
        ? input.modelOptions.systemPrompt
        : undefined;
    const session: BedrockSession = {
      provider: this.provider,
      threadId: input.threadId,
      status: callbackResult?.status ?? 'ready',
      model: callbackResult?.model ?? input.modelId,
      resumeCursor: callbackResult?.resumeCursor ?? input.resumeCursor,
      createdAt: callbackResult?.createdAt ?? now,
      updatedAt: callbackResult?.updatedAt ?? now,
      systemPrompt,
      history: [],
    };

    this.sessions.set(session.threadId, session);
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: session.threadId,
      createdAt: now,
      method: 'session.started',
      sessionId: session.threadId,
      initialState: 'created',
      metadata: {
        cwd: input.cwd,
      },
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: session.threadId,
      createdAt: now,
      method: 'session.configured',
      sessionId: session.threadId,
      model: session.model,
      cwd: input.cwd,
      metadata: input.modelOptions,
    });

    return session;
  }

  async sendTurn(
    input: ProviderSendTurnInput,
  ): Promise<ProviderTurnStartResult> {
    const session = this.sessions.get(input.threadId);
    if (!session) {
      throw new Error(
        `Bedrock adapter cannot send turn for missing session: ${input.threadId}`,
      );
    }

    const now = new Date().toISOString();
    const turnId = crypto.randomUUID();

    this.updateSession(input.threadId, {
      status: 'running',
      updatedAt: now,
      model: input.modelId ?? session.model,
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      method: 'session.state-changed',
      sessionId: input.threadId,
      from: 'idle',
      to: 'running',
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: now,
      turnId,
      method: 'turn.started',
      prompt: input.input,
    });

    try {
      const callbackResult = await this.callbacks.sendTurn?.(input);
      if (callbackResult) {
        if (callbackResult.outputText) {
          this.publish({
            eventId: crypto.randomUUID(),
            provider: this.provider,
            threadId: input.threadId,
            createdAt: new Date().toISOString(),
            turnId,
            itemId: crypto.randomUUID(),
            method: 'content.text-delta',
            delta: callbackResult.outputText,
          });
        }

        this.publishCompletion({
          input,
          turnId,
          outputText: callbackResult.outputText,
          finishReason: callbackResult.outputText ? 'stop' : 'other',
          resumeCursor: callbackResult.resumeCursor ?? session.resumeCursor,
        });
        return {
          threadId: input.threadId,
          turnId: callbackResult.turnId ?? turnId,
          resumeCursor: callbackResult.resumeCursor,
        };
      }

      const messages: LLMMessage[] = [];
      if (session.systemPrompt) {
        messages.push({ role: 'system', content: session.systemPrompt });
      }
      messages.push(...session.history);
      messages.push({ role: 'user', content: input.input });

      const model =
        input.modelId ??
        session.model ??
        'us.anthropic.claude-sonnet-4-20250514-v1:0';
      let assistantText = '';
      let finishReason:
        | 'stop'
        | 'tool-calls'
        | 'max-tokens'
        | 'cancelled'
        | 'other'
        | undefined;

      for await (const chunk of this.llm.createStream({ model, messages })) {
        if (chunk.type === 'text-delta' && chunk.content) {
          assistantText += chunk.content;
          this.publish({
            eventId: crypto.randomUUID(),
            provider: this.provider,
            threadId: input.threadId,
            createdAt: new Date().toISOString(),
            turnId,
            itemId: crypto.randomUUID(),
            method: 'content.text-delta',
            delta: chunk.content,
          });
        } else if (chunk.type === 'finish') {
          finishReason = normalizeFinishReason(chunk.finishReason);
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error || 'Bedrock stream failed');
        }
      }

      session.history.push({ role: 'user', content: input.input });
      if (assistantText) {
        session.history.push({ role: 'assistant', content: assistantText });
      }

      this.publishCompletion({
        input,
        turnId,
        outputText: assistantText,
        finishReason: finishReason || 'stop',
        resumeCursor: session.resumeCursor,
      });
      return { threadId: input.threadId, turnId };
    } catch (error) {
      this.publishCompletion({
        input,
        turnId,
        outputText: undefined,
        finishReason: 'other',
        resumeCursor: session.resumeCursor,
      });
      throw error;
    }
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<void> {
    await this.callbacks.interruptTurn?.(threadId, turnId);
    if (this.sessions.has(threadId)) {
      this.updateSession(threadId, {
        status: 'ready',
        updatedAt: new Date().toISOString(),
      });
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
  }

  async respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void> {
    await this.callbacks.respondToRequest?.(threadId, requestId, decision);
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
      createdAt: new Date().toISOString(),
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
    await this.callbacks.stopSession?.(threadId);
    const session = this.sessions.get(threadId);
    if (!session) return;
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
    return [...this.sessions.values()];
  }

  async listModels(): Promise<
    Array<{ id: string; name: string; originalId: string }>
  > {
    const models = await this.llm.listModels();
    return models.map((model) => ({
      id: model.id,
      name: model.name,
      originalId: model.id,
    }));
  }

  async hasSession(threadId: string): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async stopAll(): Promise<void> {
    await this.callbacks.stopAll?.();
    const threadIds = [...this.sessions.keys()];
    await Promise.all(threadIds.map((threadId) => this.stopSession(threadId)));
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }

  private updateSession(
    threadId: string,
    updates: Partial<BedrockSession>,
  ): void {
    const current = this.sessions.get(threadId);
    if (!current) return;
    this.sessions.set(threadId, { ...current, ...updates });
  }

  private publishCompletion(options: {
    input: ProviderSendTurnInput;
    turnId: string;
    outputText?: string;
    finishReason: 'stop' | 'tool-calls' | 'max-tokens' | 'cancelled' | 'other';
    resumeCursor?: unknown;
  }): void {
    const completedAt = new Date().toISOString();
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: options.input.threadId,
      createdAt: completedAt,
      turnId: options.turnId,
      method: 'turn.completed',
      finishReason: options.finishReason,
      outputText: options.outputText,
    });
    this.updateSession(options.input.threadId, {
      status: 'ready',
      updatedAt: completedAt,
      resumeCursor: options.resumeCursor,
      ...(options.input.modelId ? { model: options.input.modelId } : {}),
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: options.input.threadId,
      createdAt: completedAt,
      method: 'session.state-changed',
      sessionId: options.input.threadId,
      from: 'running',
      to: 'idle',
    });
  }
}

function normalizeFinishReason(
  reason?: string,
): 'stop' | 'tool-calls' | 'max-tokens' | 'cancelled' | 'other' {
  switch (reason) {
    case 'stop':
    case 'tool-calls':
    case 'max-tokens':
    case 'cancelled':
    case 'other':
      return reason;
    default:
      return 'other';
  }
}
