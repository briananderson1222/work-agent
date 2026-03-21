/**
 * Chat Routes - POST /:slug/chat SSE streaming endpoint
 * Extracted from stallion-runtime.ts lines 1940-2800
 */

import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { SpanStatusCode } from '@opentelemetry/api';
import { createLLMProviderFromConfig, streamWithProvider } from '../services/llm-router.js';
import { getCachedUser } from './auth.js';
import { InjectableStream } from '../runtime/streaming/InjectableStream.js';
import * as StreamOrchestrator from '../runtime/stream-orchestrator.js';
import {
  chatDuration,
  chatErrors,
  chatRequests,
  costEstimated,
  feedbackOps,
  tokensInput,
  tokensOutput,
  tracer,
} from '../telemetry/metrics.js';
import { estimateCost, findModelPricing } from '../utils/pricing.js';
import type { RuntimeContext } from '../runtime/types.js';
import { chatSchema, validate, getBody, param } from './schemas.js';

export function createChatRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  app.post('/:slug/chat', validate(chatSchema), async (c) => {
    const slug = param(c, 'slug');
    const plugin = c.req.header('x-stallion-plugin') || '';

    try {
      const { input, options = {}, projectSlug } = getBody(c);

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
        return ctx.acpBridge.handleChat(
          c,
          slug,
          input,
          options,
          { ...(acpCwd && { cwd: acpCwd }), ...(options.conversationId && { conversationId: options.conversationId }) },
        );
      }

      // Resolve project provider override when projectSlug is provided
      let useAlternateProvider = false;
      let resolvedProviderConn: any = null;
      if (projectSlug && !options.model) {
        try {
          const resolved = await ctx.providerService.resolveProvider({ projectSlug });
          if (resolved.model) {
            options.model = resolved.model;
          }
          if (resolved.providerId && resolved.providerId !== 'bedrock') {
            const connections = ctx.providerService.listProviderConnections();
            resolvedProviderConn = connections.find((c: any) => c.id === resolved.providerId);
            if (resolvedProviderConn && resolvedProviderConn.type !== 'bedrock') {
              useAlternateProvider = true;
            }
          }
        } catch (err: any) {
          ctx.logger.warn('Failed to resolve project provider', { projectSlug, error: err.message });
        }
      }

      // Inject context — project rules and inject-behavior knowledge namespaces
      let injectContext: string | null = null;
      if (projectSlug) {
        try {
          injectContext = await ctx.knowledgeService.getInjectContext(projectSlug);
        } catch (err: any) {
          ctx.logger.debug('Inject context retrieval failed', { projectSlug, error: err.message });
        }
      }

      // RAG context injection — query project knowledge base
      let ragContext: string | null = null;
      if (projectSlug) {
        try {
          const userMessage =
            typeof input === 'string'
              ? input
              : Array.isArray(input)
                ? input.find((m: any) => m.role === 'user')?.parts?.find((p: any) => p.type === 'text')?.text || ''
                : '';
          if (userMessage) {
            ragContext = await ctx.knowledgeService.getRAGContext(projectSlug, userMessage);
          }
        } catch (err: any) {
          ctx.logger.debug('RAG context retrieval failed', { projectSlug, error: err.message });
        }
      }

      // Feedback guidelines injection
      const feedbackGuidelines = ctx.feedbackService.getBehaviorGuidelines();
      if (feedbackGuidelines) {
        ragContext = ragContext ? `${ragContext}\n\n${feedbackGuidelines}` : feedbackGuidelines;
      }

      // Route to alternate provider (Ollama, OpenAI-compat) if resolved
      if (useAlternateProvider && resolvedProviderConn) {
        const llmProvider = createLLMProviderFromConfig(resolvedProviderConn);
        if (llmProvider) {
          c.header('Content-Type', 'text/event-stream');
          c.header('Cache-Control', 'no-cache');
          c.header('Connection', 'keep-alive');
          c.header('X-Accel-Buffering', 'no');

          return stream(c, async (streamWriter) => {
            const convId = options.conversationId || `${slug}:${Date.now()}`;
            const messages: Array<{ role: string; content: string }> = [];

            const agentSpec = ctx.agentSpecs.get(slug);
            const globalPrompt = ctx.appConfig.systemPrompt
              ? ctx.replaceTemplateVariables(ctx.appConfig.systemPrompt)
              : '';
            const agentPrompt = agentSpec?.prompt
              ? ctx.replaceTemplateVariables(agentSpec.prompt)
              : '';
            const combinedPrompt = [globalPrompt, agentPrompt].filter(Boolean).join('\n\n');
            const systemPrompt = [injectContext, ragContext, combinedPrompt].filter(Boolean).join('\n\n');
            if (systemPrompt) {
              messages.push({ role: 'system', content: systemPrompt });
            }

            if (options.conversationId) {
              try {
                const adapter = ctx.memoryAdapters.get(slug);
                if (adapter) {
                  const userId = options.userId || getCachedUser().alias;
                  const msgs = await adapter.getMessages(userId, options.conversationId);
                  if (msgs) {
                    for (const msg of msgs) {
                      const textParts = (msg.parts || [])
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text);
                      const content = textParts.join('\n') || '';
                      if (content) messages.push({ role: msg.role as string, content });
                    }
                  }
                }
              } catch (e) {
                console.debug('Failed to load conversation history:', e);
              }
            }

            const userText =
              typeof input === 'string'
                ? input
                : Array.isArray(input)
                  ? input.find((m: any) => m.role === 'user')?.parts?.find((p: any) => p.type === 'text')?.text || ''
                  : '';
            messages.push({ role: 'user', content: userText });

            try {
              await streamWithProvider(
                llmProvider,
                options.model || resolvedProviderConn.config?.defaultModel || 'default',
                messages as any,
                {
                  write: (data: string) => {
                    streamWriter.write(data);
                    return Promise.resolve();
                  },
                },
                convId,
                c.req.raw.signal,
              );
            } catch (err: any) {
              await streamWriter.write(
                `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
              );
            }
          });
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

      let agent: any = ctx.activeAgents.get(slug);
      if (!agent) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      // If model override, get or create cached agent with that model
      if (modelOverride) {
        if (ctx.modelCatalog) {
          try {
            const isValid = await ctx.modelCatalog.validateModelId(modelOverride);
            if (!isValid) {
              return c.json(
                { success: false, error: `Invalid model ID: ${modelOverride}. Please select a valid model from the list.` },
                400,
              );
            }
          } catch (validationError: any) {
            ctx.logger.warn('Model validation failed', { modelOverride, error: validationError });
          }
        }

        const cacheKey = `${slug}:${modelOverride}`;
        let cachedAgent = ctx.activeAgents.get(cacheKey);

        if (!cachedAgent) {
          try {
            const originalSpec = ctx.agentSpecs.get(slug);
            const originalTools = ctx.agentTools.get(slug);

            const resolvedModel = ctx.modelCatalog
              ? await ctx.modelCatalog.resolveModelId(modelOverride)
              : modelOverride;
            const newModel = await ctx.createBedrockModel({
              model: resolvedModel,
              region: originalSpec?.region || ctx.appConfig.region,
            } as any);

            const tempWrapper = await ctx.framework.createTempAgent({
              name: cacheKey,
              instructions: (agent as any).instructions || '',
              model: newModel,
              tools: originalTools as any[],
            });
            cachedAgent = (tempWrapper as any).raw || tempWrapper;

            ctx.activeAgents.set(cacheKey, cachedAgent);
            ctx.logger.info('Created agent with model override', { slug, modelOverride });
          } catch (modelError: any) {
            ctx.logger.error('Failed to create agent with model override', { slug, modelOverride, error: modelError });
            return c.json(
              { success: false, error: `Failed to switch to model ${modelOverride}: ${modelError.message}` },
              500,
            );
          }
        }

        agent = cachedAgent;
      }

      // Set SSE headers
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-Accel-Buffering', 'no');

      return stream(c, async (streamWriter) => {
        let conversationId: string | undefined;
        let operationContext: any = {};
        let completionReason = 'completed';
        let hasOutput = false;
        let accumulatedText = '';
        let reasoningText = '';
        let toolCallCount = 0;
        let currentStep = 0;
        let requestTraceId = '';
        let isNewConversation = false;
        let result: any;
        let memory: any = null;
        let memoryAdapter: any = null;
        const chatStartMs = Date.now();
        const chatSpan = tracer.startSpan('stallion.chat', {
          attributes: { 'stallion.agent': slug },
        });
        const artifacts: Array<{ type: string; name?: string; content?: any }> = [];

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
            operationContext.conversationId = `${operationContext.userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
          }

          const abortController = new AbortController();
          conversationId = operationContext.conversationId;

          c.req.raw.signal?.addEventListener('abort', () => {
            ctx.logger.debug('Client disconnected, aborting operation', { conversationId });
            abortController.abort('Client disconnected');
          });

          operationContext.abortSignal = abortController.signal;
          ctx.logger.debug('Abort signal configured', { conversationId });

          memory = agent.getMemory();
          memoryAdapter = ctx.memoryAdapters.get(slug);
          const isFileBackedAgent = ctx.agentSpecs.has(slug);
          const conversationStorage = isFileBackedAgent ? memory : memoryAdapter;
          if (conversationStorage && operationContext.conversationId && operationContext.userId) {
            const existing = await conversationStorage.getConversation(operationContext.conversationId);
            if (!existing) {
              const title =
                operationContext.title ||
                (input.length > 50 ? `${input.substring(0, 50)}...` : input);
              await conversationStorage.createConversation({
                id: operationContext.conversationId,
                resourceId: slug,
                userId: operationContext.userId,
                title,
                metadata: {},
              });
            }
          }

          const traceId = `${operationContext.conversationId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
          operationContext.traceId = traceId;

          // Inject conversation-scoped negative ratings
          if (operationContext.conversationId) {
            const negativeRatings = ctx.feedbackService
              .getRatings()
              .filter(
                (r) =>
                  r.conversationId === operationContext.conversationId &&
                  r.rating === 'thumbs_down',
              );
            if (negativeRatings.length > 0) {
              const ratingLines = negativeRatings
                .map(
                  (r) =>
                    `- Message #${r.messageIndex} was rated negatively${r.reason ? `: "${r.reason}"` : ''}`,
                )
                .join('\n');
              const block = `<conversation_feedback>\nThe user has flagged these responses in this conversation:\n${ratingLines}\nAdjust your approach accordingly.\n</conversation_feedback>`;
              ragContext = ragContext ? `${ragContext}\n\n${block}` : block;
              feedbackOps.add(negativeRatings.length, { operation: 'inject-conversation' });
            }
          }

          // Inject RAG context into input
          let finalInput = input;
          const combinedContext = [injectContext, ragContext].filter(Boolean).join('\n\n') || null;
          if (combinedContext && typeof input === 'string') {
            finalInput = `${combinedContext}\n\n${input}`;
          } else if (combinedContext && Array.isArray(input)) {
            const clone = JSON.parse(JSON.stringify(input));
            const userMsg = clone.find((m: any) => m.role === 'user');
            if (userMsg?.parts) {
              const textPart = userMsg.parts.find((p: any) => p.type === 'text');
              if (textPart) textPart.text = `${combinedContext}\n\n${textPart.text}`;
            }
            finalInput = clone;
          }

          result = await agent.streamText(finalInput, operationContext);

          ctx.agentStatus.set(slug, 'running');

          if (ctx.monitoringEmitter) {
            ctx.monitoringEmitter.emitAgentStart({
              slug, conversationId: operationContext.conversationId, userId: operationContext.userId,
              traceId, input: typeof input === 'string' ? input : input?.text || '[complex input]',
            });
          }

          // Initialize stats if needed
          if (!ctx.agentStats.has(slug)) {
            const adapter = ctx.memoryAdapters.get(slug);
            if (adapter) {
              const conversations = await adapter.getConversations(slug);
              let totalMessages = 0;
              for (const conv of conversations) {
                const messages = await adapter.getMessages(conv.userId, conv.id);
                totalMessages += messages.length;
              }
              ctx.agentStats.set(slug, {
                conversationCount: conversations.length,
                messageCount: totalMessages,
                lastUpdated: Date.now(),
              });
            }
          }

          const suppressAbortError = (err: any) =>
            abortController.signal.aborted ? undefined : Promise.reject(err);
          result.text?.catch(suppressAbortError);
          result.usage?.catch(suppressAbortError);
          result.finishReason?.catch(suppressAbortError);

          const saveCancellationMessage = async () => {
            await StreamOrchestrator.saveCancellationMessage(agent, operationContext);
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
          toolCallCount = 0;
          currentStep = 0;
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
            | { modelId?: string; settings?: { maxTokens?: number; temperature?: number } }
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
            toolCallCount = results.metadata.toolCalls || 0;
          }

          if (abortController.signal.aborted) {
            completionReason = 'aborted';
            if (!hasOutput) await saveCancellationMessage();
          }
        } catch (error: any) {
          chatSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          chatSpan.recordException(error);
          const agentModelForError = agent.model as { modelId?: string } | undefined;
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
          ctx.logger.info('Agent stream completed', {
            conversationId: operationContext.conversationId,
            reason: completionReason,
          });

          ctx.agentStatus.set(slug, 'idle');

          const isFileBackedAgent = ctx.agentSpecs.has(slug);
          if (!isFileBackedAgent && memoryAdapter && conversationId && accumulatedText) {
            try {
              const userText =
                typeof input === 'string'
                  ? input
                  : Array.isArray(input)
                    ? input.find((m: any) => m.role === 'user')?.parts?.find((p: any) => p.type === 'text')?.text || ''
                    : '';
              if (userText) {
                await memoryAdapter.addMessage(
                  { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: userText }] },
                  operationContext.userId || getCachedUser().alias,
                  conversationId,
                );
              }
              await memoryAdapter.addMessage(
                { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text: accumulatedText }] },
                operationContext.userId || getCachedUser().alias,
                conversationId,
                { model: modelOverride || ctx.agentSpecs.get(slug)?.model },
              );
            } catch (e) {
              ctx.logger.error('Failed to persist messages for temp agent', { error: e });
            }
          }

          const finalOutput = accumulatedText.replace(reasoningText, '').trim();
          if (finalOutput) {
            artifacts.push({ type: 'text', content: finalOutput });
          }

          let usage: Record<string, any> | undefined;
          try {
            usage = await result.usage;
          } catch (_e) {
            // Usage might not be available
          }

          if (ctx.monitoringEmitter) {
            ctx.monitoringEmitter.emitAgentComplete({
              slug, conversationId: operationContext.conversationId, userId: operationContext.userId,
              traceId: requestTraceId, reason: completionReason, steps: currentStep,
              maxSteps: ctx.agentSpecs.get(slug)?.guardrails?.maxSteps,
              inputChars: typeof input === 'string' ? input.length : input?.text?.length || 0,
              outputChars: finalOutput.length,
              usage: usage ? { inputTokens: usage.promptTokens || usage.inputTokens || 0, outputTokens: usage.completionTokens || usage.outputTokens || 0 } : undefined,
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

          const inputTokens = usage?.promptTokens || usage?.inputTokens || 0;
          const outputTokens = usage?.completionTokens || usage?.outputTokens || 0;
          let estimatedCost = 0;
          if (usage && ctx.modelCatalog) {
            try {
              const modelId = modelOverride || ctx.agentSpecs.get(slug)?.model || ctx.appConfig.invokeModel;
              const p = await findModelPricing(ctx.modelCatalog, modelId, ctx.appConfig.region);
              estimatedCost = estimateCost(p, inputTokens, outputTokens);
            } catch (_e) { /* pricing lookup is best-effort */ }
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
          chatDuration.record(Date.now() - chatStartMs, { agent: slug, plugin });
          if (usage) {
            tokensInput.add(inputTokens, { agent: slug, plugin });
            tokensOutput.add(outputTokens, { agent: slug, plugin });
          }
          if (estimatedCost > 0) {
            costEstimated.add(estimatedCost, { agent: slug, plugin });
          }

          chatSpan.setAttribute('stallion.conversation_id', operationContext.conversationId || '');
          chatSpan.setAttribute('stallion.tokens.input', usage?.promptTokens || usage?.inputTokens || 0);
          chatSpan.setAttribute('stallion.tokens.output', usage?.completionTokens || usage?.outputTokens || 0);
          chatSpan.end();
        }
      });
    } catch (error: any) {
      ctx.logger.error('Chat error', { error });
      chatErrors.add(1, { agent: slug, plugin });
      const isCredentialError =
        error.message?.includes('credential') ||
        error.message?.includes('accessKeyId') ||
        error.message?.includes('secretAccessKey');
      return c.json({ success: false, error: error.message }, isCredentialError ? 401 : 500);
    }
  });

  return app;
}
