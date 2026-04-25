# Competitive Landscape

> Snapshot of the AI agent tool ecosystem. Includes direct competitors, inspiration repos, industry gaps, and a "steal list" of features worth adopting. Refresh quarterly.

*Last updated: 2026-04-25*

---

## Inspiration Repos

These are the open-source projects we actively track for ideas, patterns, and competitive signals.

### openai/codex (74K stars)

**What it is:** OpenAI's terminal coding agent, rewritten from TypeScript to Rust. Sandboxed execution via Apple Seatbelt / Linux Landlock.

**Key architectural decisions:**
- `app-server` JSON-RPC protocol -- a headless agent protocol that third-party GUIs (T3Code, Codex-Monitor) build on top of
- Smart Approvals -- a guardian sub-agent that reviews tool calls before execution
- Skills system -- agent-authored scripts for recurring tasks
- AGENTS.md as an industry convention for project-level agent instructions
- 70+ Rust crates, massively decomposed

**What to watch:** `codex-rs/core/`, skills/, AGENTS.md convention adoption

**Stallion parallel:** Runtime adapters (Codex is already a connected agent), playbooks, agent config export

**Check frequency:** Monthly

---

### nousresearch/hermes-agent (58K stars)

**What it is:** Self-improving AI agent with a closed learning loop. Agents create skills from experience, improve them during use, and build deepening user models across sessions.

**Key architectural decisions:**
- Self-improving skill loop: agents autonomously create skills after complex tasks, structured as directories with `SKILL.md` + supporting files
- Pluggable context engine: abstract `ContextEngine` base class, config-driven selection (`context.engine: "compressor"` or `"lcm"`)
- Memory provider architecture: built-in + at most one external plugin (Honcho, mem0, Supermemory, RetainDB, etc.). Memory context fenced in XML tags to prevent confusion with user input.
- Subagent delegation: isolated child agents with fresh contexts, restricted toolsets, max depth of 2, blocked tools list (no recursive delegation, no user interaction, no memory writes from children)
- 6 terminal backends: local, Docker, SSH, Modal (serverless), Daytona (serverless), Singularity
- 17+ messaging platform gateway: Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Email, Home Assistant, WeChat, DingTalk, etc.
- Smart model routing: cheap-vs-strong based on message complexity analysis
- RL training integration via Atropos framework -- generates training trajectories from real agent interactions
- Prompt injection defense: scans context files for injection patterns, invisible unicode, hidden HTML
- ACP adapter for IDE integration
- Credential pool with automatic failover on 402

**What to watch:** `tools/`, `agent/memory_manager`, `skills/`, `environments/`

**Stallion parallel:** stallion-control (self-configuration), knowledge service (memory), playbooks (skills), eval harness

**Check frequency:** Monthly

---

### badlogic/pi-mono (34K stars)

**What it is:** Mario Zechner's (libGDX creator) AI agent toolkit. Radically minimal core (only 4 tools: read, write, edit, bash) with maximum extensibility.

**Key architectural decisions:**
- Unified LLM API (`pi-ai`) supporting 15+ providers behind one interface -- the most comprehensive multi-provider abstraction available
- Stateful TypeScript extensions (not CLIs) with types and debugging
- Hooks have UI helpers (selects, confirms, notifications)
- vLLM pod management for self-hosted deployment
- Session sharing to HuggingFace -- novel community-building approach

**What to watch:** `pi-ai/`, `extensions/`, `pi-web/`

**Stallion parallel:** llm-router (needs registry pattern like pi-ai), plugins (extensions), layouts (web UI)

**Check frequency:** Quarterly

---

### pingdotgg/t3code (8.7K stars)

**What it is:** Minimal web GUI for coding agents. Codex-first, Claude support coming. 2 months old, fast-growing via T3 Stack brand.

**Key architectural decisions:**
- Event sourcing with SQLite for conversation state management -- commands through WebSocket, emit events, project into read model
- React 19 / TanStack Router / Zustand frontend
- Electron desktop wrapper
- `packages/contracts` -- schema-only, no runtime (clean separation)

**What to watch:** `packages/core/`, `packages/contracts/`

**Stallion parallel:** SDK + contracts packages, event model

**Check frequency:** Quarterly

---

### happier-dev/happier (630 stars)

**What it is:** E2E encrypted companion app for 10+ coding agents. Cross-device session continuity.

**Key architectural decisions:**
- E2E encryption for all agent sessions
- Session handoff between machines
- Session forking -- branch a conversation
- Inbox for permission requests aggregated across all agents
- Voice assistant that monitors all sessions
- MCP server management: "define once, use everywhere" across all providers
- Profiles for multi-environment support

**What to watch:** `src/core/`, messaging platform adapters

**Stallion parallel:** `@stallion-ai/connect` package (QR pairing, multi-host), notification system

**Check frequency:** Quarterly

---

### multica-ai/multica

**What it is:** GitHub-connected agent workbench with daemon-executed tasks, issue assignment, direct chat, autopilots, and per-task workspaces.

**Key architectural decisions:**
- Durable task lifecycle with queued, dispatched, running, completed, failed, and cancelled states
- Daemon-side runtime execution with concurrency limits, heartbeats, cancellation polling, and orphan recovery
- Retry taxonomy separating runtime/offline/timeout failures from agent errors
- Codex app-server integration filters notifications by tracked thread ID so subagent or sibling-thread output does not leak into the main task
- Bare-clone cache plus per-task git worktrees for isolated repo checkout

**What to watch:** daemon task leasing/recovery, Codex app-server handling, repo cache/worktree safety

**Stallion parallel:** orchestration event store, connected runtime adapters, Ralph/team execution, hermetic temp-home runs

