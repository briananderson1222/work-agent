import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import type { RuntimeContext } from '../runtime/types.js';
import { errorMessage } from './schemas.js';

export interface ChatMessage {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
}

interface PrepareChatRequestContext {
  ctx: Pick<
    RuntimeContext,
    | 'providerService'
    | 'knowledgeService'
    | 'feedbackService'
    | 'storageAdapter'
    | 'logger'
  >;
  input: string | ChatMessage[];
  options: Record<string, any>;
  projectSlug?: string;
}

export async function prepareChatRequest(
  context: PrepareChatRequestContext,
): Promise<{
  options: Record<string, any>;
  useAlternateProvider: boolean;
  resolvedProviderConn: ProviderConnectionConfig | null;
  injectContext: string | null;
  ragContext: string | null;
}> {
  const options = { ...context.options };
  let useAlternateProvider = false;
  let resolvedProviderConn: ProviderConnectionConfig | null = null;

  if (options.providerManagedFallback) {
    try {
      const resolved = await context.ctx.providerService.resolveProvider({
        conversationProviderId:
          typeof options.providerId === 'string'
            ? options.providerId
            : undefined,
        conversationModel:
          typeof options.providerModel === 'string'
            ? options.providerModel
            : typeof options.model === 'string'
              ? options.model
              : undefined,
        projectSlug: context.projectSlug,
      });
      if (resolved.model) {
        options.model = resolved.model;
      }
      if (resolved.providerId) {
        options.providerId = resolved.providerId;
      }
      if (resolved.providerId) {
        const connections =
          context.ctx.providerService.listProviderConnections();
        resolvedProviderConn =
          connections.find(
            (connection) => connection.id === resolved.providerId,
          ) ?? null;
        if (resolvedProviderConn && resolvedProviderConn.type !== 'bedrock') {
          useAlternateProvider = true;
        }
      }
    } catch (err: unknown) {
      if (options.providerManagedFallback) {
        throw err;
      }
      context.ctx.logger.warn('Failed to resolve chat provider', {
        projectSlug: context.projectSlug,
        error: errorMessage(err),
      });
    }
  }

  let injectContext: string | null = null;
  if (context.projectSlug) {
    try {
      injectContext = await context.ctx.knowledgeService.getInjectContext(
        context.projectSlug,
      );
    } catch (err: unknown) {
      context.ctx.logger.debug('Inject context retrieval failed', {
        projectSlug: context.projectSlug,
        error: errorMessage(err),
      });
    }
  }

  let ragContext: string | null = null;
  if (context.projectSlug) {
    try {
      const userMessage = extractChatUserText(context.input);
      if (userMessage) {
        ragContext = await context.ctx.knowledgeService.getRAGContext(
          context.projectSlug,
          userMessage,
        );
      }
    } catch (err: unknown) {
      context.ctx.logger.debug('RAG context retrieval failed', {
        projectSlug: context.projectSlug,
        error: errorMessage(err),
      });
    }
  }

  const feedbackGuidelines =
    context.ctx.feedbackService.getBehaviorGuidelines();
  if (feedbackGuidelines) {
    ragContext = ragContext
      ? `${ragContext}\n\n${feedbackGuidelines}`
      : feedbackGuidelines;
  }

  return {
    options,
    useAlternateProvider,
    resolvedProviderConn,
    injectContext,
    ragContext,
  };
}

export function extractChatUserText(input: string | ChatMessage[]): string {
  if (typeof input === 'string') {
    return input;
  }

  if (!Array.isArray(input)) {
    return '';
  }

  return (
    input
      .find((message) => message.role === 'user')
      ?.parts?.find((part) => part.type === 'text')?.text || ''
  );
}
