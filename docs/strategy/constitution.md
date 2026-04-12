# Project Constitution

> This document defines what Stallion AI is, what it believes, and what it will not compromise on. It is the identity layer that persists even as features, priorities, and competitors change. Changes to this document require human approval.

*Last updated: 2026-04-11*

---

## Mission

**Stallion is the open platform where AI agents build, configure, and control their own workspace.**

It is not a chat wrapper. It is not an IDE. It is a foundation that any person, team, or organization can shape -- through plugins, layouts, and configuration -- into the AI-powered workspace they need.

---

## Core Beliefs

### 1. Plugins are the product, core is the foundation

The core server provides runtime, streaming, routing, and a provider registry. It has zero domain-specific logic. All user-facing functionality -- auth, branding, agent catalogs, layouts, integrations -- comes from plugins. This means:

- The core can be upgraded without touching plugins
- Plugins can be swapped without touching the core
- Organizations package Stallion with their own plugin set
- The same core serves a solo developer, a startup team, and an enterprise

### 2. Any runtime, one experience

Stallion is not locked to any model provider or agent framework. Managed agents (Bedrock/VoltAgent/Strands), connected agents (Claude, Codex via native SDKs), ACP agents (any external CLI), and plugin-registered adapters all run through one orchestration layer with a unified event model. Users pick their runtime; the experience is consistent.

### 3. AI and UI are peers

The AI is not just a backend that the UI displays. The UI is not just a frontend that sends messages. Both are active participants:

- **Today**: The SDK gives plugin layouts first-class access to the same primitives the AI uses -- chat, knowledge, tools, agents, project context. Plugins build UIs that seed context to the AI. The `stallion-control` MCP server lets agents manage the platform itself (create agents, install tools, schedule jobs, navigate the UI).
- **Vision**: AI renders structured UI blocks in chat. UI automatically captures rich context (file state, diffs, terminal output) for the AI. Layouts are AI-composable. The platform is a tool the AI uses, not just a container it lives in.

### 4. Local-first, user owns their data

All runtime data lives in `~/.stallion-ai/`. No cloud account required. No telemetry without consent. Users can version-control their entire configuration. The platform runs on the user's machine, connects to the models they choose, and stores nothing externally.

### 5. CLI and UI are equal citizens

Every capability is accessible through the CLI, the REST API, and the UI. The CLI is not a second-class citizen that wraps the UI, and the UI is not a convenience layer over the CLI. Both are full-featured entry points to the same platform. Users who prefer terminals get the same power as users who prefer GUIs.

### 6. Extensibility through standards, not opinions

Where standards exist (MCP for tools, ACP for agent communication, OpenTelemetry for observability), Stallion adopts them. Where standards are emerging (AGENTS.md, agentskills.io), Stallion tracks and contributes. Where Stallion must make choices, it uses abstractions that can be replaced. The goal is compatibility: users should be able to bring configs from other tools and export Stallion configs to other tools.

---

## Non-Negotiables

These are constraints that must hold regardless of feature pressure, competitive dynamics, or time constraints.

1. **No hardcoded vendor dependencies in core paths.** The core runtime, SDK, and CLI must work without any specific cloud provider. Provider-specific logic lives in adapters and plugins, never in the hot path.

2. **Plugin authors get the same primitives as core.** The SDK is the contract. If core can do it, a plugin can do it. No hidden APIs, no privileged access that plugins can't reach.

3. **Every feature accessible via CLI, API, and UI.** If it's only in the UI, it's not done. If it's only in the CLI, it's not done. All three surfaces must be covered.

4. **Backward-compatible plugin SDK contract.** Breaking changes to `@stallion-ai/sdk` require a major version bump with a migration guide. Plugin authors must be able to trust the contract.

5. **CI gates are non-negotiable.** Every change passes: `npx biome check`, `npx tsc --noEmit`, `npm test`. No exceptions, no skipping, no "we'll fix it later."

6. **Security at boundaries.** All user input validated. All external context (plugin manifests, project files, agent configs) scanned for injection. Secrets never in source. See `CLAUDE.md` and `docs/guides/code-quality.md`.

---

## What Stallion Is NOT

- **Not another chat wrapper.** A chat panel is one component. The value is the platform beneath it: plugin system, multi-runtime orchestration, self-configuring agents, knowledge management, scheduling, observability.

- **Not an IDE.** Stallion can host IDE-like layouts (file browser, terminal, diff view), but it is a platform, not a code editor. The coding layout is one plugin among many possible verticals.

- **Not locked to any model provider.** Bedrock, Claude, Codex, Ollama, OpenAI, local models -- all are supported through adapters. No provider gets privileged treatment in the core.

- **Not a closed ecosystem.** Plugins are MIT-licensed by convention. The registry is open. Configuration is portable. Users are never locked in.

---

## Target Users

Stallion serves three audiences with the same platform:

1. **Individual developers** -- Use the CLI or a coding layout to get AI-assisted development with their preferred model. Customize with plugins.

2. **Teams** -- Share agent configurations, knowledge bases, and layouts. Use project scoping to organize work. Deploy via Docker or desktop app.

3. **Organizations** -- White-label with a branding plugin. Integrate SSO via auth provider. Curate an internal agent/tool catalog via registry provider. Enforce compliance through plugin permissions.

The plugin system is what makes one platform serve all three. Individuals use defaults. Teams add shared plugins. Organizations replace providers entirely.
