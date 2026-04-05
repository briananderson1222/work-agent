# Plan 03: Connections UX and Runtime Abstractions

> **Goal:** Replace the weak current "provider" UX with a clearer, more familiar
> **Connections** model that supports both classic model backends and richer
> agent runtimes such as ACP, Claude Agent SDK, and Codex, while preserving the
> plugin-extensible additive architecture underneath.
>
> **Depends on:**
> - [Plan 01 — Connected Agents Overhaul](./01-connected-agents-overhaul.md)
> - [Plan 02 — Connected Agents Hardening & Verification](./02-connected-agents-hardening-and-verification.md)
>
> **Product intent:** Users should configure all external AI backends in one
> familiar place, assign execution behavior in agent settings, and see session
> state in chat. Chat UI should not own system architecture.

---

## Table of Contents

1. [Why This Plan Exists](#1-why-this-plan-exists)
2. [North-Star UX](#2-north-star-ux)
3. [Current UX and Architecture Mismatch](#3-current-ux-and-architecture-mismatch)
4. [Design Principles](#4-design-principles)
5. [Canonical Product Abstraction: Connection](#5-canonical-product-abstraction-connection)
6. [Capability Model](#6-capability-model)
7. [Execution Model](#7-execution-model)
8. [Target UX Information Architecture](#8-target-ux-information-architecture)
9. [Connections UX Specification](#9-connections-ux-specification)
10. [Agent Editor UX Specification](#10-agent-editor-ux-specification)
11. [Session and Chat UX Specification](#11-session-and-chat-ux-specification)
12. [Backend and Schema Changes](#12-backend-and-schema-changes)
13. [Plugin Extensibility Requirements](#13-plugin-extensibility-requirements)
14. [Phased Implementation Plan](#14-phased-implementation-plan)
15. [Acceptance Criteria](#15-acceptance-criteria)
16. [Decision Log](#16-decision-log)
17. [Execution-Ready Implementation Spec](#17-execution-ready-implementation-spec)
18. [File Index](#18-file-index)

---

## 1. Why This Plan Exists

The app currently has two different mental models competing with each other:

- **Providers** in `Connections > Providers` for Bedrock, Ollama, and
  OpenAI-compatible backends
- **Runtime selection** in Chat Dock settings for Bedrock, Claude, and Codex

That split is confusing for users and inaccurate architecturally:

- Claude and Codex are not just "another LLM provider"
- Chat Dock is the wrong place to define architecture-level execution behavior
- ACP already behaves more like an agent runtime than a simple model backend
- The current provider UX is weak enough that forcing everything into it would
  preserve the weakness instead of improving it

This plan uses the current transition as a chance to improve the UX at the
abstraction level instead of extending the mismatch.

---

## 2. North-Star UX

A user can answer three questions without understanding internal implementation
details:

1. **What external AI backends are available?**
   They open **Connections** and see all configured backends in one place.

2. **How does this agent run?**
   They open an agent and see its execution target in an **Execution** section.

3. **What is this session currently using?**
   They look at the chat/session UI and see a read-only execution summary.

The user should not need to understand the difference between:

- provider
- runtime
- adapter
- orchestration provider
- ACP transport

Those distinctions remain implementation details unless they materially help
the user make a product decision.

---

## 3. Current UX and Architecture Mismatch

### 3.1 Current UX

Today:

- `Connections > Providers` exposes:
  - Bedrock
  - Ollama
  - OpenAI-compatible
- Chat Dock settings exposes:
  - Bedrock
  - Claude
  - Codex

This creates several product problems:

- The main backend-management area is incomplete
- Claude and Codex look like per-chat preferences instead of core execution
  backends
- The user must know that some backends are configured in Connections while
  others are chosen in Chat Dock

### 3.2 Current Architecture

The underlying architecture already distinguishes two meaningful layers:

- `ILLMProvider`
  Raw model/embedding access
- `ProviderAdapterShape`
  Session-based runtime orchestration and canonical event streaming

That distinction is real and useful, but it is not reflected clearly in the UX.

### 3.3 Why We Should Not Overload "Provider"

The current provider abstraction is best suited for backends that answer:

- how do I authenticate?
- what models exist?
- how do I stream tokens?
- do I support embeddings?

Claude, Codex, and ACP additionally require:

- session lifecycle
- multi-turn runtime orchestration
- tool loop management
- approval handling
- interrupt semantics
- resume and recovery
- richer event streams

That is not a small extension of the current provider concept. It is a
different concern.

---

## 4. Design Principles

### 4.1 UX First, Familiar Second, Novel Only When Necessary

Use familiar entry points:

- **Connections** for external systems
- **Agents** for defaults and behavior
- **Chat** for session display and interaction

Do not invent a new top-level area unless it solves a real user problem.

### 4.2 DRY at the Product Boundary

Do not create separate bespoke management experiences for:

- model providers
- runtimes
- ACP

Instead, use one shared **Connections** shell with subtype-specific forms and
shared status/prerequisite/test patterns.

### 4.3 Truthful Abstractions

Do not pretend Claude/Codex are identical to raw LLM providers if they are not.
Introduce the right abstraction and let the UI present it cleanly.

### 4.4 Additive, Plugin-Extensible Core

The repo is provider-first and plugin-extensible. Any new abstraction must be:

- additive
- capability-based
- compatible with plugin registrations
- not a rewrite of underlying provider/runtime registries

### 4.5 Chat Does Not Own Architecture

Chat/session UI may **display** execution state, but must not be the primary
place where system architecture is configured.

---

## 5. Canonical Product Abstraction: Connection

Introduce a new **product-level** abstraction:

- **Connection**

A Connection is any configured external AI backend the app can validate, test,
and use.

This abstraction is intentionally higher level than:

- `ILLMProvider`
- `ProviderAdapterShape`
- ACP internals

Those remain implementation abstractions.

### 5.1 Important Constraint

`Connection` should be a **projection over existing architecture**, not a
replacement for it.

That means:

- core provider/runtime registries remain additive
- plugins continue to contribute capabilities
- Connection is what the UI and config domain reason about

### 5.2 Why Connection Is Better Than More Provider Types

Benefits:

- one familiar place in the UI
- one consistent persistence and status story
- clean plugin surface
- no forced conflation between model access and runtime orchestration

---

## 6. Capability Model

Rather than forcing a rigid class hierarchy, model Connections by capabilities.

### 6.1 Connection Kind

We still want a top-level grouping for UX:

- `model`
- `runtime`

But behavior should come from capabilities, not only kind.

### 6.2 Base Type

```ts
type ConnectionKind = 'model' | 'runtime';

type ConnectionCapability =
  | 'llm'
  | 'embedding'
  | 'vectordb'
  | 'agent-runtime'
  | 'session-lifecycle'
  | 'tool-calls'
  | 'interrupt'
  | 'approvals'
  | 'resume'
  | 'reasoning-events'
  | 'external-process'
  | 'acp';

interface Connection {
  id: string;
  kind: ConnectionKind;
  type: string;
  name: string;
  enabled: boolean;
  description?: string;
  capabilities: ConnectionCapability[];
  config: Record<string, unknown>;
  status: 'ready' | 'degraded' | 'missing_prerequisites' | 'disabled' | 'error';
  prerequisites: ConnectionPrerequisite[];
  lastCheckedAt?: string | null;
}
```

### 6.3 Expected Built-In Connection Types

**Model connections**

- `bedrock`
- `ollama`
- `openai-compat`

**Runtime connections**

- `bedrock-runtime`
- `claude-runtime`
- `codex-runtime`
- `acp`

### 6.4 Capability Examples

**Bedrock model connection**

- `llm`
- `embedding`

**Claude runtime connection**

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `reasoning-events`

**Codex runtime connection**

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `resume`
- `external-process`

**ACP**

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `acp`

This keeps the abstraction open-ended for plugins and future runtimes.

---

## 7. Execution Model

Agents should point at an execution target, not rely on Chat Dock state.

```ts
interface AgentExecutionConfig {
  runtimeConnectionId: string;
  modelConnectionId?: string | null;
  modelId?: string | null;
  runtimeOptions?: Record<string, unknown>;
  modelOptions?: Record<string, unknown>;
}
```

### 7.1 Interpretation

- `runtimeConnectionId` is required
- `modelConnectionId` is optional
- `modelId` is optional
- some runtimes resolve their own models natively
- some runtimes depend on a model connection

### 7.2 Session Rule

A session resolves its execution target at creation time and stores it.

Chat UI must not be the primary way to change that target after session start.

If the user wants a different runtime/model, that should happen at:

- agent configuration time, or
- session creation time, or
- an explicit "start new session with different execution" flow later

---

## 8. Target UX Information Architecture

### 8.1 Connections

Connections becomes the single place for all external AI backends.

Sections:

1. **Model Connections**
2. **Runtime Connections**
3. **Knowledge Connections**
4. **Tool Servers**

### 8.2 Agents

Agents get an explicit **Execution** section.

### 8.3 Chat

Chat displays current execution state but does not own execution policy.

---

## 9. Connections UX Specification

### 9.1 Connections Hub

Change the current Connections hub to show:

#### Model Connections

Cards for:

- Bedrock
- Ollama
- OpenAI-compatible

Show:

- name
- type
- enabled state
- capability chips
- readiness/prerequisite summary

#### Runtime Connections

Cards for:

- Bedrock Runtime
- Claude Runtime
- Codex Runtime
- ACP

Show:

- name
- runtime type
- enabled state
- active/healthy summary
- prerequisite summary

Examples:

- `Claude Runtime — ANTHROPIC_API_KEY missing`
- `Codex Runtime — Codex CLI installed · OPENAI_API_KEY missing`
- `ACP — 1 active connection`

### 9.2 Shared Connection Detail Shell

Every connection detail page should use the same shell:

- title
- type
- status
- prerequisites
- configuration form
- test action
- save/delete controls

Subtype-specific fields are rendered inside that shell.

### 9.3 Runtime Connection Forms

**Claude Runtime**

Fields:

- Name
- Enabled
- Default model
- Default thinking enabled
- Default effort
- Test runtime

**Codex Runtime**

Fields:

- Name
- Enabled
- Default model
- Default reasoning effort
- Default fast mode
- CLI presence status
- Test runtime

**ACP**

Reuse existing ACP-specific management where possible, but surface it under
Runtime Connections in the IA.

**Bedrock Runtime**

Fields:

- Name
- Enabled
- maybe linked model connection reference
- maybe default runtime-specific behavior flags

### 9.4 Model Connection Forms

Existing provider forms evolve into model-connection forms.

Likely reuse most of the current UI for:

- Bedrock
- Ollama
- OpenAI-compatible

This is a rename and framing improvement more than a redesign.

---

## 10. Agent Editor UX Specification

Add a first-class **Execution** section to the agent editor.

### 10.1 Fields

1. Runtime Connection
2. Model Connection, when applicable
3. Model ID, when applicable
4. Runtime defaults, conditional

### 10.2 Conditional Behavior

**If runtime is Bedrock Runtime**

Show:

- model connection selector
- model ID/picker

**If runtime is Claude Runtime**

Show:

- model ID
- thinking toggle
- effort selector

**If runtime is Codex Runtime**

Show:

- model ID
- reasoning effort selector
- fast mode toggle

**If runtime is ACP**

Show:

- ACP target selector if needed

### 10.3 Agent Summary UX

In agents list/detail surfaces, display:

- Runtime: Claude Runtime
- Model: claude-sonnet-4

This makes execution discoverable without opening chat.

---

## 11. Session and Chat UX Specification

### 11.1 Session Creation

For V1:

- New chat/session resolves execution from the selected agent
- The New Chat modal may show execution as read-only summary

Potential later enhancement:

- allow choosing among valid execution presets before the session starts

### 11.2 Chat Dock

Remove runtime/provider controls from Chat Settings.

Keep:

- font size
- reasoning visibility
- tool detail visibility
- dock position

Add read-only execution summary:

- runtime
- model
- session status

### 11.3 Explicit Rule

Chat Dock must not be the primary UX for:

- choosing Claude vs Codex vs Bedrock
- setting runtime defaults
- configuring architecture-level execution behavior

---

## 12. Backend and Schema Changes

### 12.1 New Connection Service

Introduce a `ConnectionService` that projects over existing model-provider,
runtime-adapter, and ACP configuration/state.

Responsibilities:

- list connections
- list model connections
- list runtime connections
- fetch a connection by id
- save/update connection config
- remove connection config
- test/health-check connection
- collect prerequisites

### 12.2 Keep Existing Lower-Level Abstractions

Do **not** replace:

- `ILLMProvider`
- `ProviderAdapterShape`
- plugin registries

Instead:

- `ConnectionService` composes over them
- Connection is the UI/config domain abstraction

### 12.3 API Endpoints

Add:

- `GET /api/connections`
- `GET /api/connections/models`
- `GET /api/connections/runtimes`
- `GET /api/connections/:id`
- `POST /api/connections`
- `PUT /api/connections/:id`
- `DELETE /api/connections/:id`
- `POST /api/connections/:id/test`

Legacy handling:

- `/api/providers` remains temporarily for model-only compatibility
- `/api/orchestration/providers` remains runtime-status-focused, not the main
  configuration source

### 12.4 Persistence

Recommended V1 persistence shape:

- one unified connections config with `kind` and `capabilities`

This keeps persistence DRY while still allowing subtype-specific config.

### 12.5 Agent Schema

Add or normalize:

- `execution.runtimeConnectionId`
- `execution.modelConnectionId`
- `execution.modelId`
- `execution.runtimeOptions`
- `execution.modelOptions`

---

## 13. Plugin Extensibility Requirements

This plan must remain plugin-extensible from day one.

### 13.1 Plugin Requirements

Plugins must be able to contribute:

- model connections
- runtime connections
- prerequisite evaluators
- health/test behavior
- config form metadata or render hooks

### 13.2 Capability-Driven Extensibility

Plugins should not need a core code change every time a new runtime type is
added.

That means:

- `type` stays open-ended
- capabilities drive grouping and feature support
- core only needs well-defined rendering and persistence extension points

### 13.3 UX Stability

Even when plugin types vary, the user experience should still feel familiar:

- save
- test
- prerequisite status
- enable/disable
- assign to agent execution

---

## 14. Phased Implementation Plan

## Phase 0 — Audit and Vocabulary Freeze

**Purpose:** Confirm current UX and architecture boundaries before refactoring.

### 0.1 Inventory existing surfaces

Document current usage of:

- `/api/providers`
- `/api/orchestration/providers`
- ACP UI
- Agent config execution fields
- Chat Dock provider settings

### 0.2 Freeze terminology

Use these terms consistently:

- **Connection** — configured external backend
- **Model Connection** — model/embedding backend
- **Runtime Connection** — session/orchestration backend
- **Execution** — resolved runtime/model behavior for an agent or session

### Exit Criteria

- current UI/route ownership is documented
- team agrees on the new vocabulary

---

## Phase 1 — Introduce Connection Domain

**Purpose:** Add the new abstraction without breaking existing behavior.

### 1.1 Add shared Connection types

### 1.2 Implement `ConnectionService`

### 1.3 Add `/api/connections/*`

### 1.4 Project existing provider configs into model connections

### 1.5 Project runtime adapters/ACP into runtime connections

### Exit Criteria

- `ConnectionService` can list both model and runtime connections
- UI can fetch connections without depending on Chat Dock behavior

---

## Phase 2 — Connections UI Refresh

**Purpose:** Make Connections the canonical backend-management surface.

### 2.1 Update Connections Hub

Add:

- Model Connections section
- Runtime Connections section

### 2.2 Refactor Provider Settings into Connection detail shell

### 2.3 Add runtime connection detail views

### 2.4 Surface prerequisites and tests consistently

### Exit Criteria

- Claude/Codex/ACP are visible in Connections
- the user can configure/test them without entering Chat Dock

---

## Phase 3 — Agent Execution UX

**Purpose:** Move execution ownership into Agents.

### 3.1 Add Execution section to agent editor

### 3.2 Persist execution config

### 3.3 Surface execution summary in agent list/detail views

### Exit Criteria

- agents define execution target clearly
- chat no longer needs to define runtime for normal usage

---

## Phase 4 — Session and Chat Cleanup

**Purpose:** Remove architecture controls from Chat Dock.

### 4.1 Remove provider/runtime selector from Chat Settings

### 4.2 Add read-only session execution summary

### 4.3 Ensure new sessions resolve execution from the agent

### Exit Criteria

- Chat Dock is display-only for execution state
- session execution is stable after creation

---

## Phase 5 — Cleanup and Migration

**Purpose:** Reduce conceptual debt and preserve compatibility.

### 5.1 Keep legacy endpoints only where necessary

### 5.2 Migrate existing provider UI labels to connection language

### 5.3 Add tests proving the new IA

### Exit Criteria

- Connections is the single backend-management entry point
- runtime configuration is no longer stranded in chat UI
- compatibility paths are explicit and bounded

---

## 15. Acceptance Criteria

This plan is complete when all of the following are true:

1. A user can open **Connections** and see every supported external AI backend.
2. Claude, Codex, and ACP appear in Connections as first-class runtime
   backends.
3. Bedrock/Ollama/OpenAI-compatible remain available as model connections.
4. An agent can declare its runtime and model behavior in a dedicated
   Execution section.
5. A newly created session resolves execution from the agent config.
6. Chat Dock no longer owns provider/runtime selection.
7. Plugin-contributed backends can project into the same Connection UX without
   bespoke top-level UI.
8. The full local quality gate passes:
   - `npx biome check src-server/ src-ui/ packages/`
   - `npx tsc --noEmit`
   - `npm test`
   - UI smoke verification or Playwright coverage for major IA changes

---

## 16. Decision Log

### Decision: Keep Connections as the canonical user-facing area

**Why:** Familiarity matters more than purity. Users already expect external
systems to live under Connections.

### Decision: Introduce Connection as a product abstraction

**Why:** The current provider abstraction is too narrow for runtimes like
Claude, Codex, and ACP.

### Decision: Use capability-driven modeling under a light `kind` grouping

**Why:** This better matches the repo's additive architecture and plugin model
than a rigid class hierarchy.

### Decision: Agent execution belongs in agent config, not Chat Dock

**Why:** Chat/session UI should reflect execution, not own architecture-level
choices.

### Decision: Keep lower-level provider/runtime interfaces intact

**Why:** This plan is additive and should compose over existing architecture,
not replace it.

---

## 17. Execution-Ready Implementation Spec

This section is written for the next session to execute directly with minimal
re-discovery.

### 17.1 Scope for the Next Focused Implementation Session

The next session should **not** try to complete the entire plan. The focused
goal is:

1. Introduce the new **Connection** domain types and server projection layer
2. Expose runtime connections in a first-class Connections API
3. Refresh the Connections hub UI to show **Model Connections** and
   **Runtime Connections**
4. Remove runtime/provider selection from Chat Dock settings
5. Do **not** yet complete the full Agent Editor execution UX unless there is
   still time after the above lands cleanly

Recommended cut line:

- **In scope**
  - shared connection types
  - `ConnectionService`
  - `/api/connections`, `/api/connections/models`, `/api/connections/runtimes`
  - Connections hub IA update
  - Chat Dock settings cleanup
- **Out of scope unless time remains**
  - full agent execution persistence migration
  - full runtime detail edit forms
  - session creation UX redesign

### 17.2 Concrete Architectural Stance

The implementation should follow this rule:

- `Connection` is a **UI/domain projection**
- It is backed by existing provider/runtime/ACP systems
- It does **not** replace:
  - `ILLMProvider`
  - `ProviderAdapterShape`
  - plugin registries

That means the new work should be added as a thin layer over existing systems,
not as a sweeping rewrite.

Additional constraints clarified after implementation review:

- Claude and Codex should lean on their **native** implementations for
  approvals, interrupts, resume, thread semantics, and provider-specific
  options
- Stallion must still own the **shared abstractions** for those features so the
  UI remains consistent across providers
- Therefore:
  - native runtime behavior lives in adapters
  - canonical eventing / orchestration / read models live in Stallion
  - Connections and agent settings are projections/configuration over that
    system, not a second runtime state machine

### 17.3 Canonical Type Definitions

Add shared types in either:

- `packages/shared/src/connections.ts`, or
- `packages/contracts/src/connections.ts`

Prefer `packages/shared` if these are primarily UI/server shared view-model
types rather than strict wire contracts.

Recommended definitions:

```ts
export type ConnectionKind = 'model' | 'runtime';

export type ConnectionStatus =
  | 'ready'
  | 'degraded'
  | 'missing_prerequisites'
  | 'disabled'
  | 'error';

export type ConnectionCapability =
  | 'llm'
  | 'embedding'
  | 'vectordb'
  | 'agent-runtime'
  | 'session-lifecycle'
  | 'tool-calls'
  | 'interrupt'
  | 'approvals'
  | 'resume'
  | 'reasoning-events'
  | 'external-process'
  | 'acp';

export interface ConnectionPrerequisite {
  id: string;
  name: string;
  status: 'installed' | 'missing' | 'warning';
  category: 'required' | 'optional';
  description?: string;
  installGuide?: {
    steps: string[];
  };
}

export interface Connection {
  id: string;
  kind: ConnectionKind;
  type: string;
  name: string;
  enabled: boolean;
  description?: string;
  capabilities: ConnectionCapability[];
  status: ConnectionStatus;
  prerequisites: ConnectionPrerequisite[];
  lastCheckedAt?: string | null;
  config?: Record<string, unknown>;
}
```

For the first pass, the UI likely only needs:

- `id`
- `kind`
- `type`
- `name`
- `enabled`
- `capabilities`
- `status`
- `prerequisites`

### 17.4 Runtime Connection Projection Rules

For the first implementation pass, project these runtime connections even if
they are not yet fully editable:

#### Bedrock Runtime

```json
{
  "id": "runtime-bedrock",
  "kind": "runtime",
  "type": "bedrock-runtime",
  "name": "Bedrock Runtime"
}
```

Capabilities:

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`

Prerequisites:

- AWS credentials from existing Bedrock checks

#### Claude Runtime

```json
{
  "id": "runtime-claude",
  "kind": "runtime",
  "type": "claude-runtime",
  "name": "Claude Runtime"
}
```

Capabilities:

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `reasoning-events`

Prerequisites:

- `ANTHROPIC_API_KEY`

Source of truth:

- use current orchestration/provider prerequisite reporting rather than creating
  a second prerequisite implementation

#### Codex Runtime

```json
{
  "id": "runtime-codex",
  "kind": "runtime",
  "type": "codex-runtime",
  "name": "Codex Runtime"
}
```

Capabilities:

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `resume`
- `external-process`

Prerequisites:

- Codex CLI installed
- `OPENAI_API_KEY`

#### ACP

```json
{
  "id": "runtime-acp",
  "kind": "runtime",
  "type": "acp",
  "name": "ACP"
}
```

Capabilities:

- `agent-runtime`
- `session-lifecycle`
- `tool-calls`
- `interrupt`
- `approvals`
- `acp`

Status should be derived from active ACP connection state.

### 17.5 Model Connection Projection Rules

Continue projecting the current provider records into model connections.

Likely mapping:

- current `bedrock` connection -> `kind: model`, `type: bedrock`
- current `ollama` connection -> `kind: model`, `type: ollama`
- current `openai-compat` connection -> `kind: model`, `type: openai-compat`

Do not rewrite current provider persistence in the first implementation pass.
Adapt it into the new response shape.

### 17.6 New Service: ConnectionService

Add:

- `src-server/services/connection-service.ts`

Responsibilities for V1:

```ts
interface ConnectionService {
  listConnections(): Promise<Connection[]>;
  listModelConnections(): Promise<Connection[]>;
  listRuntimeConnections(): Promise<Connection[]>;
}
```

Implementation guidance:

1. Reuse existing provider service for model connections
2. Reuse orchestration runtime knowledge for runtime connections
3. Reuse ACP status for ACP connection projection
4. Reuse existing prerequisite functions wherever possible

Important architectural note:

- `ConnectionService` is a projection layer only
- it must never become a parallel orchestration system
- runtime truth must still come from adapters + orchestration read models

Avoid trying to build full CRUD and persistence for runtime connections in the
first pass. Listing/projection is enough to fix the IA and unblock the next
layer of work.

### 17.7 New Routes

Add:

- `src-server/routes/connections.ts`

Initial endpoints:

#### `GET /api/connections`

Returns:

```json
{
  "success": true,
  "data": [
    {
      "id": "model-bedrock-default",
      "kind": "model",
      "type": "bedrock",
      "name": "Amazon Bedrock",
      "enabled": true,
      "capabilities": ["llm", "embedding"],
      "status": "ready",
      "prerequisites": []
    },
    {
      "id": "runtime-claude",
      "kind": "runtime",
      "type": "claude-runtime",
      "name": "Claude Runtime",
      "enabled": true,
      "capabilities": ["agent-runtime", "session-lifecycle", "tool-calls"],
      "status": "missing_prerequisites",
      "prerequisites": [
        {
          "id": "anthropic-api-key",
          "name": "ANTHROPIC_API_KEY",
          "status": "missing",
          "category": "required"
        }
      ]
    }
  ]
}
```

#### `GET /api/connections/models`

Returns model connections only.

#### `GET /api/connections/runtimes`

Returns runtime connections only.

Implementation note:

These can be read-only in the first pass.

### 17.8 Server Wiring

Likely server touch points:

- `src-server/runtime/stallion-runtime.ts`
  - instantiate `ConnectionService`
  - pass required dependencies
- `src-server/index.ts`
  - ensure routes are mounted
- existing route registration area where `providers`, `system`, `orchestration`
  are already mounted

The next session should inspect the current route mount location and add
Connections routes alongside other top-level REST surfaces.

### 17.9 UI Changes: Connections Hub

Primary UI file:

- `src-ui/src/views/ConnectionsHub.tsx`

Current state:

- has "Model Providers"
- has "Knowledge"
- has "Tool Servers"

Target first-pass state:

- rename "Model Providers" to **Model Connections**
- add a new **Runtime Connections** section
- pull data from `/api/connections/models` and `/api/connections/runtimes`
- do not yet remove legacy provider detail navigation if it is still being used

Use simple cards first.

Suggested card fields:

- icon
- name
- type
- status dot
- one-line prerequisite summary

Recommended fallback icons:

- model connections:
  - bedrock -> cloud
  - ollama -> server
  - openai-compat -> link
- runtime connections:
  - claude-runtime -> spark or wand
  - codex-runtime -> terminal/code
  - acp -> plug or branches
  - bedrock-runtime -> cloud + play/bolt

### 17.10 UI Changes: Chat Dock

Files:

- `src-ui/src/components/ChatSettingsPanel.tsx`
- `src-ui/src/components/ChatDock.tsx`

Required change:

- remove provider runtime selector from Chat Settings
- remove model entry field from Chat Settings if it is session-execution config
- keep only display preferences:
  - font size
  - reasoning visibility
  - tool detail visibility
  - dock mode

For the first pass, add a read-only section like:

- Runtime: `activeSession?.provider`
- Model: `activeSession?.model`

This can live in `ChatSettingsPanel` temporarily if needed, but it must be
read-only.

Also remove fallback hardcoded runtime list behavior from `ChatDock.tsx` if it
only exists to feed the selector.

Important limit:

- Chat Dock may display execution state
- Chat Dock must not become the place where execution truth is authored or
  mutated independently from Stallion orchestration

### 17.11 UI Changes: Provider Settings View

File:

- `src-ui/src/views/ProviderSettingsView.tsx`

For the next session, do **not** try to fully merge Provider Settings and
Runtime Settings into one editor unless there is obvious leftover time.

Instead:

1. Leave `ProviderSettingsView` functional for model connections
2. If needed, rename labels in-place from "Provider" to "Model Connection"
3. Defer a unified detail shell until after the read-path IA lands

This keeps scope under control.

### 17.12 Recommended Incremental UX Labels

Use these labels consistently in the first pass:

- Connections
- Model Connections
- Runtime Connections
- Execution
- Runtime
- Model

Avoid exposing:

- orchestration provider
- adapter
- runtime adapter

unless it is in a dev-facing tooltip or diagnostic area.

### 17.13 Tests Required for the Next Session

Server tests:

- add route tests for `/api/connections`
- add route tests for `/api/connections/models`
- add route tests for `/api/connections/runtimes`
- verify Claude/Codex prerequisite projection

UI tests:

- if possible, extend or add a focused UI test proving:
  - Connections Hub renders separate Model Connections and Runtime Connections
  - Chat Settings no longer shows provider selector

If full UI coverage is too expensive in the same session, at least ensure:

- `npx biome check src-server/ src-ui/ packages/`
- `npx tsc --noEmit`
- `npm test`

and capture a manual smoke note.

### 17.14 Recommended Task Sequence for the Next Session

Execute in this order:

1. Add shared `Connection` types
2. Implement `ConnectionService`
3. Add `connections.ts` routes
4. Add server route tests
5. Update `ConnectionsHub.tsx`
6. Remove runtime selector from `ChatSettingsPanel.tsx`
7. Update `ChatDock.tsx` to stop feeding runtime selection UI
8. Run quality gates
9. Manual smoke test the Connections page and Chat Dock

### 17.15 Explicit Things to Avoid in the Next Session

Do **not** do these unless the first-pass scope is already complete:

- redesign the full agent editor
- migrate all existing provider persistence into a new storage format
- add runtime detail edit forms for every backend
- implement per-session runtime switching
- merge all connection editors into one brand-new UI shell

Those are follow-on phases after the first architecture/IA correction lands.

### 17.16 Notes for the Next Agent

Important local context:

- The current provider UX is acknowledged to be weak; improving it is a goal,
  not a constraint.
- Preserve plugin extensibility by making `Connection` a projection layer over
  existing additive capabilities, not a replacement abstraction.
- Keep the implementation focused on:
  - stronger IA
  - clearer abstractions
  - low-risk additive server/UI changes
- The Chat Dock should not own execution configuration.

### 17.17 Implementation Guardrails

These rules are required for any follow-on session:

1. **Native runtime owns behavior**
   - Claude/Codex native runtimes own interrupts, approvals, resume, thread
     reads, rollback semantics, and provider-specific execution behavior.

2. **Stallion owns abstraction and presentation**
   - adapters translate native runtime events into canonical Stallion events
   - orchestration owns command routing, persistence, receipts, replay, and
     read models
   - UI consumes orchestration state for a consistent product experience

3. **No parallel execution truth**
   - do not create UI-only or settings-only runtime/session state that bypasses
     orchestration
   - do not let Connections or agent forms become a second source of truth for
     live session behavior

4. **Connections is projection-only**
   - Connections lists/configures available external backends
   - it does not replace the provider adapter registry or orchestration system

5. **Agent execution config is subordinate to orchestration**
   - if execution config is introduced, it must resolve into existing Stallion
     orchestration flows rather than bypassing them

### 17.18 Context Handoff Guidance

For a fresh session:

- Re-read `.plans/01-connected-agents-overhaul.md` first for architecture
- Re-read `.plans/03-connections-runtime-ux.md` second for UX scope
- Audit the current implementation against the guardrails above before editing
- Prefer parallel **read-only** exploration of:
  - t3code reference files
  - local adapter/orchestration files
  - local UI surfaces
- Keep synthesis and edits centralized so architectural decisions do not drift

See `.plans/SESSION-HANDOFF-PROMPT.md` for a reusable prompt template.

## 18. File Index

Expected files likely affected by this plan:

- `src-ui/src/views/ConnectionsHub.tsx`
- `src-ui/src/views/ProviderSettingsView.tsx`
- `src-ui/src/views/AgentEditorForm.tsx`
- `src-ui/src/components/ChatSettingsPanel.tsx`
- `src-ui/src/components/ChatDock.tsx`
- `src-ui/src/hooks/useOrchestration.ts`
- `src-server/routes/orchestration.ts`
- `src-server/routes/providers.ts`
- `src-server/routes/*connections*` (new)
- `src-server/services/provider-service.ts`
- `src-server/services/*connection-service*` (new)
- `src-server/providers/adapter-shape.ts`
- `src-server/providers/types.ts`
- `src-server/domain/config-loader.ts`
- `packages/shared/*` or `packages/contracts/*` for shared connection types
