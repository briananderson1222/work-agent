# Roadmap

> Phased execution plan for Stallion AI. Each phase has scoped tasks, key files, verification criteria, and a definition of done. Tasks within a phase can be parallelized unless marked as blocking. See [execution-pattern.md](execution-pattern.md) for how to pick up work.

*Last updated: 2026-04-12*
*Active phase: Phase 1 (Harden & Onboard)*
*Active initiative: [Entity Hierarchy & Navigation Restructure](../plans/plan-entity-hierarchy.md)*

---

## Reality Check (2026-04-12)

The roadmap had drifted out of sync with the repo: it previously named completed Phase 0 as active, marked multiple later phases in progress at once, and did not surface the current entity-hierarchy initiative.

Use these status labels consistently:

- **Complete** — implementation and phase proof are done
- **In Progress** — the current active execution phase
- **Verification Needed** — most implementation appears landed, but the phase definition of done still needs explicit proof or packaging
- **Queued** — not the active phase, even if some enabling pieces have already landed

We also distinguish three kinds of checklist reality inside a phase:

- **implemented** — clearly landed in code/docs/tests
- **needs verification** — likely landed, but still needs definition-of-done proof
- **open** — genuinely unfinished

---

## Phase 0: Foundation Documents

**Goal:** Establish the project's identity, strategy, and execution infrastructure so any human or AI can pick up work with full context.

**Status: Complete**

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

- [x] Change `ProviderKind` from a closed literal union to an extensible `string`
- [x] Make `AppConfig.region` optional
- [x] Replace Bedrock-first model-provider routing with registry/factory-based model connection creation
- [x] Auto-detect available providers on first run (for example Ollama or Bedrock credentials)
- [x] Update README prerequisites so AWS credentials are no longer required for first launch
- [ ] Remove remaining Bedrock-first defaults in runtime/UI execution paths

**Key files:**
- `packages/contracts/src/provider.ts` -- `ProviderKind` type
- `packages/contracts/src/config.ts` -- `AppConfig.region`
- `src-server/providers/connection-factories.ts` -- model-provider factory registration
- `src-server/services/llm-router.ts` -- registry/factory-based provider resolution
- `src-ui/src/utils/execution.ts` -- residual Bedrock-default fallback to remove
- `README.md`

**Done when:** `./stallion start` works without `AWS_ACCESS_KEY_ID` set. `./stallion doctor` shows detected providers.

### 1b. Pluggable Runtime Adapters

Allow plugins to register new `ProviderAdapterShape` implementations.

- [ ] Extract adapter registration from startup wiring into a plugin-extensible registration path
- [ ] Define adapter registration interface in a shared contract surface
- [ ] Ship Ollama runtime adapter implementing `ProviderAdapterShape`
- [ ] Verify existing adapters (Bedrock, Claude, Codex) work through the shared registry
- [ ] Document the adapter interface for contributors

**Key files:**
- `src-server/runtime/runtime-initialize.ts` -- current built-in adapter registration
- `src-server/providers/registry.ts` -- adapter registry facade
- `src-server/providers/adapters/` -- existing adapters
- `src-server/providers/adapter-shape.ts`

**Done when:** A plugin can register a custom runtime adapter. Ollama adapter works for basic chat.

### 1c. Onboarding Flow

Make the first-run experience intuitive.

- [x] First-run setup launcher detects available providers/runtimes and points users to the right configuration screen
- [x] Default agent path works with detected model connections instead of requiring Bedrock-first setup
- [ ] Quick-start guide accessible from the UI (not just README)
- [x] `./stallion doctor` validates prerequisites/readiness with clear fix instructions
- [x] Prompt injection defense for context file loading (inspired by Hermes)

**Done when:** A user with only Ollama installed can go from `git clone` to chatting in under 5 minutes.

### 1d. Core Flow Hardening

Polish the existing functionality.

**Active initiative:** [Entity Hierarchy & Navigation Restructure](../plans/plan-entity-hierarchy.md)

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

**Status: Queued**

