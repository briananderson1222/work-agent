import { SpanStatusCode } from '@opentelemetry/api';
import type { RuntimeContext } from '../runtime/types.js';
import {
  chatDuration,
  chatRequests,
  costEstimated,
  tokensInput,
  tokensOutput,
} from '../telemetry/metrics.js';
import { estimateCost, findModelPricing } from '../utils/pricing.js';
import {
  persistTemporaryAgentMessages,
} from './chat-persistence.js';
import {
  type ChatMessage,
  extractChatUserText,
} from './chat-request-preparation.js';

export function emitChatAgentStart({
  ctx,
  slug,
  conversationId,
  userId,
  traceId,
  input,
}: {
  ctx: RuntimeContext;
  slug: string;
  conversationId: string;
  userId: string;
  traceId: string;
  input: string | ChatMessage[];
}): void {
  if (!ctx.monitoringEmitter) {
    return;
  }

  ctx.monitoringEmitter.emitAgentStart({
    slug,
    conversationId,
    userId,
    traceId,
    input:
      typeof input === 'string'
        ? input
        : extractChatUserText(input) || '[complex input]',
  });
}

export async function ensureChatAgentStatsInitialized({
  ctx,
  slug,
}: {
  ctx: RuntimeContext;
  slug: string;
}): Promise<void> {
  if (ctx.agentStats.has(slug)) {
    return;
  }

  const adapter = ctx.memoryAdapters.get(slug);
  if (!adapter) {
    return;
  }

  const conversations = await adapter.getConversations(slug);
  let totalMessages = 0;
  for (const conversation of conversations) {
    const messages = await adapter.getMessages(conversation.userId, conversation.id);
    totalMessages += messages.length;
  }

  ctx.agentStats.set(slug, {
    conversationCount: conversations.length,
    messageCount: totalMessages,
    lastUpdated: Date.now(),
  });
}

export async function finalizeChatRequest({
  ctx,
  slug,
  plugin,
  input,
  operationContext,
  completionReason,
  accumulatedText,
  reasoningText,
  artifacts,
  result,
  modelOverride,
  memoryAdapter,
  conversationId,
  isNewConversation,
  chatStartMs,
  chatSpan,
}: {
  ctx: RuntimeContext;
  slug: string;
  plugin: string;
  input: string | ChatMessage[];
  operationContext: {
    userId?: string;
    conversationId?: string;
    traceId?: string;
  };
  completionReason: string;
  accumulatedText: string;
  reasoningText: string;
  artifacts: Array<{ type: string; name?: string; content?: unknown }>;
  result: {
    usage?: Promise<{
      promptTokens?: number;
      completionTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>;
  };
  modelOverride?: string;
  memoryAdapter:
    | {
        addMessage(
          msg: any,
          userId: string,
          conversationId: string,
          metadata?: any,
        ): Promise<void>;
      }
    | null
    | undefined;
  conversationId?: string;
  isNewConversation: boolean;
  chatStartMs: number;
  chatSpan: {
    setAttribute: (key: string, value: string | number) => void;
    setStatus?: (status: { code: SpanStatusCode; message?: string }) => void;
    end: () => void;
  };
}): Promise<void> {
  ctx.logger.info('Agent stream completed', {
    conversationId: operationContext.conversationId,
    reason: completionReason,
  });

  ctx.agentStatus.set(slug, 'idle');

  const isFileBackedAgent = ctx.agentSpecs.has(slug);
  if (!isFileBackedAgent && memoryAdapter && conversationId && accumulatedText) {
    try {
      await persistTemporaryAgentMessages({
        memoryAdapter,
        conversationId,
        input,
        accumulatedText,
        model: modelOverride || ctx.agentSpecs.get(slug)?.model,
        userId: operationContext.userId,
      });
    } catch (error) {
      ctx.logger.error('Failed to persist messages for temp agent', {
        error,
      });
    }
  }

  const finalOutput = accumulatedText.replace(reasoningText, '').trim();
  if (finalOutput) {
    artifacts.push({ type: 'text', content: finalOutput });
  }

  let usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined;
  try {
    usage = await result.usage;
  } catch {
    usage = undefined;
  }

  if (ctx.monitoringEmitter) {
    ctx.monitoringEmitter.emitAgentComplete({
      slug,
      conversationId: operationContext.conversationId || '',
      userId: operationContext.userId || '',
      traceId: operationContext.traceId || '',
      reason: completionReason,
      steps: 0,
      maxSteps: ctx.agentSpecs.get(slug)?.guardrails?.maxSteps,
      inputChars:
        typeof input === 'string'
          ? input.length
          : extractChatUserText(input).length,
      outputChars: finalOutput.length,
      usage: usage
        ? {
            inputTokens: usage.promptTokens || usage.inputTokens || 0,
            outputTokens: usage.completionTokens || usage.outputTokens || 0,
          }
        : undefined,
      artifacts,
    });
  }

  const stats = ctx.agentStats.get(slug);
  if (stats) {
    stats.messageCount += 2;
    stats.lastUpdated = Date.now();
    if (isNewConversation) {
      stats.conversationCount += 1;
    }
  }

  const inputTokenCount = usage?.promptTokens || usage?.inputTokens || 0;
  const outputTokenCount = usage?.completionTokens || usage?.outputTokens || 0;
  let estimatedCost = 0;

  if (usage && ctx.modelCatalog) {
    try {
      const modelId =
        modelOverride || ctx.agentSpecs.get(slug)?.model || ctx.appConfig.invokeModel;
      const pricing = await findModelPricing(
        ctx.modelCatalog,
        modelId,
        ctx.appConfig.region,
      );
      estimatedCost = estimateCost(pricing, inputTokenCount, outputTokenCount);
    } catch {
      estimatedCost = 0;
    }
  }

  ctx.metricsLog.push({
    timestamp: Date.now(),
    agentSlug: slug,
    event: 'completion',
    conversationId: operationContext.conversationId,
    messageCount: 2,
    cost: estimatedCost,
  });

  chatRequests.add(1, { agent: slug, plugin });
  chatDuration.record(Date.now() - chatStartMs, {
    agent: slug,
    plugin,
  });
  if (usage) {
    tokensInput.add(inputTokenCount, { agent: slug, plugin });
    tokensOutput.add(outputTokenCount, { agent: slug, plugin });
  }
  if (estimatedCost > 0) {
    costEstimated.add(estimatedCost, { agent: slug, plugin });
  }

  chatSpan.setAttribute(
    'stallion.conversation_id',
    operationContext.conversationId || '',
  );
  chatSpan.setAttribute('stallion.tokens.input', inputTokenCount);
  chatSpan.setAttribute('stallion.tokens.output', outputTokenCount);
  chatSpan.setStatus?.({ code: SpanStatusCode.OK });
  chatSpan.end();
}
