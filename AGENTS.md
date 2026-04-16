# Agent Notes

## Strategy & Goals

Read `docs/strategy/` before starting feature work. Key documents:

- **[docs/strategy/constitution.md](docs/strategy/constitution.md)** — Project identity and non-negotiables
- **[docs/strategy/differentiators.md](docs/strategy/differentiators.md)** — What makes Stallion different (tiered assessment)
- **[docs/strategy/roadmap.md](docs/strategy/roadmap.md)** — Phased execution plan with tasks
- **[docs/strategy/execution-pattern.md](docs/strategy/execution-pattern.md)** — How to pick up and progress work
- **[docs/strategy/competitive-landscape.md](docs/strategy/competitive-landscape.md)** — Competitor analysis and steal list

### Available Workflows

These workflows are defined in `.claude/commands/` (Claude Code picks them up as slash commands). Any AI agent can read and follow the instructions in those files directly.

| Workflow | File | Purpose |
|----------|------|---------|
| Ideate | `.claude/commands/ideate.md` | Pull inspiration from competitor repos, suggest improvements |
| Competitive Scan | `.claude/commands/competitive-scan.md` | Scan landscape for new tools and features |
| Differentiation Check | `.claude/commands/differentiation-check.md` | Audit codebase against differentiators.md |
| Adoption Blockers | `.claude/commands/adoption-blockers.md` | Walk through first-run experience, find friction |

## Active Work

The **Entity Hierarchy & Navigation Restructure** is the current initiative.
See `docs/plans/plan-entity-hierarchy.md` for the full plan and
`docs/design/entity-hierarchy.md` for design decisions.

### Entity hierarchy

- **Managed agents** (Bedrock + Strands/VoltAgent): Stallion owns everything — prompt, skills, tools, commands, model.
- **Connected agents** (Claude, Codex): Native runtime owns behavior. Stallion owns abstraction (model, effort, thinking).
- **ACP agents**: External runtime connections. Predetermined capabilities.
- Agent editor tabs vary by type: managed gets Basic|Skills|Tools|Commands, connected gets Basic|Runtime, ACP gets Basic|Connection.
- Skills and integrations are managed-agent capabilities only.
- Projects scope which agents are available via `ProjectConfig.agents`.
- "Prompts" renamed to "Playbooks" (`/api/playbooks`, `usePlaybooksQuery`). Old `/api/prompts` kept as compat alias.
- Registry page (`/registry`) is the unified browse/install surface for agents, skills, integrations, plugins.
- Sidebar: Projects, Agents, Playbooks, Registry, Connections, Plugins, Schedule, Monitoring.

### Connected agents (merged from feature/connected-agents-hardening)

- `ConnectionService` manages model + runtime connections
- Provider adapters: Bedrock, Claude, Codex (in `src-server/providers/adapters/`)
- `AgentExecutionConfig` on `AgentSpec` for runtime selection
- Orchestration service for session lifecycle

## Task Completion Requirements

All of the following must pass before a task is considered complete:

1. `npx biome check src-server/ src-ui/ packages/` — no lint or format errors
2. `npx tsc --noEmit` — no type errors
3. `npm test` — all unit tests pass
4. If UI changes: manual smoke test or Playwright spec

Never skip these gates. If a gate fails, fix the issue before marking done.

## Stallion CLI

Always use `./stallion` to manage the app — never raw npm scripts, `node esbuild.config.mjs`, or `npx vite build` directly. The CLI handles build orchestration (server + UI) in the correct order.

```bash
./stallion --help
./stallion start --instance=agent-smoke --temp-home --clean --force --port=3242 --ui-port=5274
./stallion stop --instance=agent-smoke
```

Use `--temp-home` for routine agent smoke runs so cleanup stays out of your main `~/.stallion-ai` home. Deleting the default home now requires `--allow-default-home-clean` in addition to `--force`.

### Port rules

Default ports (3141 server, 3000 UI) are **reserved for user testing**. Agents must always use unique ports and a stable instance name:

```bash
./stallion start --instance=agent-smoke --temp-home --clean --force --port=3242 --ui-port=5274
```

Pick ports that won't collide with other agents running concurrently. Multiple Stallion instances may run from the same checkout at the same time as long as their reserved port ranges do not overlap.

Do **not** stop or disturb a sibling instance from the same checkout just to satisfy that shared-build guard. If another agent-owned instance is live, prefer one of these paths instead:
- start a new instance with a distinct instance name and non-overlapping ports
- use targeted per-instance cleanup/start-clean flows on that instance only
- reuse existing build artifacts for verification when that is enough

Stopping a sibling instance is only acceptable when the task is explicitly about that instance or the user specifically asks for it. The remaining truly shared-checkout lane is repo-wide mutation such as `stallion upgrade` (`git pull`, `npm install`, rebuilds), which still needs extra caution around sibling instances.

### Playwright tests

The `playwright.config.ts` reads `PW_BASE_URL` from the environment. Run tests against your unique UI port:

```bash
PW_BASE_URL=http://localhost:<ui-port> npx playwright test tests/<feature>.spec.ts
```

Tests live in `tests/` and follow these conventions:
- `import { test, expect } from '@playwright/test'`
- Role-based selectors (`getByRole`, `getByText`, `getByPlaceholder`) over CSS
- Seed state via `page.addInitScript` or `page.evaluate`
- Route API calls with `page.route` to isolate from backend state

### Code style

