import type { AgentSpec } from '@stallion-ai/contracts/agent';
import { jsonSchema } from 'ai';
import { DEFAULT_SYSTEM_PROMPT } from '../domain/config-loader.js';
import type { ITool, RuntimeContext } from '../runtime/types.js';

export async function invokeGlobalPrompt(
  ctx: RuntimeContext,
  payload: {
    prompt: string;
    schema: unknown;
    tools?: string[];
    maxSteps?: number;
    model?: string;
    structureModel?: string;
    system?: string;
  },
) {
  const {
    prompt,
    schema,
    tools: toolIds = [],
    maxSteps = 10,
    model,
    structureModel,
    system,
  } = payload;

  const filteredTools =
    toolIds.length > 0
      ? (toolIds
          .map((id) => ctx.globalToolRegistry.get(id))
          .filter(Boolean) as ITool[])
      : [];

  const invokeModelId = model || ctx.appConfig.invokeModel;
  const structureModelId = structureModel || ctx.appConfig.structureModel;

  const mainModel = await ctx.createBedrockModel({
    model: ctx.modelCatalog
      ? await ctx.modelCatalog.resolveModelId(invokeModelId)
      : invokeModelId,
  } as AgentSpec);

  const fastModel = await ctx.createBedrockModel({
    model: ctx.modelCatalog
      ? await ctx.modelCatalog.resolveModelId(structureModelId)
      : structureModelId,
  } as AgentSpec);

  const resolvedDefault = ctx.appConfig.systemPrompt
    ? ctx.replaceTemplateVariables(ctx.appConfig.systemPrompt)
    : ctx.replaceTemplateVariables(DEFAULT_SYSTEM_PROMPT);

  const tempAgent = await ctx.framework.createTempAgent({
    name: `invoke-${Date.now()}`,
    instructions: system || resolvedDefault,
    model: mainModel,
    tools: filteredTools,
    maxSteps,
  });

  const tempConversationId = `invoke-${Date.now()}`;
  const textResult = await tempAgent.generateText(prompt, {
    conversationId: tempConversationId,
    userId: 'invoke-user',
  });

  if (!schema) {
    return {
      success: true,
      response: textResult.text,
      usage: textResult.usage,
      steps: textResult.steps?.length || 0,
    };
  }

  const structureAgent = await ctx.framework.createTempAgent({
    name: `invoke-structure-${Date.now()}`,
    instructions: 'Format the provided information as structured JSON.',
    model: fastModel || mainModel,
    tools: [],
    maxSteps: 1,
  });

  const objectResult = await (
    structureAgent as {
      generateObject(
        prompt: string,
        schema: unknown,
        options: unknown,
      ): Promise<{
        object: unknown;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
      }>;
    }
  ).generateObject(
    `${textResult.text}\n\nFormat the above information as structured JSON.`,
    jsonSchema(schema),
    { conversationId: tempConversationId, userId: 'invoke-user' },
  );

  return {
    success: true,
    response: objectResult.object,
    usage: {
      promptTokens:
        (textResult.usage?.promptTokens || 0) +
        (objectResult.usage?.promptTokens || 0),
      completionTokens:
        (textResult.usage?.completionTokens || 0) +
        (objectResult.usage?.completionTokens || 0),
      totalTokens:
        (textResult.usage?.totalTokens || 0) +
        (objectResult.usage?.totalTokens || 0),
    },
    steps: textResult.steps?.length || 0,
  };
}
