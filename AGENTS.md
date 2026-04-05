# Agent Notes

## Active Work

The current major initiative is the **Connected Agents Overhaul** — adding
Claude Agent SDK and Codex as first-class provider adapters alongside the
existing Bedrock/VoltAgent runtime.

**Read `.plans/01-connected-agents-overhaul.md` before starting any work on
this initiative.** It contains the full architecture, phased implementation
plan, exit criteria, decision log, and file index. Pick up from wherever the
exit criteria checkboxes indicate progress stopped.

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
./stallion --help              # Discover all commands and flags
./stallion start               # Start (auto-builds if needed)
./stallion start --clean --force  # Wipe and rebuild from scratch
./stallion stop                # Stop running processes
```

### Port rules

Default ports (3141 server, 3000 UI) are **reserved for user testing**. Agents must always use unique ports:

```bash
./stallion start --clean --force --port=3242 --ui-port=5274
```

Pick ports that won't collide with other agents running concurrently.

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