**Stallion stance:** Borrow the operational mechanics, not the hosted issue-board control plane. Keep run status as a read model over orchestration events and keep worktree isolation opt-in for autonomous workflows.

**Check frequency:** Quarterly

---

## Broader Landscape

| Tool | Category | Key Strength | Threat Level |
|------|----------|-------------|-------------|
| **Cursor** | AI IDE | Polished UX, tab completion, large user base | Low (different category) |
| **Windsurf** | AI IDE | Cascade flows, multi-step agent | Low (different category) |
| **GitHub Copilot** | IDE extension | Distribution (every VS Code user), agent mode | Medium (platform reach) |
| **Google Antigravity** | Agent-first IDE | Google's backing, Gemini integration | Medium (resources) |
| **Kiro** | AWS agent IDE | AWS integration, spec-driven development | Low (narrow audience) |
| **Augment Code** | Enterprise AI | Team features, codebase understanding | Medium (enterprise overlap) |
| **OpenCode** (117K stars) | Terminal agent | Massive adoption, TUI, multi-provider | Low (CLI only) |
| **Cline** (58.7K stars) | VS Code extension | Large community, plugin system, MCP | Medium (extensibility overlap) |
| **Aider** (41.6K stars) | Terminal agent | Git integration, pair programming model | Low (CLI only) |

---

## Industry Gaps (Opportunities)

These are problems that no tool has solved well. Each represents a potential Stallion differentiator.

1. **Cross-session memory** -- The single biggest unsolved problem. Every tool forgets between sessions. Stallion's KnowledgeService + LanceDB is the foundation for a persistent memory layer. Hermes's memory provider architecture (built-in + one plugin) is a good pattern to study.

2. **AI code quality trust** -- AI-generated code has 1.7x more issues than human code; only 29% of developers trust AI output. An evaluation harness (inspired by Hermes's RL training integration) that measures and improves agent output quality would be differentiating.

3. **Enterprise/on-prem deployment** -- Compliance-sensitive organizations need code to stay on their infrastructure. Stallion's local-first architecture + white-label providers make this achievable. Missing: Docker image, Helm chart, audit trail.

4. **Cross-device continuity** -- Only Happier seriously attempts this. Stallion's `@stallion-ai/connect` package with QR pairing is the foundation but needs session transfer.

5. **Collaborative team workflows** -- Multi-developer AI sessions are mostly unsolved. Stallion's user directory provider and project scoping could enable shared workspaces.

6. **Self-hosted model support** -- Only Pi-mono (vLLM) and Hermes (6 terminal backends including Modal/Daytona) seriously address this. Stallion should make Ollama a first-class adapter.

7. **Cost predictability** -- Heavy API usage runs $100-200/month with no ceiling. Smart model routing (inspired by Hermes) and usage analytics (Stallion already has OTel) could help.

---

## Steal List

Concrete features worth adopting or adapting, with source attribution and priority.

| Feature | Source | What to Steal | Priority | Stallion Phase |
|---------|--------|--------------|----------|---------------|
| Self-improving skills | Hermes | Agents create/refine playbooks from experience | High | Phase 3 |
| Subagent delegation rules | Hermes | Isolation: max depth 2, blocked tools list, fresh context | High | Phase 3 |
| Prompt injection defense | Hermes | Scan context files for injection patterns before inclusion | High | Phase 1 |
| Smart model routing | Hermes | Cheap-vs-strong based on message complexity | Medium | Phase 2 |
| Memory context fencing | Hermes | XML tags around recalled memory to prevent confusion | Medium | Phase 3 |
| App-server protocol | Codex | Formalize REST API + SSE as a protocol others build on (OpenAPI) | Medium | Phase 4 |
| Smart Approvals | Codex | Guardian sub-agent reviewing tool calls | Medium | Phase 3 |
| AGENTS.md export | Codex | Export agent config as AGENTS.md | Medium | Phase 4 |
| Event sourcing | T3Code | SQLite event store for session replay, audit, reconnection | Low | Backlog |
| Inbox pattern | Happier | Aggregate permission requests across all agents | Medium | Phase 3 |
| "Define MCP once" | Happier | MCP server configs shared across all providers | Medium | Phase 4 |
| Session sharing | Pi-mono | Export conversations as shareable artifacts | Low | Backlog |
| Unified LLM API registry | Pi-mono | Replace llm-router switch with registry pattern | High | Phase 1 |
| Credential pool failover | Hermes | Auto-failover on 402, credential rotation | Low | Backlog |
| Request-scoped plugin hooks | Hermes | Correlation IDs and lifecycle events for plugins | Medium | Phase 2 |
| Gateway pattern | Hermes | One command definition drives all surfaces (CLI, UI, messaging) | Low | Backlog |
| Agent run ledger | Multica | Durable run projection with lifecycle, failure kind, retry eligibility | High | Phase 1 |
| Codex foreign-thread filtering | Multica | Ignore Codex notifications from untracked subagent/sibling thread IDs | High | Phase 1 |
| Opt-in worktree isolation | Multica | Isolated autonomous run workspace with unique instance, temp home, ports, and cleanup | Medium | Phase 3 |

---

## Watching Pattern

For each repo, check these signals on the defined frequency:

- **New releases**: What shipped since last check?
- **Architecture changes**: Did they restructure? New abstractions?
- **Community growth**: Stars trajectory, new contributors, ecosystem plugins
- **Overlap**: Did they build something in our roadmap? If so, accelerate or adapt.
- **Divergence**: Did they take a direction we explicitly avoid? Validate our choice.

Use the `/competitive-scan` skill to automate these checks.
