# Differentiators

> What makes Stallion AI different from every other AI agent tool. Organized by investment tier with honest current-state assessments. Updated as capabilities evolve.

*Last updated: 2026-04-11*

---

## Tier 1: Core Differentiators (Invest Heavily)

These are the capabilities that no competitor replicates. They define Stallion's identity and justify its existence as a separate project.

### 1. Plugin-Powered Vertical Surfaces

**What it means:** Every layout is a purpose-built AI workspace. The SDK (`@stallion-ai/sdk`) gives plugin layouts first-class access to chat, knowledge, tools, agents, and project context. A "coding layout" is just one possible vertical. A "support layout," "research layout," or "CRM layout" are equally possible -- all sharing the same AI backbone.

**What exists today:**
- SDK exports 30+ hooks and APIs: `useAgents`, `useSendToChat`, `callTool`, `searchKnowledge`, `useProjectsQuery`, `useLayoutsQuery`, `useConfig`, etc.
- `contextRegistry` lets plugins prepend ambient context to messages
- `voiceRegistry` lets plugins register S2S providers
- Plugin manifest supports layouts, agents, providers, integrations, tools, knowledge namespaces, prompts, skills, settings
- 8 example plugins demonstrating the pattern (demo-layout, enterprise-layout, minimal-layout, shared-providers, etc.)
- Plugin build system handles externalization, hot-reload via `stallion plugin dev`

**What's aspirational:**
- A thriving ecosystem of community-created layouts
- One-click install from a browsable registry
- `stallion plugin create` scaffolding that gets a new layout running in under 5 minutes

**What competitors do:**
- Cursor/Windsurf: Fixed UI, no plugin layouts
- VS Code + Copilot: Extension system exists but AI integration is limited to chat panel and inline suggestions
- Cline: Plugin system exists but focused on tools, not full layouts
- Pi-mono: Stateful TypeScript extensions, web UI components -- closest conceptual match
- Hermes: Skills system but no layout concept

### 2. Self-Configuring Platform (stallion-control)

**What it means:** The platform itself is exposed as tools that agents can call. An agent can create other agents, install MCP integrations, schedule recurring jobs, navigate the UI, and modify configuration. This enables "agents that manage agents" -- a genuinely new paradigm where the AI doesn't just live in the platform, it shapes the platform.

**What exists today:**
- `stallion-control` MCP server with tools for: agent CRUD, integration management, skill management, prompt/playbook management, project management, config read/update, scheduler job management, navigation, message sending to other agents
- Any managed agent can have `stallion-control` in its MCP server list
- Agents can programmatically set up entire project environments