> Foundations are partially landed here already (create-plugin, tutorial, registry browse flows), but this is not the active phase until Phase 1 proof/hardening is closed.

### 2a. Frictionless Plugin Creation

- [x] `stallion create-plugin` CLI command with options (layout-only, provider-only, full)
- [x] Template scaffolds include the core manifest/build/source structure for layout, provider, and full plugin paths
- [ ] `stallion dev` hot-reload experience works reliably
- [x] "Build Your First Plugin" tutorial (in `docs/guides/`)
- [x] Request-scoped plugin lifecycle hooks with correlation IDs (inspired by Hermes)

**Key files:**
- `packages/cli/src/cli.ts` -- `create-plugin` command
- `packages/cli/src/commands/init.ts` -- scaffold generation
- `packages/cli/src/dev/` -- dev server
- `docs/guides/build-your-first-plugin.md`

**Done when:** `stallion create-plugin my-layout` produces a working layout. `stallion dev` shows it in browser with hot reload.

### 2b. Curated Starter Plugins

- [ ] "Getting Started" default layout -- works out of box, demos capabilities
- [ ] Coding layout -- file browser, terminal, diff view, code-focused chat
- [ ] Knowledge/docs layout -- upload documents, ask questions, manage knowledge
- [ ] Each plugin demonstrates SDK patterns others can copy as a curated starter set

**Done when:** 3 quality plugins exist in `examples/` (or a separate plugins repo). Each has a README and works out of box.

### 2c. Plugin Registry

- [ ] Host a registry manifest (GitHub Pages or similar)
- [x] Registry UI is browsable in the app
- [ ] One-click install from registry via the UI
- [x] `stallion registry` CLI command works end-to-end
- [ ] Smart model routing available as a plugin (inspired by Hermes cheap-vs-strong pattern)

**Key files:**
- `src-server/providers/json-manifest-registry.ts` -- existing registry provider
- `src-ui/src/views/RegistryView.tsx`
- `examples/registry/manifest.json`

**Done when:** A user can browse plugins in the UI and install one with a single click.

**Phase 2 Definition of Done:** Create-plugin workflow tested. 3+ plugins in registry. Install-from-registry works via UI and CLI.

---

## Phase 3: Elevate stallion-control

**Goal:** "Agents managing agents" becomes a visible, promoted, documented feature with deeper capabilities.

**Status: Verification Needed**

> Core implementation appears landed across docs, examples, delegation safety, prompt scanning, approvals, notifications, and UI-block foundations. This phase should move to **Complete** after explicit definition-of-done proof is recorded.

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

**Status: Verification Needed**

> Export/import features, portability tests, and published OpenAPI artifacts appear landed. This phase should move to **Complete** after one explicit proof pass closes the phase definition of done.

- [x] `stallion export --format=agents-md` -- produces valid AGENTS.md
- [x] `stallion export --format=claude-desktop` -- produces `claude_desktop_config.json` for MCP servers
- [x] `stallion import <file>` -- reads configs from AGENTS.md, claude_desktop_config.json
- [x] Shared MCP server definitions across all providers (inspired by Happier)
- [x] REST API formalized with OpenAPI spec (inspired by Codex app-server protocol)

**Phase 4 Definition of Done:** Round-trip test: export Stallion config, import into Claude Desktop, verify MCP servers work. OpenAPI spec published.

---

## Phase 5: AI <-> UI Bridge Evolution

**Goal:** Move from message-level AI-UI integration to deep bidirectional interaction.

**Status: Queued**

> Initial foundations landed earlier than the full phase: Stallion already has an initial `UIBlock` contract and chat rendering for existing block types. The remaining work here is the primary net-new feature track after roadmap reconciliation and earlier-phase proof are complete.

See [vision/ai-ui-bridge.md](vision/ai-ui-bridge.md) for the full vision.

- [x] Define an initial `UIBlock` type system for card/table responses
- [x] Implement chat rendering for the existing UI-block tool-output path
- [ ] Expand `UIBlock` types to form, chart, code, and image
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