- Prefer CSS classes over inline styles. The project uses `.css` files alongside components.
- **Use `useQuery` / `useMutation` from `@tanstack/react-query` for all data fetching.** Never use raw `useState` + `useCallback(fetch)` + `useEffect` patterns. The SDK (`@stallion-ai/sdk`) exports domain-specific hooks (`useAgentsQuery`, `useProjectsQuery`, `useLayoutsQuery`, etc.) — prefer those over raw `useQuery` when available. For views, destructure `isLoading` and pass it to `SplitPaneLayout`'s `loading` prop. After mutations, call `queryClient.invalidateQueries()` instead of manual refetch functions.

### Navigation

Project layout navigation MUST go through `setLayout(projectSlug, layoutSlug)` from `useNavigation()` — never raw `navigate(`/projects/...`)`. `setLayout` persists `lastProject`/`lastProjectLayout` to localStorage so `/` can restore the user's last-viewed project on reload. Raw `navigate()` only pushes the URL without persisting, which breaks restore-on-reload.

- `setLayout(projectSlug, layoutSlug)` — project layout navigation (persists + navigates)
- `setStandaloneLayout(slug)` — standalone layout navigation
- `navigate(path)` — everything else (settings, agents, plugins, etc.)

The root route (`/`) auto-selects in this priority: (1) last-viewed project+layout from localStorage, (2) first project's first layout, (3) standalone layout fallback.

### Code quality & pushing

Before pushing, run the full local CI pipeline (typecheck, biome lint, build, tests) and ensure the core stays vendor-neutral. Route handlers use `getBody(c)` and `param(c, 'name')` from `schemas.ts` for type safety. See [docs/guides/code-quality.md](docs/guides/code-quality.md) for details. See [docs/guides/testing.md](docs/guides/testing.md) for test patterns, shared utilities, and the new-feature testing checklist.

For the full CLI command and flag reference, see [docs/reference/cli.md](docs/reference/cli.md).

### Unsaved changes guard

All editor views with dirty state MUST use the `useUnsavedGuard(dirty)` hook from `src-ui/src/hooks/useUnsavedGuard.tsx`. It provides:
- `guard(cb)` — shows a ConfirmModal if dirty, else runs the callback. Wrap any navigation handler (select, new, back).
- `<DiscardModal />` — render at the bottom of the view's JSX.
- Automatic `beforeunload` protection for browser close/reload.

Never use `window.confirm` for unsaved-changes prompts — always use this hook.

### Known issues

None currently tracked.

### Notification system

Provider pattern — plugins register `INotificationProvider` implementations that contribute notifications via `poll()`. `NotificationService` aggregates providers, manages lifecycle, persists to `~/.stallion-ai/notifications.json`. Events flow through EventBus (`notification:delivered`) → SSE route → browser ToastStore. SDK: `useNotifications()` hook and `NotificationsAPI` class. Shared primitives: `cron.ts`, `json-store.ts`, `sse-broadcaster.ts` (SSEBroadcaster used by scheduler only, not notifications).

### Feedback system

Two-tier feedback loop: user rates messages → mini-analysis per message → full-analysis aggregates into behavior guidelines → `routes/chat.ts` injects `reinforce`/`avoid` lists into chat system prompts via `getBehaviorGuidelines()`. Storage: `~/.stallion-ai/feedback/feedback.json`. See [docs/kiroom-analysis/02-insights-feedback.md](docs/kiroom-analysis/02-insights-feedback.md) for design rationale.

### Voice system

Speech-to-speech via WebSocket with plugin-extensible `IS2SProvider` interface. Built-in: Nova Sonic. Plugin examples: `examples/elevenlabs-voice/`, `examples/nova-sonic-voice/`. Voice prompt prefix auto-prepended. Agent MCP tools translated to S2S tool definitions.

### ACP (Agent Communication Protocol)

Connects external agent runtimes (e.g. `kiro-cli`) to Stallion as a UI/orchestration layer. Plugins contribute ACP connections via the additive provider pattern. See [docs/guides/acp.md](docs/guides/acp.md) for the full protocol and integration guide.

### Knowledge / LanceDB

Per-project vector knowledge base using LanceDB for embeddings. `KnowledgeService` manages document ingestion, chunking, and semantic search. Plugins can contribute knowledge namespaces. Embedding provider is configurable (Bedrock built-in).

### Scheduler (Boo)

Cron-based job scheduler. `BuiltinScheduler` runs jobs locally, `SchedulerService` manages CRUD + SSE streaming of job output. Jobs invoke agent prompts on a schedule. REST API at `/schedule`. Uses `SSEBroadcaster` for real-time output streaming to UI.

### Plugin architecture

Plugins are the product — core provides the foundation. A plugin can contribute layouts, agents, MCP integrations, providers, knowledge namespaces, and ACP connections. Manifest-driven with `stallion-plugin.json`. See [docs/guides/plugins.md](docs/guides/plugins.md) for development guide.

### Windows compatibility

All `spawn()` and `execSync()` calls MUST include `windowsHide: true` to prevent console windows flashing on Windows. Use `where` instead of `which` for command lookups (`process.platform === 'win32'`).

### Observability (OTel)

Every new feature MUST include OpenTelemetry instrumentation. Import instruments from `src-server/telemetry/metrics.ts` and record counters/histograms for meaningful operations (CRUD, lifecycle events, durations). If a new metric instrument is needed, add it to `metrics.ts` following the existing `stallion.<domain>.<metric>` naming convention.
