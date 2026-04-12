import { SpanStatusCode } from '@opentelemetry/api';
import type { AgentDelegationContext } from '@stallion-ai/contracts/agent';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import * as StreamOrchestrator from '../runtime/stream-orchestrator.js';
import { InjectableStream } from '../runtime/streaming/InjectableStream.js';
import type { RuntimeContext } from '../runtime/types.js';
import { tracer } from '../telemetry/metrics.js';
import { getCachedUser } from './auth.js';
import {
  applyCombinedContextToInput,
  injectConversationFeedbackContext,
} from './chat-context.js';
import {
  emitChatAgentStart,
  ensureChatAgentStatsInitialized,
  finalizeChatRequest,
} from './chat-lifecycle.js';
import {
  createChatConversationId,
  createChatTraceId,
  ensureChatConversation,
} from './chat-persistence.js';
import type { ChatMessage } from './chat-request-preparation.js';
import { errorMessage } from './schemas.js';

type ChatOperationContext = Record<string, unknown> & {
  userId?: string;
  conversationId?: string;
  title?: string;
  traceId?: string;
  abortSignal?: AbortSignal;
  delegation?: AgentDelegationContext;
};

interface StreamPrimaryAgentChatArgs {
  c: Context;
  ctx: RuntimeContext;
  slug: string;
  plugin: string;
  input: string | ChatMessage[];
  restOptions: Record<string, unknown>;
  injectContext: string | null;
  ragContext: string | null;
  modelOverride?: string;
  agent: any;
}

export function logDebugChatImages(
  logger: RuntimeContext['logger'],
  input: string | ChatMessage[],
): void {
  if (!Array.isArray(input)) {
    return;
  }
  for (const msg of input) {
    if (!msg.parts) {
      continue;
    }
    for (const part of msg.parts) {
      if (part.type !== 'file') {
        continue;
      }
      const filePart = part as Record<string, unknown>;
      const dataUrl =
        typeof filePart.url === 'string' ? filePart.url : undefined;
      if (!dataUrl) {
        continue;
      }
      logger.info('[DEBUG Image] Received file part', {
        mediaType:
          typeof filePart.mediaType === 'string'
            ? filePart.mediaType
            : undefined,
        urlLength: dataUrl.length,
        urlStart: dataUrl.substring(0, 50),
        urlEnd: dataUrl.substring(dataUrl.length - 50),
      });
    }
  }
}

