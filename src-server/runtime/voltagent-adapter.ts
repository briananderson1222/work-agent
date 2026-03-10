/**
 * VoltAgent adapter — confines all @voltagent/* and @ai-sdk/* imports to this file.
 *
 * Implements IAgentFramework so the runtime and routes only depend on the
 * framework-agnostic interfaces in runtime/types.ts.
 */

import {
  Agent,
  type MCPConfiguration,
  Memory,
  type Tool,
  createHooks,
} from '@voltagent/core';
import type { AgentSpec, } from '../domain/types.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { createBedrockProvider } from '../providers/bedrock.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import * as MCPManager from './mcp-manager.js';
import type {
  AgentCreationConfig,
  IAgent,
  IGenerateResult,
  IMemory,
  IStreamChunk,
  IStreamResult,
  ITool,
} from './types.js';

// ── Result bundle from agent creation ──────────────────

export interface AgentBundle {
  agent: IAgent;
  tools: ITool[];
  memoryAdapter: FileMemoryAdapter;
  fixedTokens: { systemPromptTokens: number; mcpServerTokens: number };
}

// ── Extended creation options (runtime passes these in) ─

export interface CreateAgentOptions {
  processedPrompt: string;
  memoryAdapter: FileMemoryAdapter;
  configLoader: ConfigLoader;
  mcpConfigs: Map<string, MCPConfiguration>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }>;
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>;
  toolNameReverseMapping: Map<string, string>;
  approvalRegistry: ApprovalRegistry;
  agentFixedTokens: Map<string, { systemPromptTokens: number; mcpServerTokens: number }>;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  logger: any;
}

// ── IAgent wrapper around VoltAgent Agent ──────────────

class VoltAgentWrapper implements IAgent {
  constructor(private inner: Agent) {}

  get id() { return this.inner.name; }
  get name() { return this.inner.name; }
  get model() { return this.inner.model; }

  /** VoltAgent compat — server-core routes call these on registered agents */
  getFullState() { return (this.inner as any).getFullState(); }
  getTools() { return (this.inner as any).getTools?.() ?? []; }
  isTelemetryConfigured() { return (this.inner as any).isTelemetryConfigured?.() ?? false; }
  getToolsForApi() { return (this.inner as any).getToolsForApi?.() ?? this.getTools(); }

  async generateText(prompt: string, options?: any): Promise<IGenerateResult> {
    const result = await this.inner.generateText(prompt, options);
    return result as unknown as IGenerateResult;
  }

  async streamText(input: string, options?: any): Promise<IStreamResult> {
    const result = await this.inner.streamText(input, options);
    return {
      fullStream: result.fullStream as AsyncIterable<IStreamChunk>,
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
    };
  }

  async generateObject(prompt: string, options?: any): Promise<IGenerateResult> {
    return this.inner.generateObject(prompt, options);
  }

  getMemory(): IMemory | null {
    const mem = this.inner.getMemory();
    return mem as unknown as IMemory | null;
  }

  /** Access the underlying VoltAgent Agent (for framework-specific operations) */
  get raw(): Agent { return this.inner; }
}

// ── IAgentFramework implementation ─────────────────────

/**
 * VoltAgent-specific framework adapter.
 *
 * Does NOT formally implement IAgentFramework because VoltAgent needs
 * extra options (MCP maps, etc.) that are framework-specific. The runtime
 * wraps calls to this class and satisfies the interface contract.
 */
export class VoltAgentFramework {
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
    const model = createBedrockProvider({
      appConfig: config.appConfig,
      agentSpec: { ...spec, model: resolvedModel },
    });

    // Create memory
    const memory = new Memory({ storage: opts.memoryAdapter });

    // Load tools
    const tools = await this.loadTools(slug, spec, opts);

    // Calculate fixed token counts
    const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
    const toolsJson = JSON.stringify(
      tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    );
    const mcpServerTokens = Math.ceil(toolsJson.length / 4);
    const fixedTokens = { systemPromptTokens, mcpServerTokens };

