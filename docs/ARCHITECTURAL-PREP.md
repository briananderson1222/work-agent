# Architectural Prep: Isolate the Agent Framework Boundary

**Date:** 2026-03-05  
**Branch:** `refactor/isolate-agent-framework` (worktree: `kiro-arch-prep`)  
**Goal:** Isolate VoltAgent + Vercel AI SDK coupling behind interfaces so the eventual Strands swap is a clean adapter replacement. Build a Vercel AI SDK compat mapping layer inside the Strands adapter to preserve the existing streaming pipeline and memory format.

---

## 1. Complete Coupling Audit

### VoltAgent Imports — 13 files

| File | Imports | Usage |
|---|---|---|
| `runtime/voltagent-runtime.ts` | `Agent`, `MCPConfiguration`, `Memory`, `Tool`, `VoltAgent` | Agent lifecycle, server init |
| `runtime/voltagent-runtime.ts` | `createPinoLogger` (logger) | Logging |
| `runtime/voltagent-runtime.ts` | `honoServer` (server-hono) | HTTP server factory |
| `adapters/file/voltagent-memory-adapter.ts` | `StorageAdapter`, `Conversation`, `CreateConversationInput`, `GetMessagesOptions`, `WorkflowStateEntry`, `WorkingMemoryScope` | Implements storage interface |
| `adapters/file/voltagent-memory-adapter.ts` | `createPinoLogger` | Logging |
| `runtime/mcp-manager.ts` | `MCPConfiguration`, `Tool` | MCP server lifecycle |
| `runtime/tool-executor.ts` | `createHooks`, `Tool` | Tool approval hooks |
| `services/mcp-service.ts` | `MCPConfiguration`, `Tool` (type only) | Service types |
| `services/agent-service.ts` | `Agent` (type only) | Service types |
| `routes/monitoring.ts` | `Agent` (type only) | Route types |
| `domain/config-loader.ts` | `createPinoLogger` | Logging |
| `analytics/usage-aggregator.ts` | `createPinoLogger` | Logging |
| `routes/models.ts` | `createPinoLogger` | Logging |
| `routes/auth.ts` | `createPinoLogger` | Logging |

### Vercel AI SDK Imports — 4 files

| File | Import | Usage |
|---|---|---|
| `runtime/streaming/types.ts` | `TextStreamPart<any>` from `ai` | **The `StreamChunk` type** — entire pipeline built on this |
| `adapters/file/voltagent-memory-adapter.ts` | `UIMessage` from `ai` | Message format in storage |
| `runtime/voltagent-runtime.ts` | `jsonSchema` from `ai` | Structured output |
| `providers/bedrock.ts` | `createAmazonBedrock` from `@ai-sdk/amazon-bedrock` | Model provider factory |

### Exact Agent API Surface Used

```typescript
// Construction
new Agent({ name, instructions, model, memory, tools, hooks, maxTurns, temperature, maxOutputTokens, topP, maxSteps })

// Runtime methods
agent.generateText(prompt, options)       // → { text, usage, steps, toolCalls, toolResults, reasoning }
agent.streamText(input, operationContext) // → { fullStream: AsyncIterable<TextStreamPart>, text, usage, finishReason }
agent.generateObject(prompt, options)     // → { object }
agent.getMemory()                         // → Memory
agent.model                               // read-only
agent.id                                  // string

// VoltAgent orchestrator
new VoltAgent({ agents, logger, server })
voltAgent.getAgents() / voltAgent.registerAgent(agent)

// Memory (thin wrapper around StorageAdapter)
memory.getConversation / createConversation / getConversations / getMessages / addMessage / updateConversation / clearMessages

// MCP
new MCPConfiguration({ servers })
mcpConfig.getTools() / getClients() / disconnect()

// Hooks
createHooks({ onToolStart, onEnd })
// onEnd does: usage stats, cost calculation, per-model tracking, message enrichment with model metadata + pricing

// StorageAdapter (977 lines, 17 methods)
addMessage / getMessages / clearMessages / removeLastMessage
createConversation / getConversation / getConversations / updateConversation / deleteConversation
getWorkingMemory / saveWorkingMemory / getWorkflowState / saveWorkflowState / deleteWorkflowState
```

---

## 2. The Refactoring Plan

### Step 1: Define Framework-Agnostic Interfaces (~2h)

Create `src-server/runtime/types.ts` — the contract between Stallion and whatever agent framework sits underneath.

