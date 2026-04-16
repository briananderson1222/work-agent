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
import type { LLMMessage } from '../model-provider-types.js';
import { OllamaLLMProvider } from '../ollama-provider.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface AsyncQueueItem<T> {
  resolve(value: IteratorResult<T>): void;
}

class AsyncEventQueue implements AsyncIterable<CanonicalRuntimeEvent> {
  private items: CanonicalRuntimeEvent[] = [];
  private waiters: AsyncQueueItem<CanonicalRuntimeEvent>[] = [];

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
        return new Promise<IteratorResult<CanonicalRuntimeEvent>>((resolve) => {
          this.waiters.push({ resolve });
        });
      },
    };
  }
}

interface OllamaSession extends ProviderSession {
  systemPrompt?: string;
  history: LLMMessage[];
}

export class OllamaAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'ollama';
  readonly metadata = {
    displayName: 'Ollama',
    description: 'Direct chat with locally running Ollama models.',
    capabilities: ['agent-runtime', 'session-lifecycle'] as const,
    runtimeId: 'ollama-runtime',
    builtin: true,
    executionClass: 'managed',
  } as const;

  private sessions = new Map<string, OllamaSession>();
  private readonly events = new AsyncEventQueue();
  private readonly llm: OllamaLLMProvider;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.llm = new OllamaLLMProvider({ baseUrl });
  }

  async getPrerequisites(): Promise<Prerequisite[]> {
    const available = await this.llm.healthCheck().catch(() => false);
    return [
      {
        id: 'ollama-server',
        name: 'Ollama server',
        description: 'Ollama must be running locally (ollama serve).',
        status: available ? 'installed' : 'missing',
        category: 'required',
        installGuide: {
          steps: [
            'Install Ollama from https://ollama.com',
            'Run `ollama serve` to start the server',
            'Pull a model: `ollama pull llama3.2`',
          ],
          links: ['https://ollama.com'],
        },
      },
    ];
  }

  async listModels(): Promise<
    Array<{ id: string; name: string; originalId: string }>
  > {
    const models = await this.llm.listModels();
    return models.map((m) => ({ id: m.id, name: m.name, originalId: m.id }));
  }

  async startSession(
    input: ProviderSessionStartInput,
  ): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const systemPrompt =
      typeof input.modelOptions?.systemPrompt === 'string'
        ? input.modelOptions.systemPrompt
        : undefined;
    const session: OllamaSession = {
      provider: this.provider,
      threadId: input.threadId,
      status: 'ready',
      model: input.modelId ?? undefined,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
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
      metadata: { cwd: input.cwd },
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
        `Ollama adapter cannot send turn for missing session: ${input.threadId}`,
      );
    }

    const now = new Date().toISOString();
    const turnId = crypto.randomUUID();
    const model = input.modelId ?? session.model ?? 'llama3.2';

    this.updateSession(input.threadId, {
      status: 'running',
      updatedAt: now,
      model,
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

    const messages: LLMMessage[] = [];
    if (session.systemPrompt) {
      messages.push({ role: 'system', content: session.systemPrompt });
    }
    messages.push(...session.history);
    messages.push({ role: 'user', content: input.input });

    let assistantText = '';
    try {
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
        }
      }
    } catch (err) {
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        turnId,
        method: 'turn.completed',
        finishReason: 'other',
        outputText: undefined,
      });
      this.updateSession(input.threadId, {
        status: 'ready',
        updatedAt: new Date().toISOString(),
      });
      this.publish({
        eventId: crypto.randomUUID(),
        provider: this.provider,
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'session.state-changed',
        sessionId: input.threadId,
        from: 'running',
        to: 'idle',
      });
      throw err;
    }

    // Accumulate history for multi-turn context
    session.history.push({ role: 'user', content: input.input });
    if (assistantText) {
      session.history.push({ role: 'assistant', content: assistantText });
    }

    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      turnId,
      method: 'turn.completed',
      finishReason: 'stop',
      outputText: assistantText,
    });
    this.updateSession(input.threadId, {
      status: 'ready',
      updatedAt: new Date().toISOString(),
    });
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'session.state-changed',
      sessionId: input.threadId,
      from: 'running',
      to: 'idle',
    });

    return { threadId: input.threadId, turnId };
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<void> {
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
    const statusMap: Record<string, RequestResolvedEvent['status']> = {
      accept: 'approved',
      acceptForSession: 'approved',
      decline: 'denied',
      cancel: 'cancelled',
    };
    this.publish({
      eventId: crypto.randomUUID(),
      provider: this.provider,
      threadId,
      createdAt: new Date().toISOString(),
      requestId,
      method: 'request.resolved',
      status: statusMap[decision] ?? 'cancelled',
    });
  }

  async stopSession(threadId: string): Promise<void> {
    if (!this.sessions.has(threadId)) return;
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

  async hasSession(threadId: string): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async stopAll(): Promise<void> {
    const threadIds = [...this.sessions.keys()];
    await Promise.all(threadIds.map((id) => this.stopSession(id)));
  }

  streamEvents(): AsyncIterable<CanonicalRuntimeEvent> {
    return this.events;
  }

  publish(event: CanonicalRuntimeEvent): void {
    this.events.push(event);
  }

  private updateSession(
    threadId: string,
    updates: Partial<OllamaSession>,
  ): void {
    const current = this.sessions.get(threadId);
    if (!current) return;
    this.sessions.set(threadId, { ...current, ...updates });
  }
}
