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
  Agent as StrandsAgent,
  BedrockModel,
  McpClient,
  type AgentStreamEvent,
  type AgentResult,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  AfterInvocationEvent,
} from '@strands-agents/sdk';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AgentSpec, AppConfig } from '../domain/types.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type {
  AgentBundle,
  AgentCreationConfig,
  IAgent,
  IAgentHooks,
  IGenerateResult,
  IMemory,
  IStreamChunk,
  IStreamResult,
  ITool,
  TokenUsage,
} from './types.js';
import type { CreateAgentOptions } from './voltagent-adapter.js';
import {
  normalizeToolName,
  parseToolName,
} from '../utils/tool-name-normalizer.js';

// ── Stream event mapper: Strands → IStreamChunk ────────

function mapStreamEvent(event: AgentStreamEvent): IStreamChunk | null {
  // Model stream events are wrapped in ModelStreamUpdateEvent
  if (event.type === 'modelStreamUpdateEvent') {
    const inner = (event as any).event;
    if (!inner) return null;

    switch (inner.type) {
      case 'modelContentBlockDeltaEvent': {
        const delta = inner.delta;
        if (!delta) return null;
        if (delta.type === 'textDelta') {
          return { type: 'text-delta', text: delta.text || '' };
        }
        if (delta.type === 'reasoningContentDelta') {
          return { type: 'reasoning-delta', text: delta.text || '' };
        }
        if (delta.type === 'toolUseInputDelta') {
          return { type: 'tool-call-delta', argsTextDelta: delta.input || '' };
        }
        return null;
      }

      case 'modelContentBlockStartEvent': {
        const start = inner.start;
        if (start?.type === 'toolUseStart') {
          return {
            type: 'tool-call',
            toolName: start.name,
            toolCallId: start.toolUseId || `tool-${Date.now()}`,
            input: {},
          };
        }
        return null;
      }

      case 'modelMessageStopEvent':
        return { type: 'finish', finishReason: inner.stopReason || 'end_turn' };

      case 'modelMetadataEvent':
        if (inner.usage) {
          return {
            type: 'usage',
            promptTokens: inner.usage.inputTokens || 0,
            completionTokens: inner.usage.outputTokens || 0,
          };
        }
        return null;

      default:
        return null;
    }
  }

  if (event.type === 'toolResultEvent') {
    const result = (event as any).result;
    return {
      type: 'tool-result',
      toolName: result?.toolUseId || '',
      toolCallId: result?.toolUseId || '',
      output: result?.content,
    };
  }

  return null;
}

// ── IAgent wrapper around Strands Agent ────────────────

class StrandsAgentWrapper implements IAgent {
  private strandsAgent: StrandsAgent;
  private memory: IMemory | null;

  constructor(
    strandsAgent: StrandsAgent,
    public readonly id: string,
    public readonly name: string,
    public readonly model: any,
    memory: IMemory | null,
  ) {
    this.strandsAgent = strandsAgent;
    this.memory = memory;
  }

  async generateText(prompt: string, _options?: any): Promise<IGenerateResult> {
    const result = await this.strandsAgent.invoke(prompt);
    const msg = result.lastMessage;
    const reasoningBlocks = msg?.content?.filter((b: any) => b.type === 'reasoningBlock') || [];
    const reasoning = reasoningBlocks.map((b: any) => b.reasoningText || b.text || '').join('\n') || undefined;
    return {
      text: result.toString(),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      reasoning,
    };
  }

