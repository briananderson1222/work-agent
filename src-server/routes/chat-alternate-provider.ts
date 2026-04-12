import { stream } from 'hono/streaming';
import type { LLMMessage } from '../providers/model-provider-types.js';
import type { RuntimeContext } from '../runtime/types.js';
import {
  createLLMProviderFromConfig,
  streamWithProvider,
} from '../services/llm-router.js';
import { getCachedUser } from './auth.js';
import {
  type ChatMessage,
  extractChatUserText,
} from './chat-request-preparation.js';
import { errorMessage } from './schemas.js';

export async function buildAlternateProviderMessages({
  ctx,
  slug,
  input,
  options,
  injectContext,
  ragContext,
}: {
  ctx: RuntimeContext;
  slug: string;
  input: string | ChatMessage[];
  options: Record<string, any> & { conversationId?: string; userId?: string };
  injectContext: string | null;
  ragContext: string | null;
}): Promise<LLMMessage[]> {
  const messages: LLMMessage[] = [];

  const agentSpec = ctx.agentSpecs.get(slug);
  const globalPrompt = ctx.appConfig.systemPrompt
    ? ctx.replaceTemplateVariables(ctx.appConfig.systemPrompt)
    : '';
  const agentPrompt = agentSpec?.prompt
    ? ctx.replaceTemplateVariables(agentSpec.prompt)
    : '';
  const combinedPrompt = [globalPrompt, agentPrompt]
    .filter(Boolean)
    .join('\n\n');
  const systemPrompt = [injectContext, ragContext, combinedPrompt]
    .filter(Boolean)
    .join('\n\n');
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  if (options.conversationId) {
    try {
      const adapter = ctx.memoryAdapters.get(slug);
      if (adapter) {
        const userId = options.userId || getCachedUser().alias;
        const history = await adapter.getMessages(
          userId,
          options.conversationId,
        );
        if (history) {
          for (const message of history) {
            const content = (message.parts || [])
              .filter(
                (part: { type: string; text?: string }) => part.type === 'text',
              )
              .map((part: { type: string; text?: string }) => part.text)
              .join('\n');
            if (content) {
              messages.push({
                role: message.role as LLMMessage['role'],
                content,
              });
            }
          }
        }
      }
    } catch (error) {
      console.debug('Failed to load conversation history:', error);
    }
  }

  messages.push({ role: 'user', content: extractChatUserText(input) });
  return messages;
}

export function streamAlternateProviderChat({
  c,
  ctx,
  slug,
  input,
  options,
  injectContext,
  ragContext,
  resolvedProviderConn,
}: {
  c: any;
  ctx: RuntimeContext;
  slug: string;
  input: string | ChatMessage[];
  options: Record<string, any> & {
    conversationId?: string;
    userId?: string;
    model?: string;
  };
  injectContext: string | null;
  ragContext: string | null;
  resolvedProviderConn: any;
}) {
  const llmProvider = createLLMProviderFromConfig(resolvedProviderConn);
  if (!llmProvider) return null;

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(
    c,
    async (streamWriter: { write(data: string): Promise<unknown> }) => {
      const conversationId = options.conversationId || `${slug}:${Date.now()}`;
      const messages = await buildAlternateProviderMessages({
        ctx,
        slug,
        input,
        options,
        injectContext,
        ragContext,
      });

      try {
        await streamWithProvider(
          llmProvider,
          options.model ||
            (resolvedProviderConn.config?.defaultModel as string) ||
            'default',
          messages,
          {
            write: async (data: string) => {
              await streamWriter.write(data);
            },
          },
          conversationId,
          c.req.raw.signal,
        );
      } catch (error: unknown) {
        await streamWriter.write(
          `data: ${JSON.stringify({ type: 'error', error: errorMessage(error) })}\n\n`,
        );
      }
    },
  );
}