```typescript
import type { AgentSpec, AppConfig } from '../domain/types.js';

// ── Stream Events ──────────────────────────────────────
// Framework-agnostic stream chunk.
// Intentionally mirrors Vercel AI SDK's TextStreamPart shape so the
// existing streaming pipeline (handlers, SSE output) works unchanged.
// The Strands adapter maps Strands events INTO this format.
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
  createConversation(opts: { id: string; resourceId: string; userId: string; title?: string; metadata?: any }): Promise<IConversation>;
  getConversations(resourceId: string): Promise<IConversation[]>;
  getMessages(userId: string, conversationId: string): Promise<any[]>;
  addMessage(msg: any, userId: string, conversationId: string, metadata?: any): Promise<void>;
  updateConversation(id: string, updates: any): Promise<void>;
  clearMessages(userId: string, conversationId?: string): Promise<void>;
  removeLastMessage?(userId: string, conversationId: string): Promise<void>;
}

// ── Agent ──────────────────────────────────────────────
export interface IGenerateResult {
  text?: string;
  object?: any;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  toolCalls?: any[];
  toolResults?: any[];
  reasoning?: string;
  steps?: any[];
}

export interface IStreamResult {
  fullStream: AsyncIterable<IStreamChunk>;
  text?: Promise<string>;
  usage?: Promise<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
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
export interface IAgentFramework {
  createAgent(slug: string, spec: AgentSpec, config: AgentCreationConfig): Promise<IAgent>;
  destroyAgent(slug: string): Promise<void>;
  loadTools(slug: string, spec: AgentSpec): Promise<ITool[]>;
  shutdown(): Promise<void>;
}

export interface AgentCreationConfig {
  appConfig: AppConfig;
  projectHomeDir: string;
  usageAggregator?: any;
  modelCatalog?: any;
  approvalRegistry?: any;
}
```

Key design decision: `IStreamChunk` intentionally mirrors `TextStreamPart`'s shape (`{ type: string, ...rest }`). This means the existing streaming handlers work unchanged — they already just check `chunk.type` and read dynamic properties. The Vercel AI SDK compat layer lives in the adapter, not in the interface.

---

### Step 2: Extract HTTP Server Setup (~4h)

Move ~1500 lines of route definitions from the `configureApp()` callback into a standalone function:

```typescript
// src-server/server.ts
export interface ServerDeps {
  configLoader: ConfigLoader;
  agentService: AgentService;
  mcpService: MCPService;
  workspaceService: WorkspaceService;
  acpBridge: ACPManager;
  approvalRegistry: ApprovalRegistry;
  eventBus: EventBus;
  usageAggregator?: UsageAggregator;
  modelCatalog?: BedrockModelCatalog;
  appConfig: AppConfig;
  logger: any;
  // The seam — framework-agnostic operations
  getAgent(slug: string): IAgent | undefined;
  getAgentTools(slug: string): ITool[];
  getAgentSpec(slug: string): AgentSpec | undefined;
  reloadAgents(): Promise<void>;
}

export function createApp(deps: ServerDeps): Hono { ... }
```

Routes have zero dependency on VoltAgent. They call services and read from Maps. This is a mechanical move — no logic changes.

---

### Step 3: Create VoltAgent Adapter (~3h)

Confine ALL VoltAgent + Vercel AI SDK imports to one file:

```typescript
// src-server/runtime/adapters/voltagent-adapter.ts
import { Agent, MCPConfiguration, Memory, createHooks } from '@voltagent/core';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { TextStreamPart } from 'ai';
import type { IAgent, IAgentFramework, ITool, IStreamChunk, IStreamResult } from '../types.js';

export class VoltAgentFramework implements IAgentFramework {
  async createAgent(slug, spec, config): Promise<IAgent> {
    // createVoltAgentInstance + createBedrockModel + loadAgentTools + hooks
    // Returns wrapper that maps VoltAgent Agent → IAgent
  }
  // ...
}

// Vercel AI SDK → IStreamChunk (identity mapping — same shape)
function adaptStream(fullStream: AsyncIterable<TextStreamPart<any>>): AsyncIterable<IStreamChunk> {
  // TextStreamPart already matches IStreamChunk shape, so this is a passthrough
  return fullStream as AsyncIterable<IStreamChunk>;
}
```

The hooks logic (onEnd with stats/cost/enrichment) stays in this adapter — it's framework-specific by nature.

---

### Step 4: Replace Logger Imports (~1h)

Mechanical find-and-replace of `createPinoLogger` from `@voltagent/logger` with a local wrapper around `pino` directly. 6 files.

---

### Step 5: Update Streaming Pipeline Types (~30m)

```typescript
// Before (streaming/types.ts)
import type { TextStreamPart } from 'ai';
export type StreamChunk = TextStreamPart<any>;

// After
import type { IStreamChunk } from '../types.js';
export type StreamChunk = IStreamChunk;
```

Handlers only use `chunk.type` string checks and dynamic property access. No runtime behavior change.

---

## 3. Vercel AI SDK Compat Strategy