  async streamText(input: string, _options?: any): Promise<IStreamResult> {
    const agent = this.strandsAgent;
    let resolveUsage: (u: any) => void;
    let resolveFinish: (r: string) => void;
    let resolveText: (t: string) => void;

    const usagePromise = new Promise<any>((r) => { resolveUsage = r; });
    const finishPromise = new Promise<string>((r) => { resolveFinish = r; });
    const textPromise = new Promise<string>((r) => { resolveText = r; });

    const self = this;

    async function* streamGenerator(): AsyncIterable<IStreamChunk> {
      let fullText = '';
      let emittedStart = false;
      let emittedTextStart = false;
      const stream = agent.stream(input);

      // Emit synthetic start events (VoltAgent emits these, UI expects them)
      yield { type: 'start', id: '0' };
      yield { type: 'start-step', id: '0' };

      for await (const event of stream) {
        if (event.type === 'agentResultEvent') {
          const agentResult = (event as any).result as AgentResult;
          resolveText(agentResult.toString());
          resolveFinish(agentResult.stopReason || 'end_turn');
          const metrics = (event as any).metrics;
          const usage: TokenUsage = metrics?.usage
            ? { promptTokens: metrics.usage.inputTokens, completionTokens: metrics.usage.outputTokens, totalTokens: (metrics.usage.inputTokens || 0) + (metrics.usage.outputTokens || 0) }
            : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          resolveUsage(usage);
          continue;
        }

        const mapped = mapStreamEvent(event);
        if (mapped) {
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
      resolveUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    }

    return {
      fullStream: streamGenerator(),
      text: textPromise,
      usage: usagePromise,
      finishReason: finishPromise,
    };
  }

  async generateObject(prompt: string, _options?: any): Promise<IGenerateResult> {
    // Strands has structuredOutputSchema on the Agent config, but for ad-hoc
    // calls we just invoke and parse
    const result = await this.strandsAgent.invoke(prompt);
    const text = result.toString();
    let object: any;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      object = JSON.parse(cleaned);
    } catch {
      object = { raw: text };
    }
    return { object, text, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }

  getMemory(): IMemory | null {
    return this.memory;
  }
}

// ── Strands Framework Adapter ──────────────────────────

export class StrandsFramework {
  private mcpClients: Map<string, McpClient> = new Map();

  async createAgent(
    slug: string,
    spec: AgentSpec,
    config: AgentCreationConfig,
    opts: CreateAgentOptions,
  ): Promise<AgentBundle> {
    // Create Bedrock model
    const modelId = spec.model || config.appConfig.defaultModel;
    const resolvedModel = config.modelCatalog
      ? await config.modelCatalog.resolveModelId(modelId)
      : modelId;

    const model = new BedrockModel({
      modelId: resolvedModel,
      region: spec.region || config.appConfig.region,
      maxTokens: spec.guardrails?.maxTokens ?? config.appConfig.defaultMaxOutputTokens,
      temperature: spec.guardrails?.temperature,
      topP: spec.guardrails?.topP,
    });

    // Load MCP tools
    const tools = await this.loadTools(slug, spec, opts);

    // Calculate fixed token counts
    const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
    const toolsJson = JSON.stringify(
      tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    );
    const mcpServerTokens = Math.ceil(toolsJson.length / 4);

    // Create Strands Agent
    const strandsAgent = new StrandsAgent({
      model,
      systemPrompt: opts.processedPrompt,
      tools: tools as any[],
    });

    // Wire runtime-provided hooks into Strands' native hook system
    const hooks = config.hooks;
    const invocationCtx = { agentSlug: slug };
    let toolCallCount = 0;

    if (hooks?.beforeToolCall) {
      strandsAgent.hooks.addCallback(BeforeToolCallEvent, async (event) => {
        const approved = await hooks.beforeToolCall!({
          toolName: event.toolUse.name,
          toolCallId: event.toolUse.toolUseId,
          toolArgs: event.toolUse.input,
        }, invocationCtx);
        if (!approved) {
          // Strands doesn't have a built-in deny mechanism on BeforeToolCallEvent,
          // so we override the tool input to signal denial
          (event as any)._denied = true;
        }
      });
    }

    if (hooks?.afterToolCall) {
      strandsAgent.hooks.addCallback(AfterToolCallEvent, (event) => {
        toolCallCount++;
        hooks.afterToolCall!({
          toolName: event.toolUse.name,
          toolCallId: event.toolUse.toolUseId,
          toolArgs: event.toolUse.input,
        }, {
          output: event.result?.content,
          error: event.error,
        }, invocationCtx);
      });
    }

    if (hooks?.afterInvocation) {
      strandsAgent.hooks.addCallback(AfterInvocationEvent, async (event) => {
        await hooks.afterInvocation!({
          invocation: invocationCtx,
          usage: (event as any).metrics?.usage,
          toolCallCount,
          messages: (event as any).agent?.messages,
        });
        toolCallCount = 0; // Reset for next invocation
      });
    }

    // Wrap in IAgent — pass memory adapter so conversations persist
    const agent = new StrandsAgentWrapper(
      strandsAgent,
      slug,
      slug,
      model,
      opts.memoryAdapter as unknown as IMemory,
    );

    return {
      agent,
      tools,
      memoryAdapter: opts.memoryAdapter,
      fixedTokens: { systemPromptTokens, mcpServerTokens },
    };
  }

  async loadTools(
    slug: string,
    spec: AgentSpec,
    opts: Pick<CreateAgentOptions, 'configLoader' | 'mcpConfigs' | 'mcpConnectionStatus' | 'integrationMetadata' | 'toolNameMapping' | 'toolNameReverseMapping' | 'logger'>,
  ): Promise<ITool[]> {
    if (!spec.tools?.mcpServers?.length) return [];

    const allTools: ITool[] = [];

    for (const toolId of spec.tools.mcpServers) {
      try {
        const toolDef = await opts.configLoader.loadTool(toolId);

        if (toolDef.kind !== 'mcp') continue;
        if (toolDef.transport !== 'stdio' && toolDef.transport !== 'process') {
          opts.logger.warn('Strands adapter only supports stdio MCP transport', { toolId, transport: toolDef.transport });
          continue;
        }

        // Create or reuse McpClient
        let client = this.mcpClients.get(toolId);
        if (!client) {
          const args = (toolDef.args || []).map((arg: string) =>
            arg === './' ? process.cwd() : arg,
          );
          client = new McpClient({
            transport: new StdioClientTransport({
              command: toolDef.command!,
              args,
              env: { ...process.env, ...toolDef.env } as Record<string, string>,
            }),
          });
          this.mcpClients.set(toolId, client);
        }

        // Get tools from MCP server
        const mcpTools = await client.listTools();

        // Normalize names and track mappings
        for (const tool of mcpTools) {
          const normalized = normalizeToolName(tool.toolSpec.name);
          if (normalized !== tool.toolSpec.name) {
            const parsed = parseToolName(tool.toolSpec.name);
            opts.toolNameMapping.set(normalized, {
              original: tool.toolSpec.name,
              normalized,
              server: parsed.server,
              tool: parsed.tool,
            });
            opts.toolNameReverseMapping.set(tool.toolSpec.name, normalized);
          }

          // Wrap as ITool
          allTools.push({
            name: normalized,
            description: tool.toolSpec.description,
            parameters: tool.toolSpec.inputSchema,
            execute: async (input: any) => client!.callTool(tool, input),
          } as ITool);
        }

        opts.mcpConnectionStatus.set(toolId, { connected: true });
        opts.integrationMetadata.set(toolId, {
          type: 'mcp',
          transport: toolDef.transport,
          toolCount: mcpTools.length,
        });

        opts.logger.info('Strands MCP tools loaded', {
          agent: slug,
          tool: toolId,
          count: mcpTools.length,
        });
      } catch (error) {
        opts.logger.error('Failed to load MCP tool via Strands', { agent: slug, toolId, error });
        opts.mcpConnectionStatus.set(toolId, { connected: false, error: String(error) });
      }
    }

    // Apply available filter
    const available = spec.tools.available || ['*'];
    if (!available.includes('*')) {
      return allTools.filter((t) =>
        available.some((pattern) => {
          if (pattern === t.name) return true;
          if (pattern.endsWith('*')) return t.name.startsWith(pattern.slice(0, -1));
          return false;
        }),
      );
    }

    return allTools;
  }

  async destroyAgent(_slug: string): Promise<void> {}

  async shutdown(): Promise<void> {
    for (const [, client] of this.mcpClients) {
      await client.disconnect().catch(() => {});
    }
    this.mcpClients.clear();
  }
}
