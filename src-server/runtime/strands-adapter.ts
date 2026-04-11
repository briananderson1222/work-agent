/**
 * Strands Agents SDK adapter — maps Strands API to the framework-agnostic interfaces.
 *
 * This is the counterpart to voltagent-adapter.ts. When the runtime config
 * sets `runtime: 'strands'`, this adapter is used instead of VoltAgent.
 *
 * Stream event mapping (Strands → IStreamChunk / TextStreamPart-compatible):
 *   modelContentBlockDeltaEvent { delta: { type: 'textDelta', text } }       → { type: 'text-delta', text }
 *   modelContentBlockDeltaEvent { delta: { type: 'reasoningContentDelta' } } → { type: 'reasoning-delta', text }
 *   modelContentBlockStartEvent { start: { type: 'toolUseStart', name } }    → { type: 'tool-call', toolName, toolCallId }
 *   toolResultEvent                                                           → { type: 'tool-result', toolName, output }
 *   modelMessageStopEvent                                                     → { type: 'finish', finishReason }
 *   modelMetadataEvent                                                        → (usage tracking)
 */

import {
  type AgentResult,
  BedrockModel,
  type McpClient,
  Agent as StrandsAgent,
} from '@strands-agents/sdk';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import { wireStrandsAgentHooks } from './strands-agent-hooks.js';
import { mapStrandsStreamEvent } from './strands-stream-events.js';
import {
  createStrandsFunctionTools,
  destroyStrandsAgentTools,
  loadStrandsTools,
} from './strands-tool-loader.js';
import type {
  AgentBundle,
  AgentCreationConfig,
  IAgent,
  IGenerateResult,
  IMemory,
  InvocationContext,
  IStreamChunk,
  IStreamResult,
  ITool,
} from './types.js';
import type { CreateAgentOptions } from './voltagent-adapter.js';

// ── IAgent wrapper around Strands Agent ────────────────

class StrandsAgentWrapper implements IAgent {
  private strandsAgent: StrandsAgent;
  private memory: IMemory | null;
  private tools: ITool[];
  /** Accumulated usage from the last stream — read by AfterInvocationEvent hook */
  _lastStreamUsage: {
    promptTokens?: number;
    completionTokens?: number;
  } | null = null;
  /** Mutable invocation context — updated per-request so hooks see conversationId/userId */
  _invocationCtx: InvocationContext;

  constructor(
    strandsAgent: StrandsAgent,
    public readonly id: string,
    public readonly name: string,
    public readonly model: any,
    memory: IMemory | null,
    invocationCtx: InvocationContext,
    tools: ITool[] = [],
  ) {
    this.strandsAgent = strandsAgent;
    this.memory = memory;
    this.tools = tools;
    this._invocationCtx = invocationCtx;
  }

  /** VoltAgent compat — used by server-core's handleGetAgents / handleListTools */
  getFullState() {
    return {
      id: this.id,
      name: this.name,
      status: 'idle',
      model: this.model,
      tools: this.tools,
      subAgents: [],
      memory: this.memory,
    };
  }
  getTools() {
    return this.tools;
  }
  isTelemetryConfigured() {
    return false;
  }

  async generateText(prompt: string, _options?: any): Promise<IGenerateResult> {
    // Use stream() internally to capture usage from modelMetadataEvent
    let fullText = '';
    let reasoning = '';
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for await (const event of this.strandsAgent.stream(prompt)) {
      if (event.type === 'agentResultEvent') {
        const agentResult = (event as any).result as AgentResult;
        fullText = agentResult.toString();
        const msg = agentResult.lastMessage;
        const reasoningBlocks =
          msg?.content?.filter((b: any) => b.type === 'reasoningBlock') || [];
        reasoning = reasoningBlocks
          .map((b: any) => b.reasoningText || b.text || '')
          .join('\n');
        continue;
      }
      // Capture usage from metadata events
      const mapped = mapStrandsStreamEvent(event);
      if (mapped && mapped.type === 'usage') {
        usage.promptTokens += (mapped as any).promptTokens || 0;
        usage.completionTokens += (mapped as any).completionTokens || 0;
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
      }
    }

    return { text: fullText, usage, reasoning: reasoning || undefined };
  }

