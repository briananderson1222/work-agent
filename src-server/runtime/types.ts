/**
 * Framework-agnostic interfaces for the agent runtime boundary.
 *
 * These types decouple Stallion's application layer (routes, streaming pipeline,
 * memory, services) from the underlying agent framework (currently VoltAgent +
 * Vercel AI SDK, eventually Strands).
 *
 * The adapter pattern: one file implements IAgentFramework per framework.
 * Everything else imports from here.
 *
 * Key design: the runtime defines WHAT should happen (approve tools, track
 * usage, persist messages) via IAgentHooks. The adapter defines HOW to wire
 * those hooks into its native lifecycle system. Adding a new framework means
 * implementing the hook wiring, not reimplementing business logic.
 */

import type { AgentSpec, AppConfig } from '../domain/types.js';

// ── Stream Events ──────────────────────────────────────

/**
 * Framework-agnostic stream chunk.
 *
 * Intentionally mirrors Vercel AI SDK's TextStreamPart shape so the existing
 * streaming pipeline (handlers, SSE output) works unchanged. The framework
 * adapter maps its native events INTO this format.
 */
export interface IStreamChunk {
  type: string;
  [key: string]: any;
}

// ── Tool ───────────────────────────────────────────────

export interface ITool {
  name: string;
  id?: string;
  description?: string;
  parameters?: any;
  execute(input: any, options?: any): Promise<any>;
}

// ── Memory ─────────────────────────────────────────────

export interface IConversation {
  id: string;
  resourceId: string;
  userId: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface IMemory {
  getConversation(id: string): Promise<IConversation | null>;
  createConversation(opts: {
    id: string;
    resourceId: string;
    userId: string;
    title?: string;
    metadata?: any;
  }): Promise<IConversation>;
  getConversations(resourceId: string): Promise<IConversation[]>;
  getMessages(userId: string, conversationId: string): Promise<any[]>;
  addMessage(
    msg: any,
    userId: string,
    conversationId: string,
    metadata?: any,
  ): Promise<void>;
  updateConversation(id: string, updates: any): Promise<void>;
  clearMessages(userId: string, conversationId?: string): Promise<void>;
  removeLastMessage?(userId: string, conversationId: string): Promise<void>;
}

// ── Agent ──────────────────────────────────────────────

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface IGenerateResult {
  text?: string;
  object?: any;
  usage?: TokenUsage;
  toolCalls?: any[];
  toolResults?: any[];
  reasoning?: string;
  steps?: any[];
}

export interface IStreamResult {
  fullStream: AsyncIterable<IStreamChunk>;
  text?: Promise<string>;
  usage?: Promise<TokenUsage>;
  finishReason?: Promise<string>;
}

export interface IAgent {
  readonly id: string;
  readonly name: string;
  readonly model?: any;
  generateText(prompt: string, options?: any): Promise<IGenerateResult>;
  streamText(input: string, options?: any): Promise<IStreamResult>;
  generateObject?(prompt: string, options?: any): Promise<IGenerateResult>;
  getMemory(): IMemory | null;
}

// ── Lifecycle Hooks ────────────────────────────────────
//
// The runtime provides these implementations. The adapter wires them
// into the framework's native hook system. This means approval logic,
// usage tracking, and persistence sync are written ONCE and work
// across all frameworks.

export interface ToolCallContext {
  toolName: string;
  toolCallId: string;
  toolArgs: any;
  toolDescription?: string;
}

export interface InvocationContext {
  agentSlug: string;
  conversationId?: string;
  userId?: string;
  traceId?: string;
}

export interface IAgentHooks {
  /**
   * Called before a tool executes. Return false to block execution.
   * Used for: tool approval/elicitation flow.
   */
  beforeToolCall?(
    tool: ToolCallContext,
    invocation: InvocationContext,
  ): Promise<boolean>;

  /**
   * Called after a tool executes.
   * Used for: tool call counting, monitoring events.
   */
  afterToolCall?(
    tool: ToolCallContext,
    result: { output?: any; error?: Error },
    invocation: InvocationContext,
  ): void;

  /**
   * Called after the full agent invocation completes.
   * Used for: usage tracking, cost calculation, message enrichment,
   * conversation stats update, persistence sync.
   */
  afterInvocation?(context: {
    invocation: InvocationContext;
    usage?: TokenUsage;
    toolCallCount: number;
    messages?: any[];
    error?: Error;
  }): Promise<void>;
}

// ── Framework Adapter ──────────────────────────────────

export interface AgentCreationConfig {
  appConfig: AppConfig;
  projectHomeDir: string;
  usageAggregator?: any;
  modelCatalog?: any;
  approvalRegistry?: any;
  /** Runtime-provided hooks — adapter wires these into native lifecycle */
  hooks?: IAgentHooks;
}

export interface AgentBundle {
  agent: IAgent;
  tools: ITool[];
  memoryAdapter: any; // FileMemoryAdapter
  fixedTokens: { systemPromptTokens: number; mcpServerTokens: number };
}

export interface IAgentFramework {
  createAgent(
    slug: string,
    spec: AgentSpec,
    config: AgentCreationConfig,
    opts: any, // Framework-specific options
  ): Promise<AgentBundle>;
  destroyAgent(slug: string): Promise<void>;
  loadTools(slug: string, spec: AgentSpec, opts: any): Promise<ITool[]>;
  shutdown(): Promise<void>;
}
