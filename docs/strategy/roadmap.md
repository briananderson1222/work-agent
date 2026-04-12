# Roadmap

> Phased execution plan for Stallion AI. Each phase has scoped tasks, key files, verification criteria, and a definition of done. Tasks within a phase can be parallelized unless marked as blocking. See [execution-pattern.md](execution-pattern.md) for how to pick up work.

*Last updated: 2026-04-11*
*Active phase: Phase 0 (Foundation Docs)*

---

## Phase 0: Foundation Documents

**Goal:** Establish the project's identity, strategy, and execution infrastructure so any human or AI can pick up work with full context.

**Status: In Progress**

- [x] Write `docs/strategy/constitution.md`
- [x] Write `docs/strategy/differentiators.md`
- [x] Write `docs/strategy/competitive-landscape.md`
- [x] Write `docs/strategy/roadmap.md` (this file)
- [x] Write `docs/strategy/execution-pattern.md`
- [x] Write `docs/strategy/vision/ai-ui-bridge.md`
- [x] Write `docs/strategy/README.md`
- [x] Create ideation commands (`/ideate`, `/competitive-scan`, `/differentiation-check`, `/adoption-blockers`)
- [x] Write `docs/strategy/ideation-log.md` (initial entry)
- [x] Add strategy references to `AGENTS.md` (Codex compatibility)

**Definition of Done:** All files exist, are internally consistent, README links work, roadmap has checkboxes, execution pattern is self-contained enough for a fresh AI to follow.

---

## Phase 1: Harden & Onboard

**Goal:** Anyone can clone the repo, run `./stallion start`, and have a working experience in under 5 minutes without AWS credentials. Core flows are reliable.

**Execution plan:** [../plans/plan-phase1-hardening.md](../plans/plan-phase1-hardening.md)

**Status: In Progress**

### 1a. Remove the Bedrock Gate (BLOCKING)

Make the core runtime provider-agnostic. No AWS credentials required for first run.