  async streamText(input: string, _options?: any): Promise<IStreamResult> {
    // Merge per-request context (conversationId, userId) into shared invocationCtx
    if (_options) {
      if (_options.conversationId)
        this._invocationCtx.conversationId = _options.conversationId;
      if (_options.userId) this._invocationCtx.userId = _options.userId;
    }
    const agent = this.strandsAgent;
    let resolveUsage: (u: any) => void;
    let resolveFinish: (r: string) => void;
    let resolveText: (t: string) => void;

    const usagePromise = new Promise<any>((r) => {
      resolveUsage = r;
    });
    const finishPromise = new Promise<string>((r) => {
      resolveFinish = r;
    });
    const textPromise = new Promise<string>((r) => {
      resolveText = r;
    });

    const self = this;

    async function* streamGenerator(): AsyncIterable<IStreamChunk> {
      let fullText = '';
      const _emittedStart = false;
      let emittedTextStart = false;
      const stream = agent.stream(input);
      const accUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      self._lastStreamUsage = null;

      // Emit synthetic start events (VoltAgent emits these, UI expects them)
      yield { type: 'start', id: '0' };
      yield { type: 'start-step', id: '0' };

      for await (const event of stream) {
        if (event.type === 'agentResultEvent') {
          const agentResult = (event as any).result as AgentResult;
          resolveText(agentResult.toString());
          resolveFinish(agentResult.stopReason || 'end_turn');
          resolveUsage(accUsage);
          continue;
        }

        const mapped = mapStrandsStreamEvent(event);
        if (mapped) {
          // Accumulate usage from metadata events
          if (mapped.type === 'usage') {
            accUsage.promptTokens += (mapped as any).promptTokens || 0;
            accUsage.completionTokens += (mapped as any).completionTokens || 0;
            accUsage.totalTokens =
              accUsage.promptTokens + accUsage.completionTokens;
            self._lastStreamUsage = {
              promptTokens: accUsage.promptTokens,
              completionTokens: accUsage.completionTokens,
            };
          }
          // Emit synthetic text-start before first text-delta
          if (mapped.type === 'text-delta' && !emittedTextStart) {
            yield { type: 'text-start', id: '0' };
            emittedTextStart = true;
          }
          if (mapped.type === 'text-delta') fullText += mapped.text || '';
          yield mapped;
        }
      }

      // Emit synthetic boundary events
      if (emittedTextStart) yield { type: 'text-end', id: '0' };
      yield { type: 'finish-step', id: '0' };

      resolveText(fullText);
      resolveFinish('end_turn');
      resolveUsage(accUsage);
    }

    return {
      fullStream: streamGenerator(),
      text: textPromise,
      usage: usagePromise,
      finishReason: finishPromise,
    };
  }

