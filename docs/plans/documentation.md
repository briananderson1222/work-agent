# Documentation Execution Plan

Optimized for parallel execution via 4 concurrent tool-dev subagents.
Each wave completes before the next starts. Each agent gets a self-contained task.

## Wave 1 — Independent Docs (no cross-dependencies)

Each agent reads specific code areas and writes docs. No agent needs output from another.

### Agent 1: CLI + Config Reference
**Output:** `docs/reference/cli.md`, `docs/reference/config.md`

**cli.md** — Read `packages/cli/src/cli.ts`. Document every command and flag:
- start (--port, --ui-port, --clean, --force), stop, upgrade, doctor, link, shortcut
- install, preview, list, remove, info, update, registry
- init, build, dev (--no-mcp, --tools-dir, port)
- Include examples for common workflows

**config.md** — Read these files and document every field with types and defaults:
- `packages/shared/src/index.ts` (AppConfig, AgentSpec, PluginManifest, WorkspaceConfig types)
- `schemas/app.schema.json`
- `~/.stallion-ai/config/app.json` (app config)
- `~/.stallion-ai/agents/*/agent.json` (agent config)
- `~/.stallion-ai/plugins/*/plugin.json` (plugin manifest)
- Include JSON examples with comments

### Agent 2: Package References (connect + shared)
**Output:** `docs/reference/connect.md`, `docs/reference/shared.md`

**connect.md** — Read `packages/connect/src/` entirely. Document:
- ConnectionStore API
- Storage adapters (LocalStorageAdapter)
- React hooks: useConnections, useConnectionStatus, useHostUrl, useNetworkDiscovery
- React components: ConnectionManagerModal, QRDisplay, QRScanner, ConnectionStatusDot
- All TypeScript types
- Usage examples for each hook/component

**shared.md** — Read `packages/shared/src/index.ts` and `packages/shared/src/mcp.ts`. Document:
- All exported types (PluginManifest, AgentSpec, AppConfig, WorkspaceConfig, ToolDef, etc.)
- Utility functions (readPluginManifest, resolvePluginTools, buildPlugin, resolveGitInfo, etc.)
- MCP helpers (connectMCP, callTool, MCPManager)
- Usage examples

### Agent 3: Monitoring + Theming Guides
**Output:** `docs/guides/monitoring.md`, `docs/guides/theming.md`

**monitoring.md** — Read these files:
- `src-server/telemetry.ts` (SDK bootstrap)
- `src-server/telemetry/metrics.ts` (all instruments)
- `monitoring/docker-compose.yml` (stack config)
- `monitoring/runtime/` (collector, prometheus, grafana configs)
- `monitoring/grafana/dashboards/stallion.json` (dashboard panels)
- `docs/patterns/backend.md` (Telemetry section for reference)

Document: setup instructions, all 11 metrics with descriptions, dashboard panels, Jaeger traces, cost tracking, adding new metrics pattern.

**theming.md** — Read:
- `src-ui/src/index.css` (CSS variables)
- `src-server/routes/branding.ts`
- Any theme/branding related components in src-ui

Document: CSS variable reference, branding API, custom themes, dark/light mode.

### Agent 4: API Reference Gap Fill
**Output:** Updated `docs/reference/api.md`

Read ALL 18 route files in `src-server/routes/`:
```
agents.ts, analytics.ts, auth.ts, bedrock.ts, branding.ts, config.ts,
conversations.ts, events.ts, fs.ts, insights.ts, models.ts, monitoring.ts,
plugins.ts, registry.ts, scheduler.ts, system.ts, tools.ts, workspaces.ts
```

For each route file:
- List every endpoint (method, path, description)
- Document request/response shapes
- Note auth requirements
- Group by domain

Preserve existing content in api.md, add missing endpoints.

---

## Wave 2 — System-Level Docs (need broad codebase understanding)

### Agent 1: Architecture Overview
**Output:** `docs/architecture.md`

Read and synthesize:
- `src-server/runtime/stallion-runtime.ts` (main runtime, route mounting, agent lifecycle)
- `src-server/services/acp-bridge.ts` (ACP protocol)
- `src-server/runtime/stream-orchestrator.ts` (streaming pipeline)
- `src-server/runtime/mcp-manager.ts` (MCP lifecycle)
- `packages/sdk/src/index.ts` (SDK surface)
- `packages/connect/src/index.ts` (connect surface)
- Plugin loading in `src-server/routes/plugins.ts`
- `docker-compose.yml` and `monitoring/docker-compose.yml`

Produce:
- System diagram (Mermaid): Core → Plugins → SDK → UI
- Component boundaries: what's core vs plugin vs SDK
- Data flow: user message → agent → tools → response
- Plugin lifecycle: install → load → render → uninstall
- Agent lifecycle: define → load → MCP connect → chat → monitor
- ACP flow: external runtime → bridge → agent modes
- Extension points: where plugins hook in