export function streamPrimaryAgentChat({
  c,
  ctx,
  slug,
  plugin,
  input,
  restOptions,
  injectContext,
  ragContext,
  modelOverride,
  agent,
}: StreamPrimaryAgentChatArgs): Response {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, async (streamWriter) => {
    let conversationId: string | undefined;
    let operationContext: ChatOperationContext = {};
    let completionReason = 'completed';
    let hasOutput = false;
    let accumulatedText = '';
    let reasoningText = '';
    let requestTraceId = '';
    let isNewConversation = false;
    // biome-ignore lint: agent framework types inferred from Map
    let result;
    let memory = null;
    let memoryAdapter = null;
    let effectiveRagContext: string | null = ragContext;
    const chatStartMs = Date.now();
    const chatSpan = tracer.startSpan('stallion.chat', {
      attributes: { 'stallion.agent': slug },
    });
    const artifacts: Array<{
      type: string;
      name?: string;
      content?: unknown;
    }> = [];

    try {
      const injectableStream = new InjectableStream();
      const agentSpec = ctx.agentSpecs.get(slug);
      const elicitation = StreamOrchestrator.createElicitationCallback(
        agentSpec!,
        ctx.toolNameMapping,
        ctx.approvalRegistry,
        injectableStream,
        ctx.logger,
      );

      operationContext = { ...restOptions, elicitation };

      const agentHooks = ctx.agentHooksMap.get(slug);
      if (agentHooks) {
        agentHooks.requestApproval = async (tool) => {
          const result = await elicitation({
            type: 'tool-approval',
            toolName: tool.toolName,
            toolDescription: tool.toolDescription || '',
            toolArgs: tool.toolArgs,
          });
          return !!result;
        };
      }

      if (!operationContext.userId) {
        operationContext.userId = getCachedUser().alias;
      }

      isNewConversation = !operationContext.conversationId;
      if (isNewConversation && operationContext.userId) {
        operationContext.conversationId = createChatConversationId(
          operationContext.userId,
        );
      }

      const abortController = new AbortController();
      conversationId = operationContext.conversationId;

      c.req.raw.signal?.addEventListener('abort', () => {
        ctx.logger.debug('Client disconnected, aborting operation', {
          conversationId,
        });
        abortController.abort('Client disconnected');
      });

      operationContext.abortSignal = abortController.signal;
      ctx.logger.debug('Abort signal configured', { conversationId });

      memory = agent.getMemory();
      memoryAdapter = ctx.memoryAdapters.get(slug);
      const isFileBackedAgent = ctx.agentSpecs.has(slug);
      const conversationStorage = isFileBackedAgent ? memory : memoryAdapter;
      const requestedDelegation =
        operationContext.delegation &&
        typeof operationContext.delegation === 'object'
          ? operationContext.delegation
          : undefined;
      await ensureChatConversation({
        conversationStorage,
        conversationId: operationContext.conversationId,
        userId: operationContext.userId,
        slug,
        input,
        title: operationContext.title,
        metadata: requestedDelegation
          ? { delegation: requestedDelegation }
          : undefined,
      });
      const persistedConversation =
        conversationStorage && operationContext.conversationId
          ? await conversationStorage.getConversation(
              operationContext.conversationId,
            )
          : null;
      const persistedDelegation = persistedConversation?.metadata?.delegation;
      if (persistedDelegation && typeof persistedDelegation === 'object') {
        operationContext.delegation =
          persistedDelegation as AgentDelegationContext;
      }

      const traceId = createChatTraceId(operationContext.conversationId!);
      operationContext.traceId = traceId;

      effectiveRagContext = injectConversationFeedbackContext(
        ctx.feedbackService.getRatings(),
        operationContext.conversationId,
        effectiveRagContext,
      );

      const finalInput = applyCombinedContextToInput(
        input,
        injectContext,
        effectiveRagContext,
      );

      result = await agent.streamText(finalInput, operationContext);
      ctx.agentStatus.set(slug, 'running');

      emitChatAgentStart({
        ctx,
        slug,
        conversationId: operationContext.conversationId || '',
        userId: operationContext.userId || '',
        traceId,
        input,
      });
      await ensureChatAgentStatsInitialized({ ctx, slug });

      const suppressAbortError = (err: unknown) =>
        abortController.signal.aborted ? undefined : Promise.reject(err);
      result.text?.catch(suppressAbortError);
      result.usage?.catch(suppressAbortError);
      result.finishReason?.catch(suppressAbortError);

      const saveCancellationMessage = async () => {
        await StreamOrchestrator.saveCancellationMessage(
          agent,
          operationContext,
        );
      };

      ctx.logger.info('Agent stream started', {
        conversationId: operationContext.conversationId,
        isNewConversation,
      });

      if (isNewConversation && operationContext.conversationId) {
        const conversation = memory
          ? await memory.getConversation(operationContext.conversationId)
          : null;
        await streamWriter.write(
          `data: ${JSON.stringify({
            type: 'conversation-started',
            conversationId: operationContext.conversationId,
            title: conversation?.title || 'New Conversation',
          })}\n\n`,
        );
      }

      completionReason = 'completed';
      hasOutput = false;
      accumulatedText = '';
      reasoningText = '';
      requestTraceId = traceId;

      const debugStreaming = process.env.DEBUG_STREAMING === 'true';
      const pipeline = StreamOrchestrator.createStreamingPipeline(
        abortController.signal,
        ctx.monitoringEvents,
        {
          slug,
          conversationId: operationContext.conversationId,
          userId: operationContext.userId,
          traceId,
          plugin,
        },
        ctx.monitoringEmitter,
      );

      const agentTools = ctx.agentTools.get(slug) || [];
      const agentModel = agent.model as
        | {
            modelId?: string;
            settings?: { maxTokens?: number; temperature?: number };
          }
        | undefined;
      ctx.logger.debug('Stream starting', {
        conversationId,
        model: agentModel?.modelId,
        toolCount: agentTools.length,
        toolNames: agentTools.map((tool) => tool.name).slice(0, 5),
        maxTokens: agentModel?.settings?.maxTokens,
        temperature: agentModel?.settings?.temperature,
        debugStreaming,
      });

      const wrappedStream = injectableStream.wrap(result.fullStream);
      for await (const chunk of pipeline.run(wrappedStream)) {
        await StreamOrchestrator.writeSSEChunk(streamWriter, chunk);
      }

      await StreamOrchestrator.writeSSEDone(streamWriter);
      const results = await pipeline.finalize();

      if (results.completion) {
        hasOutput = results.completion.hasOutput;
        completionReason = results.completion.completionReason;
        accumulatedText = results.completion.accumulatedText;
      }

      if (abortController.signal.aborted) {
        completionReason = 'aborted';
        if (!hasOutput) {
          await saveCancellationMessage();
        }
      }
    } catch (error: unknown) {
      chatSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage(error),
      });
      chatSpan.recordException(
        error instanceof Error ? error : new Error(errorMessage(error)),
      );
      const agentModelForError = agent.model as
        | { modelId?: string }
        | undefined;
      ctx.logger.error('Stream error occurred', {
        agentId: slug,
        modelName: agentModelForError?.modelId,
        conversationId,
        agentName: slug,
        error,
      });
      await StreamOrchestrator.writeSSEError(streamWriter, error);
      await StreamOrchestrator.writeSSEDone(streamWriter);
    } finally {
      await finalizeChatRequest({
        ctx,
        slug,
        plugin,
        input,
        operationContext: {
          userId: operationContext.userId,
          conversationId: operationContext.conversationId,
          traceId: requestTraceId,
        },
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
      });
    }
  });
}