### What the Strands adapter needs to map

When the Strands migration happens, the Strands adapter maps Strands stream events into `IStreamChunk` (which mirrors `TextStreamPart`). This is the compat layer:

| Strands Event | → IStreamChunk type | Notes |
|---|---|---|
| Text content | `text-delta` | `{ type: 'text-delta', text: '...' }` |
| Tool use request | `tool-call` | `{ type: 'tool-call', toolName, toolCallId, input }` |
| Tool result | `tool-result` | `{ type: 'tool-result', toolName, toolCallId, output }` |
| Stream start | `text-start` | Synthetic — Strands may not emit this |
| Stream end | `finish` | `{ type: 'finish', finishReason }` |
| Usage stats | `usage` | `{ type: 'usage', promptTokens, completionTokens }` |
| Step boundaries | `start-step` / `finish-step` | May need synthetic generation |

The reasoning handler already detects `<thinking>` tags in text content, so reasoning works regardless of framework — no mapping needed there.

### What's needed for the application (build this)

1. **Stream event mapper** — `StrandsStreamEvent → IStreamChunk` — one function, ~50 lines
2. **Tool definition mapper** — Strands `tool()` uses Zod, our tools already use Zod via VoltAgent. Mapping is mostly structural.
3. **MCP client wrapper** — Strands `McpClient` vs VoltAgent `MCPConfiguration`. Different API, same concept. Wrapper normalizes tool names like we already do.

### What's missing for a general-purpose open-source package (note for later)

4. **Message format mapper** — `UIMessage ↔ Strands message format` — needed for conversation history interop
5. **Model provider adapter** — Make Strands models usable as Vercel AI SDK `LanguageModel` (or vice versa)
6. **Session manager bridge** — Map Vercel AI SDK persistence patterns to Strands session managers
7. **Callback handler → AI SDK stream** — Convert Strands callback handlers to AI SDK `StreamData` format

Items 4-7 are useful for the community but not blocking for our migration. Note them in a `COMPAT-GAPS.md` and revisit when Strands TS stabilizes.

---

## 4. Before / After

### Before
```
13 files import from @voltagent/*
4 files import from ai / @ai-sdk/*
voltagent-runtime.ts: 2861 lines (routes + agent lifecycle + streaming + monitoring + ACP + utilities)
```

### After
```
2 files import from framework packages:
  - runtime/adapters/voltagent-adapter.ts (VoltAgent + AI SDK)
  - adapters/file/voltagent-memory-adapter.ts (StorageAdapter + UIMessage)

voltagent-runtime.ts: ~800 lines (orchestration only, uses IAgentFramework)
server.ts: ~1500 lines (pure HTTP routes, uses IAgent/ITool)
runtime/adapters/voltagent-adapter.ts: ~400 lines (all framework code)
runtime/types.ts: ~100 lines (interfaces)
utils/logger.ts: ~5 lines
```

### Strands migration then becomes
```
1. Create runtime/adapters/strands-adapter.ts implementing IAgentFramework
   - Includes stream event mapper (Strands → IStreamChunk)
   - Includes MCP client wrapper
   - Includes tool definition mapper
2. Add runtime config flag
3. No other files change.
```

---

## 5. Execution Order

```
Step 1 (interfaces)  ──┐
Step 4 (logger)      ──┤── parallel
Step 5 (stream types)──┘
                        │
Step 2 (extract routes) ── after Step 1
                        │
Step 3 (adapter)       ── after all above
```

| # | Task | Effort | Risk |
|---|---|---|---|
| 1 | Define interfaces (`runtime/types.ts`) | 2h | Low |
| 4 | Replace logger imports | 1h | Low |
| 5 | Update streaming pipeline types | 30m | Low |
| 2 | Extract HTTP routes to `server.ts` | 4h | Medium |
| 3 | Create VoltAgent adapter | 3h | Medium |
| — | Wire together + validate | 2h | Medium |

**Total: ~12.5 hours. All on `main`. Each step independently committable.**

---

## 6. Open Source Opportunity — `COMPAT-GAPS.md`

After the migration, document what we built vs what a general-purpose `@strands-agents/ai-sdk-compat` package would need:

**Built (for our app):**
- Stream event mapper (Strands → TextStreamPart-shaped IStreamChunk)
- Tool definition structural mapper
- MCP client wrapper with name normalization

**Gaps (for community package):**
- Bidirectional message format conversion (UIMessage ↔ Strands messages)
- Vercel AI SDK `LanguageModel` interface adapter for Strands models
- Session/conversation persistence bridge
- Callback handler → AI SDK StreamData conversion
- Structured output schema interop (both use Zod but different wiring)

This positions us to contribute upstream once Strands TS stabilizes past preview.