### Agent 2: SDK Reference
**Output:** `docs/reference/sdk.md`

Read `packages/sdk/src/` entirely — every file. Document:
- **Hooks:** useAgents, useChat, useConversations, useAuth, useConfig, useWorkspace, useMonitoring, etc.
  - Signature, params, return type, example
- **Components:** AutoSelectModal, Button, FullScreenLoader, LoadingState, Pill, Spinner
  - Props, usage example
- **Context providers:** what the SDK wraps, how plugins access them
- **Agent resolver:** how agents are discovered and selected
- **Events system:** event types, subscription pattern
- **Voice:** voiceRegistry, voice provider interface
- **Context capabilities:** MessageContextProvider, contextRegistry
- **Types:** every exported type with field descriptions

### Agent 3: ACP Guide
**Output:** `docs/guides/acp.md`

Read `src-server/services/acp-bridge.ts` (51KB) thoroughly. Also read:
- `~/.stallion-ai/config/acp.json` for connection config
- Any ACP-related types in shared or SDK

Document:
- What ACP is and why it exists
- Architecture: Stallion ↔ ACP Bridge ↔ External Runtime (kiro-cli)
- Session management: creation, modes, switching
- Agent modes: how external agents map to Stallion agents
- Slash commands: how they flow through ACP
- Tool execution: how tools are proxied
- Connection setup: configuring acp.json
- Troubleshooting common issues

### Agent 4: Backend + Frontend Pattern Gap Fills
**Output:** Updated `docs/patterns/backend.md`, `docs/patterns/frontend.md`

**backend.md** — Read and add documentation for undocumented services:
- `src-server/services/acp-bridge.ts` — ACP bridge architecture (brief, links to guides/acp.md)
- `src-server/services/approval-registry.ts` — tool approval flow
- `src-server/services/event-bus.ts` — internal event system
- `src-server/services/plugin-permissions.ts` — plugin permission model
- `src-server/services/builtin-scheduler.ts` — cron scheduler
- `src-server/services/scheduler-service.ts` — scheduler HTTP layer
- Update architecture diagram to show all 18 route files

**frontend.md** — Add sections for:
- `packages/connect` — when and how to use connection management
- `packages/shared` — when to import from shared vs SDK

---

## Wave 3 — Dependent Docs (need Wave 2 outputs)

### Agent 1: Getting Started
**Output:** `docs/getting-started.md`

Write a complete onboarding guide:
1. Prerequisites (Node 20+, AWS credentials, Docker for monitoring)
2. Install and first run (`./stallion start`)
3. Configure your first agent (edit agent.json)
4. Install a plugin (`./stallion install`)
5. Build your first plugin (`./stallion init my-plugin`)
6. Add MCP tools to an agent
7. Connect an external runtime via ACP
8. Enable monitoring

Read `docs/architecture.md` (from Wave 2) for system context.
Read `docs/reference/cli.md` (from Wave 1) for CLI commands.
Keep it practical — every step has a command to run and a result to verify.

### Agent 2: Plugin Guide Expansion
**Output:** Updated `docs/guides/plugins.md`

Expand the existing plugin guide with:
- SDK integration: which hooks to use, how to access agents/chat/config
- Workspace components: lifecycle, props, registration
- Provider interfaces: auth, user identity, user directory
- Plugin-to-plugin dependencies
- MCP tool access from plugin UI (callTool pattern)
- Testing plugins (`./stallion dev`)
- Publishing to registry

Read `docs/reference/sdk.md` (from Wave 2) for hook/component details.

### Agent 3: API Summary + Endpoints Sync
**Output:** Updated `docs/reference/api-summary.md`, `docs/reference/endpoints.md`

**api-summary.md** — Regenerate from the updated `docs/reference/api.md` (Wave 1):
- Update endpoint count
- Update category breakdown
- Ensure frontend context mapping is accurate

**endpoints.md** — Audit against actual frontend code:
- `grep -r` for fetch/API calls in `src-ui/src/`
- Mark each endpoint as in-use or not-in-use
- Fix the VoltAgent endpoint contradiction
- Add coverage for plugin, scheduler, auth, system endpoints

### Agent 4: Contributing Guide
**Output:** `docs/contributing.md`

Read the codebase structure and write:
- Dev environment setup (prerequisites, install, dev servers)
- Project structure overview (link to architecture.md)
- Code style (biome config, TypeScript conventions)
- Testing (vitest for unit, Playwright for integration)
- PR process and review guidelines
- Where to add new features (routes, services, SDK hooks)
- Documentation standards (link to this plan)

---

## Wave 4 — Polish (single pass)

- Add `docs/README.md` index page with categorized links to all docs
- Cross-link: every doc links to related docs where relevant
- Update root `README.md` Documentation section with final file list
- Verify all code examples against current codebase
- Add Mermaid diagrams to architecture.md and acp.md
- Final grep for stale references (voltagent, aws-internal, etc.)