    // Create VoltAgent-native hooks that delegate to shared agent-hooks logic.
    // VoltAgent needs createHooks() for its internal lifecycle, but the
    // afterInvocation business logic (stats, cost, enrichment) comes from
    // the shared hooks passed via config.hooks.
    const sharedHooks = config.hooks;
    const _autoApprove = spec.tools?.autoApprove || [];
    const hooks = createHooks({
      onToolStart: async ({ tool, context }) => {
        const currentCount = (context.context.get('toolCallCount') as number) || 0;
        context.context.set('toolCallCount', currentCount + 1);
        sharedHooks?.afterToolCall?.(
          { toolName: tool.name, toolCallId: '', toolArgs: {} },
          {},
          { agentSlug: slug },
        );
      },
      onEnd: async ({ context, output, agent: voltAgent }) => {
        if (!context.conversationId || !output) return;
        const usage = 'usage' in output ? output.usage : undefined;
        const toolCallCount = (context.context.get('toolCallCount') as number) || 0;
        await sharedHooks?.afterInvocation?.({
          invocation: {
            agentSlug: slug,
            conversationId: context.conversationId,
            userId: context.userId,
            traceId: (context as any).traceId,
          },
          usage: usage ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          } : undefined,
          toolCallCount,
        });
      },
    });

    // Build agent
    const agent = new Agent({
      name: slug,
      instructions: opts.processedPrompt,
      model,
      memory,
      tools: tools as Tool<any>[],
      hooks,
      ...((spec.maxTurns || config.appConfig.defaultMaxTurns)
        ? { maxTurns: spec.maxTurns || config.appConfig.defaultMaxTurns }
        : {}),
      ...(spec.guardrails && {
        temperature: spec.guardrails.temperature,
        maxOutputTokens: spec.guardrails.maxTokens ?? config.appConfig.defaultMaxOutputTokens,
        topP: spec.guardrails.topP,
        maxSteps: spec.guardrails.maxSteps,
      }),
      ...(!spec.guardrails && config.appConfig.defaultMaxOutputTokens
        ? { maxOutputTokens: config.appConfig.defaultMaxOutputTokens }
        : {}),
    });

    return {
      agent: new VoltAgentWrapper(agent),
      tools: tools as ITool[],
      memoryAdapter: opts.memoryAdapter,
      fixedTokens,
    };
  }

  async loadTools(
    slug: string,
    spec: AgentSpec,
    opts: Pick<CreateAgentOptions, 'configLoader' | 'mcpConfigs' | 'mcpConnectionStatus' | 'integrationMetadata' | 'toolNameMapping' | 'toolNameReverseMapping' | 'logger'>,
  ): Promise<ITool[]> {
    return MCPManager.loadAgentTools(
      slug,
      spec,
      opts.configLoader,
      opts.mcpConfigs,
      opts.mcpConnectionStatus,
      opts.integrationMetadata,
      opts.toolNameMapping,
      opts.toolNameReverseMapping,
      opts.logger,
    ) as Promise<ITool[]>;
  }

  async destroyAgent(_slug: string): Promise<void> {
    // MCP cleanup handled by runtime (it owns the maps)
  }

  async createModel(spec: AgentSpec, config: AgentCreationConfig): Promise<any> {
    const modelId = spec.model || config.appConfig.defaultModel;
    const resolvedModel = config.modelCatalog
      ? await config.modelCatalog.resolveModelId(modelId)
      : modelId;
    return createBedrockProvider({
      appConfig: config.appConfig,
      agentSpec: { ...spec, model: resolvedModel },
    });
  }

  async createTempAgent(opts: {
    name: string; instructions: string; model: any; tools?: ITool[]; maxSteps?: number;
  }): Promise<IAgent> {
    const agent = new Agent({
      name: opts.name,
      instructions: opts.instructions,
      model: opts.model,
      tools: (opts.tools || []) as Tool<any>[],
      maxSteps: opts.maxSteps,
    });
    return new VoltAgentWrapper(agent);
  }

  async shutdown(): Promise<void> {
    // No-op — runtime handles MCP disconnection and agent map cleanup
  }
}
