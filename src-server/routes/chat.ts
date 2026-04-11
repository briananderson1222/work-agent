/**
 * Chat Routes - POST /:slug/chat SSE streaming endpoint
 * Extracted from stallion-runtime.ts lines 1940-2800
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import * as StreamOrchestrator from '../runtime/stream-orchestrator.js';
import { InjectableStream } from '../runtime/streaming/InjectableStream.js';
import type { RuntimeContext } from '../runtime/types.js';
import { chatErrors, tracer } from '../telemetry/metrics.js';
import { getCachedUser } from './auth.js';
import { streamAlternateProviderChat } from './chat-alternate-provider.js';
import {
  applyCombinedContextToInput,
  injectConversationFeedbackContext,
} from './chat-context.js';
import {
  emitChatAgentStart,
  ensureChatAgentStatsInitialized,
  finalizeChatRequest,
} from './chat-lifecycle.js';
import { resolveChatAgentModelOverride } from './chat-model-override.js';
import {
  type ChatMessage,
  prepareChatRequest,
} from './chat-request-preparation.js';
import {
  createChatConversationId,
  createChatTraceId,
  ensureChatConversation,
} from './chat-persistence.js';
import {
  chatSchema,
  errorMessage,
  getBody,
  param,
  validate,
} from './schemas.js';

export function createChatRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  app.post('/:slug/chat', validate(chatSchema), async (c) => {
    const slug = param(c, 'slug');
    const plugin = c.req.header('x-stallion-plugin') || '';

    try {
      const { input, options: rawOptions = {}, projectSlug } = getBody(c);

      // ACP routing — delegate to kiro-cli if this is an ACP agent
      if (ctx.acpBridge.hasAgent(slug)) {
        let acpCwd: string | undefined;
        if (projectSlug) {
          try {
            const project = ctx.storageAdapter.getProject(projectSlug);
            if (project.workingDirectory) acpCwd = project.workingDirectory;
          } catch (e) {
            console.debug('Failed to resolve project working directory:', e);
          }
        }
        return ctx.acpBridge.handleChat(c, slug, input, rawOptions, {
          ...(acpCwd && { cwd: acpCwd }),
          ...(rawOptions.conversationId && {
            conversationId: rawOptions.conversationId,
          }),
        });
      }

      const {
        options,
        useAlternateProvider,
        resolvedProviderConn,
        injectContext,
        ragContext: preparedRagContext,
      } = await prepareChatRequest({
        ctx,
        input,
        options: rawOptions,
        projectSlug,
      });
      let ragContext = preparedRagContext;

      // Route to alternate provider (Ollama, OpenAI-compat) if resolved
      if (useAlternateProvider && resolvedProviderConn) {
        const alternateProviderResponse = streamAlternateProviderChat({
          c,
          ctx,
          slug,
          input,
          options,
          injectContext,
          ragContext,
          resolvedProviderConn,
        });
        if (alternateProviderResponse) {
          return alternateProviderResponse;
        }
      }

      // DEBUG: Log image data to trace truncation
      if (Array.isArray(input)) {
        for (const msg of input) {
          if (msg.parts) {
            for (const part of msg.parts) {
              if (part.type === 'file' && part.url) {
                const dataUrl = part.url as string;
                ctx.logger.info('[DEBUG Image] Received file part', {
                  mediaType: part.mediaType,
                  urlLength: dataUrl.length,
                  urlStart: dataUrl.substring(0, 50),
                  urlEnd: dataUrl.substring(dataUrl.length - 50),
                });
              }
            }
          }
        }
      }

      const { model: modelOverride, ...restOptions } = options;

      let agent = ctx.activeAgents.get(slug);
      if (!agent) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      const modelOverrideResult = await resolveChatAgentModelOverride({
        ctx,
        slug,
        modelOverride,
        agent,
      });
      if (modelOverrideResult.error) {
        const status = (modelOverrideResult.status || 500) as 400 | 500;
        return c.json(
          {
            success: false,
            error: modelOverrideResult.error,
          },
          status,
        );
      }
      agent = modelOverrideResult.agent;

      // Set SSE headers
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-Accel-Buffering', 'no');

      return stream(c, async (streamWriter) => {
        let conversationId: string | undefined;
        let operationContext: Record<string, unknown> & {
          userId?: string;
          conversationId?: string;
          title?: string;
          traceId?: string;
          abortSignal?: AbortSignal;
        } = {};
        let completionReason = 'completed';
        let hasOutput = false;
        let accumulatedText = '';
        let reasoningText = '';
        let _toolCallCount = 0;
        let requestTraceId = '';
        let isNewConversation = false;
        // biome-ignore lint: agent framework types inferred from Map
        let result;
        let memory = null;
        let memoryAdapter = null;
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

          // Resolve userId from auth
          if (!operationContext.userId) {
            operationContext.userId = getCachedUser().alias;
          }

          // Generate conversationId if not provided
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
          const conversationStorage = isFileBackedAgent
            ? memory
            : memoryAdapter;
          await ensureChatConversation({
            conversationStorage,
            conversationId: operationContext.conversationId,
            userId: operationContext.userId,
            slug,
            input: input as string | ChatMessage[],
            title: operationContext.title,
          });

          const traceId = createChatTraceId(operationContext.conversationId!);
          operationContext.traceId = traceId;

          ragContext = injectConversationFeedbackContext(
            ctx.feedbackService.getRatings(),
            operationContext.conversationId,
            ragContext,
          );

          const finalInput = applyCombinedContextToInput(
            input as string | ChatMessage[],
            injectContext,
            ragContext,
          );

          result = await agent.streamText(finalInput, operationContext);

          ctx.agentStatus.set(slug, 'running');

          emitChatAgentStart({
            ctx,
            slug,
            conversationId: operationContext.conversationId || '',
            userId: operationContext.userId || '',
            traceId,
            input: input as string | ChatMessage[],
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
            const mem = agent.getMemory();
            const conversation = mem
              ? await mem.getConversation(operationContext.conversationId)
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
          _toolCallCount = 0;
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
            toolNames: agentTools.map((t) => t.name).slice(0, 5),
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
          if (results.metadata) {
            _toolCallCount = results.metadata.toolCalls || 0;
          }

          if (abortController.signal.aborted) {
            completionReason = 'aborted';
            if (!hasOutput) await saveCancellationMessage();
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
            input: input as string | ChatMessage[],
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
    } catch (error: unknown) {
      ctx.logger.error('Chat error', { error });
      chatErrors.add(1, { agent: slug, plugin });
      const errMsg = errorMessage(error);
      const isCredentialError =
        errMsg.includes('credential') ||
        errMsg.includes('accessKeyId') ||
        errMsg.includes('secretAccessKey');
      return c.json(
        { success: false, error: errMsg },
        isCredentialError ? 401 : 500,
      );
    }
  });

  return app;
}
