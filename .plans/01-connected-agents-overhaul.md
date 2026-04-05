# Plan 01: Connected Agents Overhaul

> **Goal:** Transform Stallion AI from a Bedrock-centric agent platform into a
> provider-agnostic orchestration system with first-class Claude Agent SDK and
> Codex connected-agent support, inspired by the architectural patterns in
> [t3code](~/dev/github/pingdotgg/t3code).
>
> **Reference implementation:** `~/dev/github/pingdotgg/t3code`
>
> **This document is the single source of truth for a long-running agent
> implementing this work.** Every phase is self-contained with clear entry/exit
> criteria so progress is never lost across sessions.

---

## Table of Contents

1. [North Star](#1-north-star)
2. [Current State Inventory](#2-current-state-inventory)
3. [Target Architecture](#3-target-architecture)
4. [Phase 0 — Foundations & Agent Ergonomics](#phase-0--foundations--agent-ergonomics)
5. [Phase 1 — Canonical Runtime Event Contract](#phase-1--canonical-runtime-event-contract)
6. [Phase 2 — Provider Adapter Interface](#phase-2--provider-adapter-interface)
7. [Phase 3 — Claude Agent SDK Adapter](#phase-3--claude-agent-sdk-adapter)
8. [Phase 4 — Codex Adapter](#phase-4--codex-adapter)
9. [Phase 5 — Unified Orchestration Layer](#phase-5--unified-orchestration-layer)
10. [Phase 6 — Event-Sourced Session Tracking](#phase-6--event-sourced-session-tracking)
11. [Phase 7 — UI Integration](#phase-7--ui-integration)
12. [Phase 8 — Contracts Package](#phase-8--contracts-package)
13. [Cross-Cutting Concerns](#cross-cutting-concerns)
14. [Decision Log](#decision-log)
15. [File Index](#file-index)
16. [Glossary](#glossary)

---

## 1. North Star

A user opens Stallion AI, picks a project, and chooses between **Bedrock
(VoltAgent/Strands), Claude (Agent SDK), or Codex (app-server)** as their
coding agent — all from the same UI, with the same conversation rendering, the
same approval flows, and the same checkpoint/diff system. Switching providers
mid-project is a dropdown change, not a workflow change.

**Non-goals (for now):**

- Removing VoltAgent/Strands — they remain the Bedrock runtime path.
- Replacing the plugin system — new adapters integrate *through* the existing
  provider registry pattern.
- Rewriting the UI — we extend, not replace.

---

## 2. Current State Inventory

### What Stallion Has Today

| Layer | Implementation | Files |
|-------|---------------|-------|
| **Agent Runtime** | VoltAgent primary, Strands secondary, ACP for external agents | `src-server/runtime/stallion-runtime.ts`, `voltagent-adapter.ts`, `strands-adapter.ts` |
| **Provider Registry** | Additive plugin pattern — `ILLMProvider`, `IAgentRegistryProvider`, etc. | `src-server/providers/types.ts`, `src-server/providers/registry.ts` |
| **MCP** | Full lifecycle manager (stdio, HTTP/WS, TCP) | `src-server/runtime/mcp-manager.ts`, `src-server/services/mcp-service.ts` |
| **Schemas** | JSON Schema files for agents, tools, app config | `schemas/agent.schema.json`, `schemas/tool.schema.json` |
| **Packages** | `@stallion-ai/sdk`, `@stallion-ai/shared`, `@stallion-ai/cli`, `@stallion-ai/connect` | `packages/` |
| **Agent Instructions** | `AGENTS.md` (no `CLAUDE.md` symlink) | root |
| **AI Agent Configs** | `.kiro/` only | `.kiro/settings/lsp.json`, `.kiro/prompts/start.md` |

### What's Missing

1. **No canonical runtime event type** — VoltAgent and Strands emit their own
   event shapes; there's no unified event stream the UI can consume
   provider-agnostically.
2. **No provider adapter interface** — `ILLMProvider` handles LLM streaming but
   not session lifecycle, turn management, approval flows, or tool execution
   events.
3. **No Claude Agent SDK integration** — only Bedrock models via
   `@ai-sdk/amazon-bedrock`.
4. **No Codex integration** — no OpenAI coding agent support.
5. **No event sourcing** — session state is ephemeral; no audit trail, no
   replay, no crash recovery with resume cursors.
6. **No `CLAUDE.md`** — Claude Code doesn't auto-discover agent instructions.
7. **No `.plans/` directory** — architectural decisions aren't codified for
   agent consumption.
8. **No contracts package** — type/schema validation is split between JSON
   Schema files and TypeScript types.

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Stallion UI (React)                       │
│  Provider picker ─ Conversation renderer ─ Approval dialogs     │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket / SSE
┌────────────────────────────▼────────────────────────────────────┐
│                    Orchestration Layer                           │
│  Command dispatch ─ Event log ─ Read models ─ Session state     │
└──────┬──────────────────┬──────────────────────┬────────────────┘
       │                  │                      │
┌──────▼──────┐  ┌────────▼────────┐  ┌──────────▼──────────┐
│  Bedrock    │  │  Claude Agent   │  │  Codex App-Server   │
│  Adapter    │  │  SDK Adapter    │  │  Adapter            │
│ (VoltAgent/ │  │                 │  │                     │
│  Strands)   │  │                 │  │                     │
└─────────────┘  └─────────────────┘  └─────────────────────┘
       │                  │                      │
       └──────────────────┼──────────────────────┘
                          │
              CanonicalRuntimeEvent stream
                          │
              ┌───────────▼───────────┐
              │  Event Store (SQLite) │
              │  append-only log      │
              └───────────────────────┘
```

Each adapter implements `ProviderAdapterShape` and emits
`CanonicalRuntimeEvent`s. The orchestration layer consumes these events
provider-agnostically, persists them, builds read models, and pushes them to
the UI.

### Architectural Rule: Native Runtime Owns Behavior, Stallion Owns Abstraction

This overhaul must preserve a strict boundary modeled on t3code:

- **Native provider/runtime implementation owns behavior**
  - Claude Agent SDK / Claude CLI semantics
  - Codex CLI / app-server / JSON-RPC semantics
  - provider-native approvals, interrupts, resume, thread reads, rollback,
    tool loop behavior, and provider-specific options
- **Stallion adapter layer owns translation**
  - native runtime events -> `CanonicalRuntimeEvent`
  - provider-specific request/response details -> shared adapter contract
- **Stallion orchestration layer owns shared system concerns**
  - command validation and dispatch
  - receipts / idempotency
  - event persistence
  - replay / recovery
  - read-model construction
  - SSE/WebSocket delivery to the UI
- **Stallion UI owns consistent presentation**
  - approvals, interrupts, tool progress, session state, and chat rendering
    must flow through Stallion abstractions for a uniform product experience

Non-negotiable implication:

- native runtimes must **not** bypass Stallion orchestration for approval,
  interrupt, or session-state UX
- the UI must **not** invent a parallel execution/session state model outside
  orchestration read models

---

## Phase 0 — Foundations & Agent Ergonomics

**Purpose:** Set up the scaffolding that makes every subsequent phase easier
for both human and AI developers.

### 0.1 Create `CLAUDE.md` symlink

```bash
cd <repo-root>
ln -s AGENTS.md CLAUDE.md
```

**Why:** Claude Code auto-discovers `CLAUDE.md` at the repo root. Symlinking
means both files stay in sync.

**Exit criteria:** `CLAUDE.md` exists and `readlink CLAUDE.md` returns
`AGENTS.md`.

### 0.2 Add task completion gates to `AGENTS.md`

Append a section modeled on t3code's approach:

```markdown
## Task Completion Requirements

All of the following must pass before a task is considered complete:

1. `npx biome check src-server/ src-ui/ packages/` — no lint or format errors
2. `npx tsc --noEmit` — no type errors
3. `npm test` — all unit tests pass
4. If UI changes: manual smoke test or Playwright spec

Never skip these gates. If a gate fails, fix the issue before marking done.
```

**Exit criteria:** `AGENTS.md` contains the task completion requirements
section.

### 0.3 Initialize `.plans/` directory

Create this file (you're reading it) plus a `README.md`:

```markdown
# .plans/

Architectural plans for Stallion AI. These are living documents that AI agents
and human developers reference when implementing features.

Plans are numbered sequentially. Each plan is self-contained with phases,
entry/exit criteria, and a decision log.
```

**Exit criteria:** `.plans/README.md` and `.plans/01-connected-agents-overhaul.md` exist.

### 0.4 Add `.claude/` directory with settings (optional)

If we want to configure Claude Code MCP servers or custom commands for this
repo, create `.claude/settings.json`. Not required for Phase 0, but consider
adding later for MCP tool configs.

---

## Phase 1 — Canonical Runtime Event Contract

**Purpose:** Define the unified event type that all provider adapters will
emit. This is the single most important abstraction — get it right and
everything else follows.

### 1.1 Design the event taxonomy

**Reference:** t3code defines 47 event types in a discriminated union. We don't
need all of them on day one. Start with the minimum viable set:

| Category | Events | Description |
|----------|--------|-------------|
| **Session** | `session.started`, `session.configured`, `session.state-changed`, `session.exited` | Provider session lifecycle |
| **Turn** | `turn.started`, `turn.completed`, `turn.aborted` | Conversation turn boundaries |
| **Content** | `content.text-delta`, `content.reasoning-delta` | Streaming text from the model |
| **Tool** | `tool.started`, `tool.progress`, `tool.completed` | MCP/built-in tool execution |
| **Request** | `request.opened`, `request.resolved` | Approval/permission requests |
| **Error** | `runtime.error`, `runtime.warning` | Error reporting |
| **Token** | `token-usage.updated` | Cost tracking |

Total: ~18 events for MVP (expandable to t3code's 47 later).

### 1.2 Define the base event shape

Create `packages/shared/src/runtime-events.ts` (or a new `packages/contracts`
— see Phase 8):

```typescript
export interface CanonicalRuntimeEventBase {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Which provider emitted this: 'bedrock' | 'claude' | 'codex' */
  provider: ProviderKind;
  /** Session/thread ID */
  threadId: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** Turn ID (if within a turn) */
  turnId?: string;
  /** Item ID (for tool calls, content blocks) */
  itemId?: string;
  /** Approval request ID */
  requestId?: string;
}

export type CanonicalRuntimeEvent =
  | SessionStartedEvent
  | SessionConfiguredEvent
  | SessionStateChangedEvent
  | SessionExitedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnAbortedEvent
  | ContentDeltaEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolCompletedEvent
  | RequestOpenedEvent
  | RequestResolvedEvent
  | RuntimeErrorEvent
  | RuntimeWarningEvent
  | TokenUsageUpdatedEvent;
```

Each event type extends the base and adds a `method` discriminator string plus
type-specific payload fields.

### 1.3 Define `ProviderKind`

```typescript
export type ProviderKind = 'bedrock' | 'claude' | 'codex';
```

**Decision:** Use `'bedrock'` (not `'voltagent'` or `'strands'`) because the
user-facing concept is "I'm using a Bedrock model." The VoltAgent vs Strands
distinction is an internal implementation detail of the Bedrock adapter.

### 1.4 Validation

Add runtime validation for events using Biome-friendly patterns (no
Effect.ts dependency required — use discriminated unions + type guards, or
optionally zod/valibot if already in the dependency tree).

### Exit Criteria

- [x] `CanonicalRuntimeEvent` type is defined and exported from `packages/shared`
- [x] All 18 MVP event types have TypeScript interfaces
- [x] `ProviderKind` type is defined
- [x] At least one unit test validates event shape construction
- [x] `npx tsc --noEmit` passes

---

## Phase 2 — Provider Adapter Interface

**Purpose:** Define the contract that every agent runtime must implement.

### 2.1 Define `ProviderAdapterShape`

**Reference:** t3code's `ProviderAdapterShape<TError>` in
`apps/server/src/provider/Services/ProviderAdapter.ts`.

Create `src-server/providers/adapter-shape.ts`:

```typescript
import type { CanonicalRuntimeEvent, ProviderKind } from '@stallion-ai/shared';

export interface ProviderSessionStartInput {
  threadId: string;
  provider: ProviderKind;
  cwd?: string;
  modelId?: string;
  modelOptions?: Record<string, unknown>;
  resumeCursor?: unknown;
}

export interface ProviderSendTurnInput {
  threadId: string;
  input: string;
  attachments?: unknown[];
  modelId?: string;
  modelOptions?: Record<string, unknown>;
}

export interface ProviderSession {
  provider: ProviderKind;
  threadId: string;
  status: 'connecting' | 'ready' | 'running' | 'error' | 'closed';
  model?: string;
  resumeCursor?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderTurnStartResult {
  threadId: string;
  turnId: string;
  resumeCursor?: unknown;
}

export interface ProviderAdapterShape {
  /** Which provider this adapter implements */
  readonly provider: ProviderKind;

  /** Start a new session */
  startSession(input: ProviderSessionStartInput): Promise<ProviderSession>;

  /** Send a user turn */
  sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult>;

  /** Interrupt the active turn */
  interruptTurn(threadId: string, turnId?: string): Promise<void>;

  /** Respond to an approval request */
  respondToRequest(
    threadId: string,
    requestId: string,
    decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
  ): Promise<void>;

  /** Stop a session */
  stopSession(threadId: string): Promise<void>;

  /** List active sessions */
  listSessions(): Promise<ProviderSession[]>;

  /** Check if this adapter owns a session */
  hasSession(threadId: string): Promise<boolean>;

  /** Stop all sessions */
  stopAll(): Promise<void>;

  /** Canonical runtime event stream */
  streamEvents(): AsyncIterable<CanonicalRuntimeEvent>;
}
```

### 2.2 Register adapters in the provider registry

Extend `src-server/providers/types.ts` to add:

```typescript
export interface IProviderAdapterRegistry {
  register(adapter: ProviderAdapterShape): void;
  get(provider: ProviderKind): ProviderAdapterShape | undefined;
  list(): ProviderAdapterShape[];
}
```

Add `'providerAdapter'` to `PROVIDER_TYPE_META` as `'additive'`.

### 2.3 Create the Bedrock adapter (wrapper)

Wrap the existing VoltAgent/Strands runtime into a `BedrockAdapter` that
implements `ProviderAdapterShape`. This adapter:

- Translates VoltAgent events → `CanonicalRuntimeEvent`
- Delegates to the existing `stallion-runtime.ts` for actual execution
- Acts as the bridge so existing functionality keeps working

**This is the highest-risk step.** The existing runtime is ~1500 lines. The
adapter should be a thin translation layer, NOT a rewrite.

### Exit Criteria

- [x] `ProviderAdapterShape` interface is defined
- [x] `IProviderAdapterRegistry` is added to provider types
- [x] `BedrockAdapter` wraps existing runtime and emits `CanonicalRuntimeEvent`s
- [x] Existing VoltAgent/Strands functionality is unbroken (smoke test)
- [x] `npx tsc --noEmit` and `npx biome check` pass

---

## Phase 3 — Claude Agent SDK Adapter

**Purpose:** Add Claude Code as a first-class coding agent provider.

### 3.1 Install the SDK

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### 3.2 Create `ClaudeAdapter`

New file: `src-server/providers/adapters/claude-adapter.ts`

**Reference:** t3code's `ClaudeAdapter.ts` (3065 lines). Ours will be simpler
because we don't need Effect.ts — we use plain async/await + EventEmitter.

Key responsibilities:

1. **Session start:** Call `query()` from the SDK with the configured model,
   system prompt, and MCP tools
2. **Event mapping:** Map SDK events (`SDKMessage`, tool use, permission
   requests) → `CanonicalRuntimeEvent`
3. **Resume cursor:** Store the SDK's conversation state for session recovery
4. **Approval flow:** Map SDK `PermissionUpdate` events → `request.opened`
   events; pipe user decisions back via `PermissionResult`
5. **Model options:** Support `thinking` toggle, `effort` levels (low/medium/
   high/max), `contextWindow` selection

### 3.3 Claude-specific model configuration

Add to agent schema or provider config:

```typescript
export interface ClaudeModelOptions {
  thinking?: boolean;
  effort?: 'low' | 'medium' | 'high' | 'max';
  contextWindow?: string;
}
```

### 3.4 API key management

Claude Agent SDK needs an API key (not Bedrock credentials). Options:

- **Environment variable:** `ANTHROPIC_API_KEY`
- **Settings provider:** Add to `ISettingsProvider.getDefaults()`
- **Plugin-contributed:** A plugin could provide the key

**Decision needed:** Which approach fits Stallion's philosophy best? Likely
environment variable for now, settings UI later.

### Exit Criteria

- [x] `@anthropic-ai/claude-agent-sdk` is installed
- [x] `ClaudeAdapter` implements `ProviderAdapterShape`
- [x] Can start a Claude session, send a turn, receive streaming text
- [x] SDK events are mapped to `CanonicalRuntimeEvent`s
- [x] Approval/permission flow works end-to-end
- [x] Unit tests for event mapping
- [x] All lint/type/test gates pass

---

## Phase 4 — Codex Adapter

**Purpose:** Add OpenAI Codex as a first-class coding agent provider.

### 4.1 Approach

**Reference:** t3code runs `codex app-server` as a child process (JSON-RPC
over stdio). We replicate this pattern.

### 4.2 Create `CodexAdapter`

New file: `src-server/providers/adapters/codex-adapter.ts`

Key responsibilities:

1. **Process management:** Spawn `codex app-server` via `node-pty` or
   `child_process`, communicate via JSON-RPC over stdio
2. **Session lifecycle:** Map JSON-RPC session methods to
   `ProviderAdapterShape` interface
3. **Event mapping:** Map Codex's native events → `CanonicalRuntimeEvent`
4. **Model options:** Support `reasoningEffort` (xhigh/high/medium/low),
   `fastMode`

### 4.3 Codex-specific model configuration

```typescript
export interface CodexModelOptions {
  reasoningEffort?: 'xhigh' | 'high' | 'medium' | 'low';
  fastMode?: boolean;
}
```

### 4.4 Prerequisites

- Codex CLI must be installed (`codex` binary available)
- OpenAI API key (`OPENAI_API_KEY`)

Add a `getPrerequisites()` check to the adapter.

### Exit Criteria

- [x] `CodexAdapter` implements `ProviderAdapterShape`
- [x] Can start a Codex session, send a turn, receive streaming output
- [x] JSON-RPC communication works reliably
- [x] Codex events mapped to `CanonicalRuntimeEvent`s
- [x] All lint/type/test gates pass

---

## Phase 5 — Unified Orchestration Layer

**Purpose:** Build the layer that consumes `CanonicalRuntimeEvent`s from all
adapters and provides a provider-agnostic API to the UI.

### 5.1 Create `OrchestrationService`

New file: `src-server/services/orchestration-service.ts`

Responsibilities:

1. **Adapter registry:** Hold references to all registered
   `ProviderAdapterShape` instances
2. **Session routing:** Given a threadId, route commands to the correct adapter
3. **Event fan-in:** Merge all adapters' event streams into a single ordered
   stream
4. **Event persistence:** Write events to the event store (Phase 6)
5. **Read model projection:** Maintain in-memory session state from events
6. **SSE/WebSocket push:** Forward events to the UI

### 5.2 Command dispatch pattern

Model on t3code's approach:

```typescript
type OrchestrationCommand =
  | { type: 'startSession'; input: ProviderSessionStartInput }
  | { type: 'sendTurn'; input: ProviderSendTurnInput }
  | { type: 'interruptTurn'; threadId: string; turnId?: string }
  | { type: 'respondToRequest'; threadId: string; requestId: string; decision: string }
  | { type: 'stopSession'; threadId: string };
```

Each command is validated, routed to the correct adapter, and its result
(success or error) is tracked with an idempotent command receipt.

### 5.3 Wire into existing Hono routes

Add orchestration routes alongside existing chat/agent routes. Don't replace
the existing routes yet — run in parallel until the new system is proven.

### Exit Criteria

- [x] `OrchestrationService` can route commands to any registered adapter
- [x] Event fan-in merges streams from multiple adapters
- [x] Events are pushed to the UI via SSE or WebSocket
- [x] Existing Bedrock chat functionality still works via old routes
- [x] New orchestration routes are accessible

---

## Phase 6 — Event-Sourced Session Tracking

**Purpose:** Persist all runtime events for audit, replay, and crash recovery.

### 6.1 Event store schema

Using the existing libsql/turso database:

```sql
CREATE TABLE IF NOT EXISTS orchestration_events (
  id TEXT PRIMARY KEY,           -- event UUID
  provider TEXT NOT NULL,        -- 'bedrock' | 'claude' | 'codex'
  thread_id TEXT NOT NULL,       -- session/thread ID
  turn_id TEXT,                  -- turn ID (nullable)
  method TEXT NOT NULL,          -- event type discriminator
  payload TEXT NOT NULL,         -- JSON-serialized event
  created_at TEXT NOT NULL,      -- ISO 8601
  sequence INTEGER NOT NULL      -- per-thread sequence number
);

CREATE INDEX idx_events_thread ON orchestration_events(thread_id, sequence);
CREATE INDEX idx_events_method ON orchestration_events(method);

CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
  command_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'accepted' | 'rejected' | 'failed'
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_session_state (
  thread_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  resume_cursor TEXT,             -- JSON, adapter-owned opaque blob
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 6.2 Event writer

Append events atomically with incrementing sequence numbers per thread.

### 6.3 Session recovery

On startup, read `provider_session_state` and attempt to resume sessions
using each adapter's `resumeCursor`. If resume fails, mark session as closed.

### 6.4 OTel integration

Add OpenTelemetry spans for event persistence, following existing
`stallion.<domain>.<metric>` naming convention.

### Exit Criteria

- [x] Event store tables are created via migration
- [x] All `CanonicalRuntimeEvent`s are persisted
- [x] Session state is recoverable after server restart
- [x] OTel metrics for event write latency and count
- [x] All lint/type/test gates pass

---

## Phase 7 — UI Integration

**Purpose:** Let users select providers and see unified conversation rendering.

### 7.1 Provider picker

Add a provider selection UI (dropdown or toggle) to the chat view:

- Show available providers based on registered adapters
- Show available models per provider
- Show provider-specific options (effort, thinking, etc.)

### 7.2 Unified conversation renderer

The existing chat renderer consumes VoltAgent-specific events. Create a new
renderer (or adapt the existing one) that consumes
`CanonicalRuntimeEvent`s:

- `content.text-delta` → streaming text display
- `tool.started/progress/completed` → tool execution cards
- `request.opened` → approval dialog
- `turn.completed` → turn boundary marker

### 7.3 Model options per provider

When the user selects Claude: show thinking toggle, effort dropdown.
When the user selects Codex: show reasoning effort dropdown.
When the user selects Bedrock: show existing model picker.

### Exit Criteria

- [x] Users can select between Bedrock, Claude, and Codex
- [x] Conversations render identically regardless of provider
- [x] Approval flow works for all providers
- [x] Provider-specific options are exposed in the UI

---

## Phase 8 — Contracts Package

**Purpose:** Consolidate type definitions and validation schemas into a
dedicated package for cross-package consistency.

### 8.1 Create `packages/contracts`

```json
{
  "name": "@stallion-ai/contracts",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### 8.2 Move types

Migrate from their current locations:

| Type | From | To |
|------|------|----|
| `CanonicalRuntimeEvent` | `packages/shared` | `packages/contracts/src/runtime-events.ts` |
| `ProviderKind` | `packages/shared` | `packages/contracts/src/provider.ts` |
| `ProviderSession` | `src-server/providers/adapter-shape.ts` | `packages/contracts/src/provider.ts` |
| `OrchestrationCommand` | `src-server/services/orchestration-service.ts` | `packages/contracts/src/orchestration.ts` |
| Agent/Tool schemas | `schemas/*.json` | `packages/contracts/src/schemas/` (keep JSON, add TS types) |

### 8.3 Subpath exports

Follow t3code's pattern — no barrel index:

```json
{
  "exports": {
    "./runtime-events": "./src/runtime-events.ts",
    "./provider": "./src/provider.ts",
    "./orchestration": "./src/orchestration.ts",
    "./model": "./src/model.ts"
  }
}
```

### Exit Criteria

- [x] `packages/contracts` exists and is in workspace
- [x] All cross-package types are defined in contracts
- [x] `src-server` and `src-ui` import from `@stallion-ai/contracts`
- [x] No circular dependencies
- [x] All lint/type/test gates pass

---

## Cross-Cutting Concerns

### Testing Strategy

| Layer | Test Type | Tool |
|-------|-----------|------|
| Event types | Unit (shape validation) | Vitest |
| Adapter event mapping | Unit (SDK event → canonical event) | Vitest |
| Orchestration routing | Integration (multi-adapter) | Vitest |
| UI rendering | Component (event → DOM) | Vitest + Testing Library |
| Full flow | E2E (start session → send turn → see output) | Playwright |

### OTel Instrumentation

Every new service must add metrics following `stallion.<domain>.<metric>`:

- `stallion.orchestration.commands_dispatched` (counter, by provider + type)
- `stallion.orchestration.events_persisted` (counter, by provider + method)
- `stallion.orchestration.event_persist_duration` (histogram)
- `stallion.adapter.session_start_duration` (histogram, by provider)
- `stallion.adapter.turn_duration` (histogram, by provider)

### Error Handling

Adapters should define typed error classes (not generic `Error`):

```typescript
export class ProviderAdapterSessionNotFoundError extends Error { ... }
export class ProviderAdapterSessionClosedError extends Error { ... }
export class ProviderAdapterRequestError extends Error { ... }
export class ProviderAdapterProcessError extends Error { ... }
```

### Provider Boundary Rules

When implementing or extending Claude/Codex support:

- Prefer the native runtime/CLI/SDK over re-implementing provider semantics in
  Stallion
- Keep provider-specific protocol logic inside the adapter
- Route all user-facing approval / interrupt / session actions through
  Stallion orchestration abstractions
- Treat canonical events and orchestration read models as the only UI-facing
  runtime contract
- Avoid adding UI-only execution truth that diverges from orchestration state

### Context Engineering Rules

To keep future sessions aligned:

- `01` is the source of truth for architecture and responsibility boundaries
- `03` is the source of truth for UX/application of those boundaries
- If a new session needs rediscovery, re-read both plans before editing
- Use parallel exploration for bounded read-only subtasks, but keep final
  architectural synthesis in one place to avoid drift

### Windows Compatibility

All `spawn()` and `execSync()` calls MUST include `windowsHide: true`.
Use `where` instead of `which` on Windows.

---

## Decision Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| D1 | Use `ProviderKind = 'bedrock' \| 'claude' \| 'codex'` not runtime names | User-facing concept; VoltAgent/Strands are implementation details | 2026-03-28 |
| D2 | Plain async/await + EventEmitter, not Effect.ts | Matches existing codebase; avoids new paradigm introduction | 2026-03-28 |
| D3 | Wrap existing runtime in BedrockAdapter, don't rewrite | Lowest risk; preserves all existing functionality | 2026-03-28 |
| D4 | Start with 18 event types, not 47 | MVP coverage; expand as providers need more granularity | 2026-03-28 |
| D5 | Contracts package uses plain TS types + optional zod | Biome-compatible; no Effect.ts dependency in shared code | 2026-03-28 |
| D6 | Event store in libsql (existing DB) | No new infrastructure; piggyback on existing turso setup | 2026-03-28 |

---

## File Index

Files that will be created or significantly modified, by phase:

### Phase 0
- `CLAUDE.md` (symlink → `AGENTS.md`) — **new**
- `AGENTS.md` — **modified** (add task completion gates)
- `.plans/README.md` — **new**
- `.plans/01-connected-agents-overhaul.md` — **new** (this file)

### Phase 1
- `packages/contracts/src/provider.ts` — **new**
- `packages/contracts/src/runtime-events.ts` — **new**
- `packages/shared/src/runtime-events.ts` — **new compatibility re-export**

### Phase 2
- `src-server/providers/adapter-shape.ts` — **new**
- `src-server/providers/registry.ts` — **modified**
- `src-server/providers/types.ts` — **modified**
- `src-server/providers/adapters/bedrock-adapter.ts` — **new**

### Phase 3
- `src-server/providers/adapters/claude-adapter.ts` — **new**
- `package.json` — **modified** (add `@anthropic-ai/claude-agent-sdk`)

### Phase 4
- `src-server/providers/adapters/codex-adapter.ts` — **new**

### Phase 5
- `src-server/services/orchestration-service.ts` — **new**
- `src-server/routes/orchestration.ts` — **new**
- `src-server/runtime/stallion-runtime.ts` — **modified** (wire in orchestration)

### Phase 6
- `src-server/domain/migrations/003-orchestration-events.ts` — **new**
- `src-server/services/event-store.ts` — **new**
- `src-server/telemetry/metrics.ts` — **modified** (add orchestration metrics)

### Phase 7
- `src-ui/src/components/ChatDock.tsx` — **modified**
- `src-ui/src/components/ChatSettingsPanel.tsx` — **modified**
- `src-ui/src/contexts/ActiveChatsContext.tsx` — **modified**
- `src-ui/src/hooks/useOrchestration.ts` — **new**
- `src-ui/src/hooks/useDerivedSessions.ts` — **modified**
- `tests/orchestration-provider-picker.spec.ts` — **new**

### Phase 8
- `packages/contracts/` — **new package**
- `tsconfig.json` — **modified** (contracts path mapping)
- `vite.config.ts` — **modified** (contracts and workspace aliases)
- `packages/shared/src/runtime-events.ts` → `packages/contracts/src/runtime-events.ts` — **moved**

---

## Glossary

| Term | Definition |
|------|-----------|
| **Adapter** | Implementation of `ProviderAdapterShape` for a specific agent runtime |
| **Canonical event** | A `CanonicalRuntimeEvent` — the unified event type all adapters emit |
| **Command** | An `OrchestrationCommand` — a validated user intent dispatched to an adapter |
| **Contracts** | The `@stallion-ai/contracts` package — shared types and schemas |
| **Event store** | Append-only SQLite table of all canonical events |
| **Orchestration** | The layer that routes commands, merges events, and builds read models |
| **Provider** | A `ProviderKind` value: `'bedrock'`, `'claude'`, or `'codex'` |
| **Read model** | In-memory state derived from events (e.g., current session status) |
| **Resume cursor** | Opaque adapter-owned blob for session recovery after crash |
| **Turn** | A single user message → agent response cycle |

---

## Implementation Order Summary

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 3  ──→  Phase 5  ──→  Phase 7
(setup)      (events)     (interface)   (Claude)      (orchestr.)   (UI)
                                            │
                                         Phase 4  ─────────┘
                                         (Codex)

                           Phase 6 can start after Phase 5
                           Phase 8 can start after Phase 1
```

Phases 3 and 4 are independent of each other.
Phase 6 depends on Phase 5.
Phase 8 can be done anytime after Phase 1 (it's a refactor/move).

---

*Last updated: 2026-03-29*
*Author: Brian + Claude*
