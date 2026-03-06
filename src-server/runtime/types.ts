/**
 * Framework-agnostic interfaces for the agent runtime boundary.
 *
 * These types decouple Stallion's application layer (routes, streaming pipeline,
 * memory, services) from the underlying agent framework (currently VoltAgent +
 * Vercel AI SDK, eventually Strands).
 *
 * The adapter pattern: one file implements IAgentFramework per framework.
 * Everything else imports from here.
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

export interface IGenerateResult {
  text?: string;
  object?: any;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  toolCalls?: any[];
  toolResults?: any[];
  reasoning?: string;
  steps?: any[];
}

export interface IStreamResult {
  fullStream: AsyncIterable<IStreamChunk>;
  text?: Promise<string>;
  usage?: Promise<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }>;
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

// ── Framework Adapter ──────────────────────────────────

export interface AgentCreationConfig {
  appConfig: AppConfig;
  projectHomeDir: string;
  usageAggregator?: any;
  modelCatalog?: any;
  approvalRegistry?: any;
}

export interface IAgentFramework {
  createAgent(
    slug: string,
    spec: AgentSpec,
    config: AgentCreationConfig,
  ): Promise<IAgent>;
  destroyAgent(slug: string): Promise<void>;
  loadTools(slug: string, spec: AgentSpec): Promise<ITool[]>;
  shutdown(): Promise<void>;
}
