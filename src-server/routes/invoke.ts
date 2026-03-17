import { jsonSchema } from 'ai';
import { Hono } from 'hono';
import { DEFAULT_SYSTEM_PROMPT } from '../domain/config-loader.js';
import type { AgentSpec } from '../domain/types.js';
import type { RuntimeContext } from '../runtime/types.js';
import { isAuthError } from '../utils/auth-errors.js';
import { invokeSchema, invokeStreamSchema, toolApprovalSchema, globalInvokeSchema, validate } from './schemas.js';

interface ToolResult {
  content?: Array<{ text: string }>;
  success?: boolean;
  error?: { message?: string | { message?: string } };
  response?: any;
  [key: string]: any;
}

function unwrapMCPResult(toolResult: any): any {
  if ((toolResult as ToolResult)?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse((toolResult as ToolResult).content![0].text);
      if (parsed?.content?.[0]?.text) {
        return JSON.parse(parsed.content[0].text);
      }
      return parsed;
    } catch (e) {
      console.debug('Failed to parse MCP result JSON:', e);
      return (toolResult as ToolResult).content![0].text;
    }
  }
  return toolResult;
}

export function createInvokeRoutes(ctx: RuntimeContext) {
  const app = new Hono();

  // POST /agents/:slug/invoke — silent agent invocation
  app.post('/agents/:slug/invoke', validate(invokeSchema), async (c) => {
    try {
      const slug = c.req.param('slug');
      const { input, model, tools: toolNames, schema } = c.get('body');

      const agent = ctx.activeAgents.get(slug);
      if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

      let prompt = input;
      if (schema) {
        prompt = `${input}\n\nYou must return your response as valid JSON matching this exact schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object, no markdown formatting, no explanations.`;
      }

      const options: any = {};
      if (model && ctx.modelCatalog) {
        const resolvedModel = await ctx.modelCatalog.resolveModelId(model);
        options.model = await ctx.createBedrockModel({ model: resolvedModel } as AgentSpec);
      }

      if (toolNames && Array.isArray(toolNames)) {
        const agentTools = ctx.agentTools.get(slug) || [];
        options.tools = agentTools.filter((t: any) => toolNames.includes(t.name));
      }

      const result = await agent.generateText(prompt, options);

      let response = result.text;
      if (schema && typeof result.text === 'string') {
        try {
          let jsonText = result.text.trim();
          const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch) jsonText = jsonMatch[1].trim();
          response = JSON.parse(jsonText);
        } catch (e) {
          ctx.logger.warn('Failed to parse JSON response', { error: e, text: result.text });
        }
      }

      return c.json({
        success: true,
        response,
        usage: result.usage,
        steps: result.steps,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        reasoning: result.reasoning,
      });
    } catch (error: any) {
      ctx.logger.error('Failed to invoke agent', { error });
      return c.json({ success: false, error: error.message }, isAuthError(error) ? 401 : 500);
    }
  });

  // POST /agents/:slug/tools/:toolName — raw MCP tool call
  app.post('/agents/:slug/tools/:toolName', async (c) => {
    const startTime = performance.now();
    try {
      const slug = c.req.param('slug');
      const toolName = c.req.param('toolName');
      const toolArgs = await c.req.json();

      let resolvedSlug = slug;
      let agent = ctx.activeAgents.get(resolvedSlug);
      if (!agent) {
        const nsMatch = Array.from(ctx.activeAgents.keys()).find((k) => k.endsWith(`:${slug}`));
        if (nsMatch) { resolvedSlug = nsMatch; agent = ctx.activeAgents.get(resolvedSlug); }
      }
      if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

      const allTools = ctx.agentTools.get(resolvedSlug) || [];
      let tool = allTools.find((t) => t.name === toolName);
      if (!tool) {
        const normalized = ctx.getNormalizedToolName(toolName);
        tool = allTools.find((t) => t.name === normalized);
      }
      if (!tool) return c.json({ success: false, error: `Tool ${toolName} not found` }, 404);

      const toolStart = performance.now();
      const toolResult = await (tool as any).execute(toolArgs);
      const toolDuration = performance.now() - toolStart;

      return c.json({
        success: true,
        response: unwrapMCPResult(toolResult),
        metadata: {
          toolDuration: Math.round(toolDuration),
          totalDuration: Math.round(performance.now() - startTime),
        },
      });
    } catch (error: any) {
      ctx.logger.error('Failed to call tool', { error });
      return c.json({ success: false, error: error.message }, isAuthError(error) ? 401 : 500);
    }
  });

  // POST /agents/:slug/invoke/stream
  app.post('/agents/:slug/invoke/stream', validate(invokeStreamSchema), async (c) => {
    try {
      const slug = c.req.param('slug');
      const { prompt, model, tools: toolNames, maxSteps = 10, schema: schemaJson } = c.get('body');

      const agent = ctx.activeAgents.get(slug);
      if (!agent) return c.json({ success: false, error: 'Agent not found' }, 404);

      const options: any = { maxSteps, maxOutputTokens: 2000 };
      if (model && ctx.modelCatalog) {
        const resolvedModel = await ctx.modelCatalog.resolveModelId(model);
        options.model = await ctx.createBedrockModel({ model: resolvedModel } as AgentSpec);
      }

      if (toolNames && Array.isArray(toolNames)) {
        const allTools = ctx.agentTools.get(slug) || [];
        const filteredTools = allTools.filter((t) => toolNames.includes(t.name));

        const tempAgent = await ctx.framework.createTempAgent({
          name: `${slug}-temp`,
          instructions: (agent as any).instructions || '',
          model: options.model || agent.model,
          tools: filteredTools as any[],
          maxSteps,
        });

        if (schemaJson) {
          const textResult = await tempAgent.generateText(
            `${prompt}\n\nReturn ONLY valid JSON matching this schema (no markdown, no explanation):\n${JSON.stringify(schemaJson, null, 2)}`,
          );
          let parsed: unknown;
          try {
            const cleaned = textResult.text!.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(cleaned);
          } catch (e) {
            console.debug('Failed to parse JSON from agent response:', e);
            const jsonMatch = textResult.text!.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse JSON' };
          }
          return c.json({ success: true, response: parsed, usage: textResult.usage });
        }

        const result = await tempAgent.generateText(prompt);
        return c.json({ success: true, response: result.text, usage: result.usage });
      }

      const result = schemaJson
        ? await agent.generateObject(prompt, jsonSchema(schemaJson) as unknown as any, options)
        : await agent.generateText(prompt, options);

      return c.json({
        success: true,
        response: schemaJson ? result.object : result.text,
        usage: result.usage,
      });
    } catch (error: any) {
      ctx.logger.error('Failed to stream invoke', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // POST /tool-approval/:approvalId
  app.post('/tool-approval/:approvalId', validate(toolApprovalSchema), async (c) => {
    try {
      const approvalId = c.req.param('approvalId');
      const { approved } = c.get('body');

      ctx.logger.info('[Approval Endpoint] Received approval response', { approvalId, approved });

      if (ctx.approvalRegistry.resolve(approvalId, approved)) {
        return c.json({ success: true });
      }

      ctx.logger.warn('[Approval Endpoint] Approval request not found', { approvalId });
      return c.json({ success: false, error: 'Approval request not found' }, 404);
    } catch (error: any) {
      ctx.logger.error('Approval response error', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

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
      } = c.get('body');

      const filteredTools =
        toolIds.length > 0
          ? toolIds.map((id: string) => ctx.globalToolRegistry.get(id)).filter(Boolean)
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

      const tempConvId = `invoke-${Date.now()}`;
      const textResult = await tempAgent.generateText(prompt, {
        conversationId: tempConvId,
        userId: 'invoke-user',
      });

      if (!schema) {
        return c.json({
          success: true,
          response: textResult.text,
          usage: textResult.usage,
          steps: textResult.steps?.length || 0,
        });
      }

      const structureAgent = await ctx.framework.createTempAgent({
        name: `invoke-structure-${Date.now()}`,
        instructions: 'Format the provided information as structured JSON.',
        model: fastModel || mainModel,
        tools: [],
        maxSteps: 1,
      });

      const objectResult = await (structureAgent as any).generateObject(
        `${textResult.text}\n\nFormat the above information as structured JSON.`,
        jsonSchema(schema) as unknown as any,
        { conversationId: tempConvId, userId: 'invoke-user' },
      );

      return c.json({
        success: true,
        response: objectResult.object,
        usage: {
          promptTokens: (textResult.usage?.promptTokens || 0) + (objectResult.usage?.promptTokens || 0),
          completionTokens: (textResult.usage?.completionTokens || 0) + (objectResult.usage?.completionTokens || 0),
          totalTokens: (textResult.usage?.totalTokens || 0) + (objectResult.usage?.totalTokens || 0),
        },
        steps: textResult.steps?.length || 0,
      });
    } catch (error: any) {
      ctx.logger.error('Failed to invoke', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