**What's aspirational:**
- Self-improving agents that create and refine their own playbooks from experience (inspired by Hermes Agent's skill loop)
- Subagent delegation with isolation rules and depth limits
- Guardian sub-agents that review tool calls before execution (inspired by Codex Smart Approvals)
- `render_ui_block` tool for agents to produce structured UI in chat
- `capture_context` tool for agents to request UI state snapshots

**What competitors do:**
- No competitor exposes platform management as agent tools
- Codex: Skills are agent-authored scripts, not platform control
- Hermes: Self-improving skills create files, but don't reconfigure the platform
- Pi-mono: Extensions are runtime plugins, not self-management tools

### 3. Any Runtime, One UI

**What it means:** Managed agents (Bedrock/VoltAgent/Strands), connected agents (Claude API, Codex API), and ACP agents (any external CLI runtime) all run through a single orchestration layer. Events are normalized via `CanonicalRuntimeEvent`. Users see one consistent interface regardless of which runtime powers a given agent.

**What exists today:**
- Three adapter types: `bedrock-adapter`, `claude-adapter`, `codex-adapter`
- ACP manager with probe, bridge, lifecycle management for external CLIs
- `CanonicalRuntimeEvent` contract normalizes events across all runtimes
- `OrchestrationService` manages sessions across providers
- `ConnectionService` manages model + runtime connections
- Per-agent `AgentExecutionConfig` for runtime selection

**What's aspirational:**
- Plugin-registerable runtime adapters (currently hard-coded in `stallion-runtime.ts`)
- `ProviderKind` as extensible string (currently closed union: `'bedrock' | 'claude' | 'codex'`)
- Ollama as a first-class adapter alongside the existing three
- Automatic provider failover (inspired by Hermes credential pool)

**What competitors do:**
- Happier: Monitors multiple agents but doesn't unify sessions
- T3Code: Codex-first, Claude support coming, no unified abstraction
- Pi-mono: 15+ LLM providers behind one API (best provider breadth, but inference only -- no orchestration)
- Hermes: Model-agnostic with smart routing, but single-agent architecture

---

## Tier 2: Strategic Advantages (Maintain and Grow)

These are strong architectural decisions that differentiate Stallion in specific markets. They don't need heavy investment now but should be maintained and extended.

### 4. White-Label Agent Shell

**What it means:** The provider registry supports pluggable auth, branding, user identity, user directory, settings, and all registries (agent, integration, skill, plugin). An organization installs a single plugin that replaces these providers, effectively white-labeling the entire platform.

**What exists today:**
- 16+ provider types with singleton and additive cardinality
- `IAuthProvider`, `IBrandingProvider`, `IUserIdentityProvider`, `IUserDirectoryProvider`, `ISettingsProvider` -- all pluggable
- `enterprise-layout` example demonstrating SSO + LDAP integration
- Plugin permissions system (passive, active, trusted tiers)

**What's aspirational:**
- Docker image / Helm chart for enterprise deployment
- Team features: shared agent configs, conversation handoff, role-based access
- Audit trail and compliance reporting

### 5. Configuration Portability

**What it means:** "Define once, use everywhere." Stallion config can generate configs for other tools, and import configs from other tools.

**What exists today:**
- Agent configs are JSON files in `~/.stallion-ai/agents/`
- MCP server configs are JSON in `~/.stallion-ai/integrations/`
- ACP connections are JSON in `~/.stallion-ai/config/acp.json`

**What's aspirational:**
- `stallion export --format=agents-md` produces valid AGENTS.md (Codex convention)
- `stallion export --format=claude-desktop` produces `claude_desktop_config.json`
- `stallion import` reads configs from other tools
- Shared MCP server definitions across all providers (inspired by Happier's "define once" pattern)

---

## Tier 3: Long-Term Vision (Build Incrementally)

### 6. Deep AI <-> UI Bridge

**What it means:** Fully bidirectional interaction where AI renders structured UI blocks in chat, the UI automatically captures rich context for the AI, and layouts are AI-composable. The platform becomes a tool the AI uses, not just a container.

**Current state:** The bridge today is the SDK layer. Plugins use SDK hooks to build UIs with AI primitives. `stallion-control` lets AI navigate and configure. `contextRegistry` enables ambient context injection. This is real and works, but it's message-level integration, not deep UI-level integration.

**See:** [vision/ai-ui-bridge.md](vision/ai-ui-bridge.md) for the full vision document.

---

## Table Stakes (Not Differentiating)

These are important but not unique. Every serious competitor has them.

| Capability | Status | Notes |
|-----------|--------|-------|
| Local-first data | Done | `~/.stallion-ai/`, no cloud required |
| Chat interface | Done | Multi-session, tabs, voice, slash commands |
| MCP tool integration | Done | MCPManager with lifecycle management |
| Desktop app | Exists | Tauri wrapper, needs polish |
| Conversation history | Done | Per-project, file-based |
| Knowledge/RAG | Done | LanceDB, per-project namespaces |
| Scheduling | Done | Cron-based via BuiltinScheduler |
| Observability | Done | OTel, 46+ metric instruments |
| Voice | Done | S2S via WebSocket, pluggable providers |
