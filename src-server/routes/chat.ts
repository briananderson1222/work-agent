/**
 * Chat Routes - POST /:slug/chat SSE streaming endpoint
 * Extracted from stallion-runtime.ts lines 1940-2800
 */

import { Hono } from 'hono';
import type { RuntimeContext } from '../runtime/types.js';
import { chatErrors } from '../telemetry/metrics.js';
import { streamAlternateProviderChat } from './chat-alternate-provider.js';
import { resolveChatAgentModelOverride } from './chat-model-override.js';
import {
  logDebugChatImages,
  streamPrimaryAgentChat,
} from './chat-primary-stream.js';
import {
  type ChatMessage,
  prepareChatRequest,
} from './chat-request-preparation.js';
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
      const ragContext = preparedRagContext;

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

      logDebugChatImages(ctx.logger, input as string | ChatMessage[]);

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

      return streamPrimaryAgentChat({
        c,
        ctx,
        slug,
        plugin,
        input: input as string | ChatMessage[],
        restOptions,
        injectContext,
        ragContext,
        modelOverride,
        agent,
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