- [ ] Change `ProviderKind` from closed literal union (`'bedrock' | 'claude' | 'codex'`) to extensible `string` with well-known constants
- [ ] Make `AppConfig.region` optional (currently required AWS region)
- [ ] Remove `BUILTIN_SOURCES` hard-coding in provider registry
- [ ] Replace `llm-router.ts` switch statement with registry pattern (inspired by Pi-mono's unified LLM API)
- [ ] Auto-detect available providers on first run (Ollama running? API keys set?)
- [ ] Update README prerequisites: remove "AWS credentials" as requirement, show multi-provider options

**Key files:**
- `packages/contracts/src/provider.ts` -- `ProviderKind` type
- `packages/contracts/src/config.ts` -- `AppConfig.region`
- `src-server/providers/registry.ts` -- `BUILTIN_SOURCES`
- `src-server/providers/llm-router.ts` -- switch statement
- `src-server/runtime/stallion-runtime.ts` -- adapter wiring
- `README.md`

**Done when:** `./stallion start` works without `AWS_ACCESS_KEY_ID` set. `./stallion doctor` shows detected providers.

### 1b. Pluggable Runtime Adapters

Allow plugins to register new `ProviderAdapterShape` implementations.

- [ ] Extract adapter registration from `stallion-runtime.ts` into a dynamic adapter registry
- [ ] Define adapter registration interface in `@stallion-ai/contracts`
- [ ] Ship Ollama adapter implementing `ProviderAdapterShape`
- [ ] Verify existing adapters (Bedrock, Claude, Codex) work through the new registry
- [ ] Document the adapter interface for contributors

**Key files:**
- `src-server/runtime/stallion-runtime.ts` -- hard-wired adapter selection
- `src-server/providers/adapters/` -- existing adapters
- `packages/contracts/src/provider.ts` -- adapter interface

**Done when:** A plugin can register a custom runtime adapter. Ollama adapter works for basic chat.

### 1c. Onboarding Flow

Make the first-run experience intuitive.

- [ ] First-run wizard that detects available providers and walks through setup
- [ ] Default agent that works immediately with any detected provider
- [ ] Quick-start guide accessible from the UI (not just README)
- [ ] `./stallion doctor` validates all prerequisites with clear fix instructions
- [ ] Prompt injection defense for context file loading (inspired by Hermes)

**Done when:** A user with only Ollama installed can go from `git clone` to chatting in under 5 minutes.

### 1d. Core Flow Hardening

Polish the existing functionality.

- [ ] Audit chat flow end-to-end for all 3 agent types (managed, connected, ACP)
- [ ] Fix any biome/tsc/test failures
- [ ] Review and fix UX friction in layout/navigation system
- [ ] Ensure conversation switching, agent switching, and project switching are reliable
- [ ] Verify `stallion-control` MCP tools work correctly

**Done when:** All CI gates pass. Manual smoke test of each agent type completes without errors.

**Phase 1 Definition of Done:** All four sub-tasks verified. New user onboarding tested by someone who hasn't used Stallion before.

---

## Phase 2: Plugin Ecosystem Bootstrap

**Goal:** It's trivially easy to create a plugin. A curated set exists. A registry is browsable.

**Status: Not Started**

### 2a. Frictionless Plugin Creation

- [ ] `stallion create-plugin` CLI command with options (layout-only, provider-only, full)
- [ ] Template includes working SDK imports, example hooks, manifest, build config
- [ ] `stallion dev` hot-reload experience works reliably
- [ ] "Build Your First Plugin" tutorial (in `docs/guides/`)
- [ ] Request-scoped plugin lifecycle hooks with correlation IDs (inspired by Hermes)

**Key files:**
- `packages/cli/src/cli.ts` -- new `create-plugin` command
- `packages/cli/src/dev/` -- dev server
- `docs/guides/plugins.md` -- existing plugin docs (extend)

**Done when:** `stallion create-plugin my-layout` produces a working layout. `stallion dev` shows it in browser with hot reload.

### 2b. Curated Starter Plugins

- [ ] "Getting Started" default layout -- works out of box, demos capabilities
- [ ] Coding layout -- file browser, terminal, diff view, code-focused chat
- [ ] Knowledge/docs layout -- upload documents, ask questions, manage knowledge
- [ ] Each plugin demonstrates SDK patterns others can copy

**Done when:** 3 quality plugins exist in `examples/` (or a separate plugins repo). Each has a README and works out of box.

### 2c. Plugin Registry

- [ ] Host a registry manifest (GitHub Pages or similar)
- [ ] Registry UI is browsable in the app
- [ ] One-click install from registry
- [ ] `stallion registry` CLI command works end-to-end
- [ ] Smart model routing available as a plugin (inspired by Hermes cheap-vs-strong pattern)

**Key files:**
- `src-server/providers/json-manifest-registry.ts` -- existing registry provider
- `src-ui/` -- registry UI views

**Done when:** A user can browse plugins in the UI and install one with a single click.

**Phase 2 Definition of Done:** Create-plugin workflow tested. 3+ plugins in registry. Install-from-registry works via UI and CLI.

---

## Phase 3: Elevate stallion-control

**Goal:** "Agents managing agents" becomes a visible, promoted, documented feature with deeper capabilities.

**Status: Not Started**

### 3a. Documentation & Demos

- [x] Feature prominently in README and architecture docs
- [x] Create demo: agent that sets up a project environment (creates sub-agents, installs tools, configures knowledge)
- [x] Tutorial: "Build a Self-Configuring Agent"

### 3b. Self-Improving Agents (inspired by Hermes)

- [x] Agent-created playbooks: agents can create/refine playbooks from successful task completions
- [x] Playbook quality tracking: measure which playbooks produce good outcomes
- [x] Subagent delegation: isolated child agents with restricted toolsets, max depth, blocked tools list

### 3c. Safety & Approval

- [x] Prompt injection scanning for all context file loading (AGENTS.md, plugin manifests, project files)
- [x] Inbox-style notification aggregation for multi-agent approval requests (inspired by Happier)
- [x] Optional guardian sub-agent for tool call review (inspired by Codex Smart Approvals)

### 3d. Richer AI -> UI Interaction

- [x] Notification rendering from agent tool calls
- [x] Progress indicators for long-running agent tasks
- [x] Foundation for structured UI blocks (Phase 5 prerequisite)

**Phase 3 Definition of Done:** Demo video of agent self-configuring a project. Prompt injection defense active. Subagent delegation works with isolation rules.

---

## Phase 4: Configuration Portability

**Goal:** "Define once, use everywhere." Stallion configs are portable to and from other tools.

**Status: Not Started**

- [ ] `stallion export --format=agents-md` -- produces valid AGENTS.md
- [ ] `stallion export --format=claude-desktop` -- produces `claude_desktop_config.json` for MCP servers
- [ ] `stallion import <file>` -- reads configs from AGENTS.md, claude_desktop_config.json
- [ ] Shared MCP server definitions across all providers (inspired by Happier)
- [ ] REST API formalized with OpenAPI spec (inspired by Codex app-server protocol)

**Phase 4 Definition of Done:** Round-trip test: export Stallion config, import into Claude Desktop, verify MCP servers work. OpenAPI spec published.

---

## Phase 5: AI <-> UI Bridge Evolution

**Goal:** Move from message-level AI-UI integration to deep bidirectional interaction.

**Status: Not Started**

See [vision/ai-ui-bridge.md](vision/ai-ui-bridge.md) for the full vision.

- [ ] Define `UIBlock` type system (card, table, form, chart, code, image)
- [ ] Implement chat renderer for UI blocks from agent tool calls
- [ ] `render_component` MCP tool -- agents mount plugin components dynamically
- [ ] SDK hooks for capturing UI state as context (selected file, visible diff, terminal output)
- [ ] Agent-composable layouts -- AI can open/arrange panels via tool calls
- [ ] Cross-session memory via KnowledgeService namespaces (inspired by Hermes memory providers)

**Phase 5 Definition of Done:** An agent tool call renders a table inline in chat. A layout captures file selection as automatic AI context.

---

## Backlog

Ideas tracked but not scheduled. Promote to a phase when strategically relevant.

| Idea | Source | Notes |
|------|--------|-------|
| Event sourcing for sessions | T3Code | SQLite event store for replay, audit, reconnection |
| Session sharing | Pi-mono | Export conversations as shareable artifacts |
| Credential pool failover | Hermes | Auto-failover on 402, rotation |
| Gateway pattern | Hermes | One definition drives all surfaces (CLI, UI, messaging) |
| RL training integration | Hermes | Generate training trajectories from agent interactions |
| Cross-device session handoff | Happier | Continue sessions on another machine via connect package |
| E2E encryption | Happier | Encrypt agent sessions end-to-end |
| Mobile app | -- | `@stallion-ai/connect` has QR pairing foundation |
| Headless mode | -- | Server-only mode accepting API/CLI input |
| Team features | -- | Shared configs, conversation handoff, RBAC |
| Docker / Helm deployment | -- | Enterprise packaging |
