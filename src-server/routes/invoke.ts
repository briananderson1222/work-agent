import { jsonSchema } from 'ai';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import { Hono } from 'hono';
import type { ITool, RuntimeContext } from '../runtime/types.js';
import { chatRequests } from '../telemetry/metrics.js';
import {
  invokeAgent,
  invokeAgentTool,
  invokeErrorResponse,
} from './invoke-agent.js';
import { invokeGlobalPrompt } from './invoke-global.js';
import {
  errorMessage,
  getBody,
  globalInvokeSchema,
  invokeSchema,
  invokeStreamSchema,
  param,
  toolApprovalSchema,
  validate,
} from './schemas.js';

export function createInvokeRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  // POST /agents/:slug/invoke — silent agent invocation
  app.post('/agents/:slug/invoke', validate(invokeSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const { input, model, tools: toolNames, schema } = getBody(c);
      chatRequests.add(1, { op: 'invoke' });
      const { response } = await invokeAgent(
        ctx,
        slug,
        input,
        model,
        toolNames,
        schema,
      );
      return response;
    } catch (error: unknown) {
      return invokeErrorResponse(ctx.logger, 'Failed to invoke agent', error);
    }
  });

  // POST /agents/:slug/tools/:toolName — raw MCP tool call
  app.post('/agents/:slug/tools/:toolName', async (c) => {
    const startTime = performance.now();
    try {
      const slug = param(c, 'slug');
      const toolName = param(c, 'toolName');
      const toolArgs = await c.req.json();
      return await invokeAgentTool(ctx, slug, toolName, toolArgs, startTime);
    } catch (error: unknown) {
      return invokeErrorResponse(ctx.logger, 'Failed to call tool', error);
    }
  });

  // POST /agents/:slug/invoke/stream
  app.post(
    '/agents/:slug/invoke/stream',
    validate(invokeStreamSchema),
    async (c) => {
      try {
        const slug = param(c, 'slug');
        const {
          prompt,
          model,
          tools: toolNames,
          maxSteps = 10,
          schema: schemaJson,
        } = getBody(c);
        chatRequests.add(1, { op: 'invoke_stream' });

        const agent = ctx.activeAgents.get(slug);
        if (!agent)
          return c.json({ success: false, error: 'Agent not found' }, 404);

        const options: Record<string, unknown> & {
          maxSteps: number;
          maxOutputTokens: number;
        } = { maxSteps, maxOutputTokens: 2000 };
        if (model && ctx.modelCatalog) {
          const resolvedModel = await ctx.modelCatalog.resolveModelId(model);
          options.model = await ctx.createBedrockModel({
            model: resolvedModel,
          } as AgentSpec);
        }

        if (toolNames && Array.isArray(toolNames)) {
          const allTools = ctx.agentTools.get(slug) || [];
          const filteredTools = allTools.filter((t) =>
            toolNames.includes(t.name),
          );

          const tempAgent = await ctx.framework.createTempAgent({
            name: `${slug}-temp`,
            instructions:
              (agent as { instructions?: string }).instructions || '',
            model: options.model || agent.model,
            tools: filteredTools as unknown as ITool[],
            maxSteps,
          });

          if (schemaJson) {
            const textResult = await tempAgent.generateText(
              `${prompt}\n\nReturn ONLY valid JSON matching this schema (no markdown, no explanation):\n${JSON.stringify(schemaJson, null, 2)}`,
            );
            let parsed: unknown;
            try {
              const cleaned = textResult
                .text!.replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
              parsed = JSON.parse(cleaned);
            } catch (e) {
              console.debug('Failed to parse JSON from agent response:', e);
              const jsonMatch = textResult.text!.match(/\{[\s\S]*\}/);
              parsed = jsonMatch
                ? JSON.parse(jsonMatch[0])
                : { error: 'Failed to parse JSON' };
            }
            return c.json({
              success: true,
              response: parsed,
              usage: textResult.usage,
            });
          }

          const result = await tempAgent.generateText(prompt);
          return c.json({
            success: true,
            response: result.text,
            usage: result.usage,
          });
        }

        const result = schemaJson
          ? await agent.generateObject(
              prompt,
              jsonSchema(schemaJson) as unknown as Parameters<
                typeof agent.generateObject
              >[1],
              options,
            )
          : await agent.generateText(prompt, options);

        return c.json({
          success: true,
          response: schemaJson ? result.object : result.text,
          usage: result.usage,
        });
      } catch (error: unknown) {
        ctx.logger.error('Failed to stream invoke', { error });
        return c.json({ success: false, error: errorMessage(error) }, 500);
      }
    },
  );

  // POST /tool-approval/:approvalId
  app.post(
    '/tool-approval/:approvalId',
    validate(toolApprovalSchema),
    async (c) => {
      try {
        const approvalId = param(c, 'approvalId');
        const { approved } = getBody(c);

        ctx.logger.info('[Approval Endpoint] Received approval response', {
          approvalId,
          approved,
        });

        if (ctx.approvalRegistry.resolve(approvalId, approved)) {
          return c.json({ success: true });
        }

        ctx.logger.warn('[Approval Endpoint] Approval request not found', {
          approvalId,
        });
        return c.json(
          { success: false, error: 'Approval request not found' },
          404,
        );
      } catch (error: unknown) {
        ctx.logger.error('Approval response error', { error });
        return c.json({ success: false, error: errorMessage(error) }, 500);
      }
    },
  );

  // POST /invoke — global invoke using globalToolRegistry
  app.post('/invoke', validate(globalInvokeSchema), async (c) => {
    try {
      const {
        prompt,
        schema,
        tools: toolIds = [],
        maxSteps = 10,
        model,
        structureModel,
        system,
      } = getBody(c);
      chatRequests.add(1, { op: 'invoke_global' });
      const response = await invokeGlobalPrompt(ctx, {
        prompt,
        schema,
        tools: toolIds,
        maxSteps,
        model,
        structureModel,
        system,
      });
      return c.json(response);
    } catch (error: unknown) {
      ctx.logger.error('Failed to invoke', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