  async generateObject(
    prompt: string,
    _options?: any,
  ): Promise<IGenerateResult> {
    // Use structuredOutputSchema if provided for native structured output
    const schema = _options?.structuredOutputSchema;
    if (schema) {
      const tempAgent = new StrandsAgent({
        model: this.strandsAgent.model,
        systemPrompt: (this.strandsAgent as any).systemPrompt,
        tools: [],
        structuredOutputSchema: schema,
      });
      const result = await tempAgent.invoke(prompt);
      const text = result.toString();
      return {
        object: result.structuredOutput ?? JSON.parse(text),
        text,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // Fallback: invoke and parse JSON from response
    const result = await this.strandsAgent.invoke(prompt);
    const text = result.toString();
    let object: any;
    try {
      const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      object = JSON.parse(cleaned);
    } catch (e) {
      console.debug('Failed to parse JSON from agent response:', e);
      object = { raw: text };
    }
    return {
      object,
      text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  getMemory(): IMemory | null {
    return this.memory;
  }
}

// ── Strands Framework Adapter ──────────────────────────

export class StrandsFramework {
  private mcpClients = new Map<string, McpClient>();
  /** Track which MCP clients belong to which agent slug */
  private agentMcpClients = new Map<string, string[]>();

  async createAgent(
    slug: string,
    spec: AgentSpec,
    config: AgentCreationConfig,
    opts: CreateAgentOptions,
  ): Promise<AgentBundle> {
    const model = await this.createModel(spec, config);
    const resolvedModel = model.config.modelId;
    const tools = await this.loadTools(slug, spec, opts);

    // Calculate fixed token counts
    const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
    const toolsJson = JSON.stringify(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    );
    const mcpServerTokens = Math.ceil(toolsJson.length / 4);

    // Shared denial set — BeforeToolCallEvent adds IDs, FunctionTool wrappers check them
    const deniedToolUseIds = new Set<string>();

    const resolvedPrompt =
      typeof opts.processedPrompt === 'function'
        ? opts.processedPrompt()
        : opts.processedPrompt;
    const strandsAgent = new StrandsAgent({
      model,
      systemPrompt: resolvedPrompt,
      tools: createStrandsFunctionTools(tools, deniedToolUseIds),
    });

    const invocationCtx: InvocationContext = { agentSlug: slug };

    // Wrap in IAgent — pass memory adapter so conversations persist
    const wrapper = new StrandsAgentWrapper(
      strandsAgent,
      slug,
      slug,
      model,
      opts.memoryAdapter as unknown as IMemory,
      invocationCtx,
      tools,
    );
    wireStrandsAgentHooks({
      strandsAgent,
      hooks: config.hooks,
      deniedToolUseIds,
      invocationCtx,
      memoryAdapter: opts.memoryAdapter as unknown as IMemory,
      logger: opts.logger,
      resolvedModel,
      getLastStreamUsage: () => wrapper._lastStreamUsage,
    });

    return {
      agent: wrapper,
      tools,
      memoryAdapter: opts.memoryAdapter,
      fixedTokens: { systemPromptTokens, mcpServerTokens },
    };
  }

  async loadTools(
    slug: string,
    spec: AgentSpec,
    opts: Pick<
      CreateAgentOptions,
      | 'configLoader'
      | 'mcpConfigs'
      | 'mcpConnectionStatus'
      | 'integrationMetadata'
      | 'toolNameMapping'
      | 'toolNameReverseMapping'
      | 'logger'
    >,
  ): Promise<ITool[]> {
    return loadStrandsTools({
      slug,
      spec,
      opts,
      state: {
        mcpClients: this.mcpClients,
        agentMcpClients: this.agentMcpClients,
      },
    });
  }

  async destroyAgent(slug: string): Promise<void> {
    await destroyStrandsAgentTools(slug, {
      mcpClients: this.mcpClients,
      agentMcpClients: this.agentMcpClients,
    });
  }

  async createModel(
    spec: AgentSpec,
    config: AgentCreationConfig,
  ): Promise<any> {
    const modelId = spec.model || config.appConfig.defaultModel;
    const resolvedModel = config.modelCatalog
      ? await config.modelCatalog.resolveModelId(modelId)
      : modelId;
    return new BedrockModel({
      modelId: resolvedModel,
      region: spec.region || config.appConfig.region,
      maxTokens:
        spec.guardrails?.maxTokens ?? config.appConfig.defaultMaxOutputTokens,
      temperature: spec.guardrails?.temperature,
      topP: spec.guardrails?.topP,
    });
  }

  async createTempAgent(opts: {
    name: string;
    instructions: string | (() => string);
    model: any;
    tools?: ITool[];
    maxSteps?: number;
  }): Promise<IAgent> {
    const resolved =
      typeof opts.instructions === 'function'
        ? opts.instructions()
        : opts.instructions;
    const agent = new StrandsAgent({
      model: opts.model,
      systemPrompt: resolved,
      tools: createStrandsFunctionTools(opts.tools || [], new Set<string>()),
    });
    return new StrandsAgentWrapper(
      agent,
      opts.name,
      opts.name,
      opts.model,
      null,
      { agentSlug: opts.name },
      opts.tools,
    );
  }

  async shutdown(): Promise<void> {
    for (const [, client] of this.mcpClients) {
      await client.disconnect().catch(() => {});
    }
    this.mcpClients.clear();
  }
}
