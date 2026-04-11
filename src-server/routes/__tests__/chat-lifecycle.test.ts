import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  chatDuration: { record: vi.fn() },
  chatRequests: { add: vi.fn() },
  costEstimated: { add: vi.fn() },
  tokensInput: { add: vi.fn() },
  tokensOutput: { add: vi.fn() },
}));

vi.mock('../../utils/pricing.js', () => ({
  estimateCost: vi.fn(() => 1.25),
  findModelPricing: vi.fn(async () => ({
    inputCostPer1k: 1,
    outputCostPer1k: 2,
  })),
}));

vi.mock('../chat-persistence.js', () => ({
  persistTemporaryAgentMessages: vi.fn(async () => undefined),
}));

import {
  emitChatAgentStart,
  ensureChatAgentStatsInitialized,
  finalizeChatRequest,
} from '../chat-lifecycle.js';

function createRuntimeContext() {
  return {
    monitoringEmitter: {
      emitAgentStart: vi.fn(),
      emitAgentComplete: vi.fn(),
    },
    memoryAdapters: new Map(),
    agentStats: new Map(),
    agentStatus: new Map(),
    agentSpecs: new Map([
      [
        'agent-a',
        {
          model: 'model-a',
          guardrails: { maxSteps: 7 },
        },
      ],
    ]),
    modelCatalog: {},
    appConfig: { invokeModel: 'fallback-model', region: 'us-east-1' },
    metricsLog: [],
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  } as any;
}

describe('chat-lifecycle helpers', () => {
  test('emits agent start payload', () => {
    const ctx = createRuntimeContext();

    emitChatAgentStart({
      ctx,
      slug: 'agent-a',
      conversationId: 'conversation-1',
      userId: 'user-1',
      traceId: 'trace-1',
      input: 'hello',
    });

    expect(ctx.monitoringEmitter.emitAgentStart).toHaveBeenCalledWith({
      slug: 'agent-a',
      conversationId: 'conversation-1',
      userId: 'user-1',
      traceId: 'trace-1',
      input: 'hello',
    });
  });

  test('initializes agent stats from memory adapter conversation history', async () => {
    const ctx = createRuntimeContext();
    ctx.memoryAdapters.set('agent-a', {
      getConversations: vi.fn(async () => [
        { id: 'c1', userId: 'u1' },
        { id: 'c2', userId: 'u2' },
      ]),
      getMessages: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }])
        .mockResolvedValueOnce([{ id: 'm3' }]),
    });

    await ensureChatAgentStatsInitialized({ ctx, slug: 'agent-a' });

    expect(ctx.agentStats.get('agent-a')).toEqual({
      conversationCount: 2,
      messageCount: 3,
      lastUpdated: expect.any(Number),
    });
  });

  test('finalizes chat completion, stats, monitoring, and metrics', async () => {
    const ctx = createRuntimeContext();
    ctx.agentStatus.set('agent-a', 'running');
    ctx.agentStats.set('agent-a', {
      conversationCount: 1,
      messageCount: 10,
      lastUpdated: 0,
    });

    const artifacts: Array<{ type: string; content?: unknown }> = [];
    const chatSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };

    await finalizeChatRequest({
      ctx,
      slug: 'agent-a',
      plugin: 'plugin-a',
      input: 'hello',
      operationContext: {
        userId: 'user-1',
        conversationId: 'conversation-1',
        traceId: 'trace-1',
      },
      completionReason: 'completed',
      accumulatedText: 'Answer',
      reasoningText: '',
      artifacts,
      result: {
        usage: Promise.resolve({
          promptTokens: 11,
          completionTokens: 22,
        }),
      },
      modelOverride: 'override-model',
      memoryAdapter: null,
      conversationId: 'conversation-1',
      isNewConversation: true,
      chatStartMs: Date.now() - 50,
      chatSpan,
    });

    expect(ctx.agentStatus.get('agent-a')).toBe('idle');
    expect(artifacts).toEqual([{ type: 'text', content: 'Answer' }]);
    expect(ctx.monitoringEmitter.emitAgentComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'agent-a',
        conversationId: 'conversation-1',
        reason: 'completed',
        outputChars: 6,
      }),
    );
    expect(ctx.agentStats.get('agent-a')).toEqual({
      conversationCount: 2,
      messageCount: 12,
      lastUpdated: expect.any(Number),
    });
    expect(ctx.metricsLog).toEqual([
      expect.objectContaining({
        agentSlug: 'agent-a',
        event: 'completion',
        conversationId: 'conversation-1',
        messageCount: 2,
        cost: 1.25,
      }),
    ]);
    expect(chatSpan.end).toHaveBeenCalled();
  });
});
