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
import type {
  AgentDelegationContext,
  AgentSpec,
} from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';

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
  delegation?: AgentDelegationContext;
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
   * conversation stats update.
   *
   * Does NOT handle message persistence — that's the adapter's job,
   * since each framework has its own message format.
   */
  afterInvocation?(context: {
    invocation: InvocationContext;
    usage?: TokenUsage;
    toolCallCount: number;
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
  listProviderConnections?: () => ProviderConnectionConfig[];
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

  /** Create a model provider instance for the given spec */
  createModel(spec: AgentSpec, config: AgentCreationConfig): Promise<any>;

  /** Create a lightweight agent for one-shot invocations (no persistence, no hooks) */
  createTempAgent(opts: {
    name: string;
    instructions: string | (() => string);
    model: any;
    tools?: ITool[];
    maxSteps?: number;
  }): Promise<IAgent>;
}

// ── Runtime Context ────────────────────────────────────
//
// Shared state passed to extracted route modules so they can
// access runtime internals without importing StallionRuntime.

import type { Tool } from '@voltagent/core';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import type { ACPManager } from '../services/acp-bridge.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import type { EventBus } from '../services/event-bus.js';
import type { FeedbackService } from '../services/feedback-service.js';
import type { KnowledgeService } from '../services/knowledge-service.js';
import type { ProviderService } from '../services/provider-service.js';
import type { createAgentHooks } from './agent-hooks.js';

export interface RuntimeContext {
  // Maps
  activeAgents: Map<string, any>;
  agentSpecs: Map<string, AgentSpec>;
  agentTools: Map<string, Tool<any>[]>;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  >;
  toolNameMapping: Map<
    string,
    {
      original: string;
      normalized: string;
      server: string | null;
      tool: string;
    }
  >;
  toolNameReverseMapping: Map<string, string>;
  globalToolRegistry: Map<string, Tool<any>>;
  agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >;
  agentStatus: Map<string, 'idle' | 'running'>;
  agentHooksMap: Map<string, ReturnType<typeof createAgentHooks>>;

  // Services
  approvalRegistry: ApprovalRegistry;
  configLoader: ConfigLoader;
  appConfig: AppConfig;
  modelCatalog?: BedrockModelCatalog;
  framework: IAgentFramework;
  acpBridge: ACPManager;
  providerService: ProviderService;
  knowledgeService: KnowledgeService;
  feedbackService: FeedbackService;
  storageAdapter: IStorageAdapter;
  eventBus: EventBus;
  logger: any;

  // Monitoring / metrics (used by chat and monitoring routes)
  monitoringEvents: import('node:events').EventEmitter;
  monitoringEmitter?: import('../monitoring/emitter.js').MonitoringEmitter;
  agentStats: Map<
    string,
    { conversationCount: number; messageCount: number; lastUpdated: number }
  >;
  metricsLog: Array<{
    timestamp: number;
    agentSlug: string;
    event: string;
    conversationId?: string;
    messageCount?: number;
    cost?: number;
  }>;

  // Methods
  createBedrockModel(spec: AgentSpec): Promise<any>;
  replaceTemplateVariables(text: string): string;
  getNormalizedToolName(originalName: string): string;
  getOriginalToolName(normalizedName: string): string;
  reloadAgents(): Promise<void>;
  initialize(): Promise<void>;
  persistEvent(event: any): Promise<void>;
}
