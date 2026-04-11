import type { ITool, RuntimeContext } from '../runtime/types.js';
import { errorMessage } from './schemas.js';

export async function resolveChatAgentModelOverride({
  ctx,
  slug,
  modelOverride,
  agent,
}: {
  ctx: RuntimeContext;
  slug: string;
  modelOverride?: string;
  agent: any;
}): Promise<{
  agent: any;
  status?: number;
  error?: string;
}> {
  if (!modelOverride) {
    return { agent };
  }

  if (ctx.modelCatalog) {
    try {
      const isValid = await ctx.modelCatalog.validateModelId(modelOverride);
      if (!isValid) {
        return {
          agent,
          status: 400,
          error: `Invalid model ID: ${modelOverride}. Please select a valid model from the list.`,
        };
      }
    } catch (validationError: unknown) {
      ctx.logger.warn('Model validation failed', {
        modelOverride,
        error: validationError,
      });
    }
  }

  const cacheKey = `${slug}:${modelOverride}`;
  const cachedAgent = ctx.activeAgents.get(cacheKey);
  if (cachedAgent) {
    return { agent: cachedAgent };
  }

  try {
    const originalSpec = ctx.agentSpecs.get(slug);
    const originalTools = ctx.agentTools.get(slug);

    const resolvedModel = ctx.modelCatalog
      ? await ctx.modelCatalog.resolveModelId(modelOverride)
      : modelOverride;
    const model = await ctx.createBedrockModel({
      model: resolvedModel,
      region: originalSpec?.region || ctx.appConfig.region,
    } as Parameters<typeof ctx.createBedrockModel>[0]);

    const tempWrapper = await ctx.framework.createTempAgent({
      name: cacheKey,
      instructions: (agent as { instructions?: string }).instructions || '',
      model,
      tools: originalTools as unknown as ITool[],
    });
    const resolvedAgent =
      ((tempWrapper as { raw?: unknown }).raw as typeof agent) || tempWrapper;

    ctx.activeAgents.set(cacheKey, resolvedAgent);
    ctx.logger.info('Created agent with model override', {
      slug,
      modelOverride,
    });

    return { agent: resolvedAgent };
  } catch (modelError: unknown) {
    ctx.logger.error('Failed to create agent with model override', {
      slug,
      modelOverride,
      error: modelError,
    });
    return {
      agent,
      status: 500,
      error: `Failed to switch to model ${modelOverride}: ${errorMessage(modelError)}`,
    };
  }
}
