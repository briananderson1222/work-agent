import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { RuntimeContext } from '../runtime/types.js';
import { isAuthError } from '../utils/auth-errors.js';
import { errorMessage } from './schemas.js';

interface ToolResult {
  content?: Array<{ text: string }>;
  success?: boolean;
  error?: { message?: string | { message?: string } };
  response?: unknown;
  [key: string]: unknown;
}

export function unwrapMCPResult(toolResult: unknown): unknown {
  if ((toolResult as ToolResult)?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse((toolResult as ToolResult).content![0].text);
      if (parsed?.content?.[0]?.text) {
        return JSON.parse(parsed.content[0].text);
      }
      return parsed;
    } catch (error) {
      console.debug('Failed to parse MCP result JSON:', error);
      return (toolResult as ToolResult).content![0].text;
    }
  }
  return toolResult;
}

export async function invokeAgent(
  ctx: RuntimeContext,
  slug: string,
  input: string,
  model: string | undefined,
  toolNames: string[] | undefined,
  schema: unknown,
) {
  const agent = ctx.activeAgents.get(slug);
  if (!agent) {
    return {
      response: Response.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      ),
    };
  }

  let prompt = input;
  if (schema) {
    prompt = `${input}\n\nYou must return your response as valid JSON matching this exact schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object, no markdown formatting, no explanations.`;
  }

  const options: Record<string, unknown> = {};
  if (model && ctx.modelCatalog) {
    const resolvedModel = await ctx.modelCatalog.resolveModelId(model);
    options.model = await ctx.createBedrockModel({
      model: resolvedModel,
    } as AgentSpec);
  }

  if (toolNames && Array.isArray(toolNames)) {
    const agentTools = ctx.agentTools.get(slug) || [];
    options.tools = agentTools.filter((tool) => toolNames.includes(tool.name));
  }

  const result = await agent.generateText(prompt, options);

  let response: unknown = result.text;
  if (schema && typeof result.text === 'string') {
    try {
      let jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      response = JSON.parse(jsonText);
    } catch (error) {
      ctx.logger.warn('Failed to parse JSON response', {
        error,
        text: result.text,
      });
    }
  }

  return {
    response: Response.json({
      success: true,
      response,
      usage: result.usage,
      steps: result.steps,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      reasoning: result.reasoning,
    }),
  };
}

export async function invokeAgentTool(
  ctx: RuntimeContext,
  slug: string,
  toolName: string,
  toolArgs: unknown,
  startTime: number,
) {
  let resolvedSlug = slug;
  let agent = ctx.activeAgents.get(resolvedSlug);
  if (!agent) {
    const namespacedMatch = Array.from(ctx.activeAgents.keys()).find((key) =>
      key.endsWith(`:${slug}`),
    );
    if (namespacedMatch) {
      resolvedSlug = namespacedMatch;
      agent = ctx.activeAgents.get(resolvedSlug);
    }
  }
  if (!agent) {
    return Response.json(
      { success: false, error: 'Agent not found' },
      { status: 404 },
    );
  }

  const allTools = ctx.agentTools.get(resolvedSlug) || [];
  let tool = allTools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    const normalized = ctx.getNormalizedToolName(toolName);
    tool = allTools.find((candidate) => candidate.name === normalized);
  }
  if (!tool) {
    return Response.json(
      { success: false, error: `Tool ${toolName} not found` },
      { status: 404 },
    );
  }

  const toolStart = performance.now();
  const toolResult = await (
    tool as { execute(args: unknown): Promise<unknown> }
  ).execute(toolArgs);
  const toolDuration = performance.now() - toolStart;

  return Response.json({
    success: true,
    response: unwrapMCPResult(toolResult),
    metadata: {
      toolDuration: Math.round(toolDuration),
      totalDuration: Math.round(performance.now() - startTime),
    },
  });
}

export function invokeErrorResponse(
  logger: RuntimeContext['logger'],
  message: string,
  error: unknown,
) {
  logger.error(message, { error });
  return Response.json(
    { success: false, error: errorMessage(error) },
    { status: isAuthError(error) ? 401 : 500 },
  );
}
