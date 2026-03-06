# Agent Development Guide

> **Keep this file minimal.** This is a quick reference that points to detailed docs. Add specifics to the pattern files, not here.

## For AI Coding Assistants

When working on this codebase:

1. **Check pattern docs first** - Review the relevant pattern file before implementing
2. **Follow established patterns** - Use existing patterns rather than inventing new approaches
3. **Update docs when patterns are missing** - Add new patterns to the appropriate file
4. **Ask if unclear** - If a pattern isn't documented and you're unsure, ask before proceeding
5. **No TypeScript shortcuts** - Understand types before fixing errors; don't blindly use `as any`

### Pattern Documentation

| Area | File | When to Read |
|------|------|--------------|
| Frontend | [Frontend Patterns](../patterns/frontend.md) | React, hooks, styling, SDK, plugins |
| Backend | [Backend Patterns](../patterns/backend.md) | Routes, services, Stallion runtime, routes |

**Update these docs when:**
- You implement a reusable pattern not yet documented
- You discover a pitfall that others should avoid
- You establish a convention for a new area

---

## Agent Configuration

Agents live in `.stallion-ai/agents/<slug>/agent.json`. The directory name is the agent's slug.

For full field reference see [docs/reference/config.md](../reference/config.md). Key fields:

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `prompt` | System prompt (supports `{{key}}` template variables) |
| `model` | Bedrock model ID — falls back to `defaultModel` in app.json |
| `tools` | MCP server IDs, allow-list, auto-approve list |
| `guardrails` | `maxSteps`, `maxTokens`, `temperature` |

### MCP Tool Configuration

`tools` in agent.json controls which MCP servers connect and which tools are exposed:

```json
{
  "tools": {
    "mcpServers": ["filesystem", "github"],
    "available": ["read_file", "list_directory", "create_pull_request"],
    "autoApprove": ["read_file", "list_directory"],
    "aliases": { "ls": "list_directory" }
  }
}
```

- `mcpServers` — IDs of MCP servers to connect (each defined in `.stallion-ai/tools/<id>/tool.json`)
- `available` — allowlist of tool names exposed to the agent; omit or set `["*"]` to expose all tools from connected servers
- `autoApprove` — tools that execute without user confirmation; all other tools trigger the approval flow
- `aliases` — rename tools in prompts without changing the underlying tool name

### Guardrails

Guardrails constrain model inference per agent:

```json
{
  "guardrails": {
    "maxSteps": 30,
    "maxTokens": 8192,
    "temperature": 0.3
  }
}
```

- `maxSteps` — maximum agentic steps per turn before the runtime halts the loop
- `maxTokens` — maximum output tokens per model call (overrides `defaultMaxOutputTokens` from app.json)
- `temperature` / `topP` / `stopSequences` — standard inference parameters

---

## Agent Lifecycle

The runtime loads and manages agents through a defined lifecycle:

```
load → MCP connect → ready → chat → reload
```

1. **load** — `stallion-runtime.ts` reads `agent.json`, resolves the Bedrock model, and creates a memory adapter for the agent's conversation history
2. **MCP connect** — for each entry in `tools.mcpServers`, the runtime connects to the MCP server and loads its tool schemas; connection status is tracked per `<slug>:<serverId>` key
3. **ready** — the agent is registered in `activeAgents` and available for requests
4. **chat** — `POST /api/agents/:slug/chat` streams a response; the runtime creates an `InjectableStream` to interleave approval events with model output
5. **reload** — `reloadAgents()` diffs the on-disk agent list against `activeAgents`, disconnects removed agents' MCP servers, and registers new ones without a full restart

Health is checked every 60 seconds and emitted as `agent-health` monitoring events.

---

## Tool Approval Flow

Tools not in `autoApprove` pause the stream and request user confirmation before executing.

Flow:
1. `beforeToolCall` hook fires — checks `autoApprove` list via `isAutoApproved()`
2. If not auto-approved, the hook calls `requestApproval` (wired per-request by the chat handler)
3. `requestApproval` injects an `approval-request` SSE event into the stream
4. The client renders a confirmation UI and `POST /tool-approval/:approvalId` with `{ approved: true/false }`
5. `ApprovalRegistry.resolve()` unblocks the hook; the tool executes or is skipped

The `InjectableStream` wrapper ensures approval events are emitted in the correct position in the SSE stream, even when the model is mid-reasoning.

---

## Agent Hooks

`agent-hooks.ts` provides framework-agnostic lifecycle hooks wired into whichever runtime adapter is active. Hooks receive typed context objects — no framework imports.

| Hook | When it fires | What it does |
|------|--------------|--------------|
| `beforeToolCall` | Before any tool executes | Checks auto-approve; triggers approval flow if needed |
| `afterToolCall` | After a tool returns | Debug logging |
| `afterInvocation` | After the full turn completes | Updates conversation stats (tokens, cost, tool call count) in the memory adapter |

`afterInvocation` also enriches the last assistant message with model metadata and pricing from the Bedrock model catalog.

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agents/:slug/chat` | Streaming chat (SSE) |
| `POST /agents/:slug/invoke` | Silent tool invocation (no stream) |
| `POST /agents/:slug/invoke/stream` | Streaming invoke with optional JSON schema output |
| `GET /agents/:slug/tools` | List tools with full schemas |
| `PUT /agents/:slug/tools/allowed` | Update tool allow-list |
| `POST /tool-approval/:approvalId` | Resolve a pending tool approval |
| `GET /agents/:slug/health` | Agent health check (MCP connection status) |

---

## Quick Reference

### Data Layer Architecture

All workspace data flows through typed abstractions:

```
Provider Interface (contract)  →  Provider Impl (plugin)        →  ViewModel (UI shape)
  ICalendarProvider                 (plugin-provided)              CalendarEventVM
  ICRMProvider                      (plugin-provided)              AccountVM, OpportunityVM
  IInsightsProvider                  (plugin-provided)              InsightVM
  IEmailProvider                    (plugin-provided)              EmailVM
  IUserDirectoryProvider            (plugin-provided)              UserDetailVM
```

**Rules:**
- Components consume **ViewModels only** — never raw API/tool responses
- Provider implementations map raw responses to ViewModels via mapper functions (e.g., `mapAccount`, `mapInsight`)
- Hooks in `data/index.ts` wrap providers with React Query — components use hooks, not providers directly
- **No `as any` in new code** — use proper ViewModel types. Existing `any` usage in Calendar.tsx, CRM.tsx, StallionContext.tsx is tech debt to be migrated
- Core app (`src-ui/src/`) never imports from workspace providers — use SDK abstractions (`useAuth`, `useNavigation`, etc.)
- The CRM page has a legacy local `Account` type that should be migrated to `AccountVM`

### Core Boundaries

| Location | Contents |
|----------|----------|
| `src-ui/src/` | Core app: Contexts, SDK Adapter, App Shell |
| `packages/sdk/` | SDK: Query hooks, API utilities, Types |
| `examples/*/` | Plugins: Components, ViewModels, styles |

**Key rule**: Plugins import from `@stallion-ai/sdk` only.

### Cross-Tab Navigation

Plugins must use SDK hooks for navigating between workspace tabs — never use raw `sessionStorage`, `window.history.pushState`, or `window.dispatchEvent` directly.

```typescript
import { useNavigation, useWorkspaceNavigation } from '@stallion-ai/sdk';

const nav = useNavigation();
const { setTabState, getTabState } = useWorkspaceNavigation();

// Navigate to another tab with state:
setTabState('crm', 'selectedAccount=<id>');       // write state for target tab
nav.setWorkspaceTab('stallion', 'crm');            // navigate to tab

// Read state on the receiving tab:
const state = getTabState('crm');                  // read in useEffect([activeTab])
const params = new URLSearchParams(state);
const accountId = params.get('selectedAccount');
```

**Rules:**
- `setTabState(tabId, state)` writes to sessionStorage + syncs URL hash
- `setWorkspaceTab(workspaceSlug, tabId)` handles client-side URL navigation
- Receiving tab reads state via `getTabState(tabId)` in a `useEffect` triggered by `activeTab`
- State format is URL search params string (e.g., `'event=abc&date=2026-01-01'`)

### ⛔ NEVER run long-lived processes via the test-workspace.sh script from execute_bash

The `test-workspace.sh` script uses `wait` and is designed for interactive terminals. Instead, start the server and UI directly as background processes:

```bash
# From execute_bash:
cd /path/to/project
PORT=3142 npm run dev:server > /tmp/stallion-test-server.log 2>&1 &
VITE_API_BASE=http://localhost:3142 npm run dev:ui -- --port 5174 > /tmp/stallion-test-ui.log 2>&1 &
sleep 8  # wait for startup
```

For interactive use in a terminal, `./scripts/test-workspace.sh` works as-is.

### Testing with Playwright

Never start dev servers (or any long-running process) from `execute_bash` — it hangs the tool. Use the standalone script instead:

```bash
# Terminal 1: start test instance
./scripts/test-workspace.sh

# Terminal 2: run tests (once "ready" appears)
npx playwright test tests/schedule.spec.ts --reporter=list
```

See `scripts/test-workspace.sh` for details. The script starts the backend on port 3142 and UI on port 5174, waits for readiness, then opens for Playwright validation.

### Debugging

Frontend logging (never use `console.log`):
```typescript
import { log } from '@/utils/logger';
log.api('message');  // Enable: localStorage.debug = 'app:*'
```

### Theming & Colors

Never use hardcoded hex colors. Use CSS variables from `src-ui/src/index.css` (`--text-primary`, `--bg-secondary`, `--border-primary`, `--accent-primary`, `--accent-acp`, etc). For status colors use the Tailwind palette: green `#22c55e`, amber `#f59e0b`, red `#ef4444`. Buttons use `className="button button--secondary"`. See [frontend.md](../patterns/frontend.md) for details.

### Styling

**Prefer CSS classes over inline styles.** Define styles in the component's CSS file (or `index.css` for shared styles) and reference them via `className`. Inline `style={}` should only be used for truly dynamic values (e.g., computed widths, conditional colors from data). All colors, spacing, and theming must use CSS variables — never hardcoded hex values.

### Confirmation Dialogs

Never use `window.confirm()` or `window.alert()`. Always use the `ConfirmModal` component for destructive or significant actions:

```tsx
import { ConfirmModal } from '@/components/ConfirmModal';

<ConfirmModal
  isOpen={showConfirm}
  title="Delete Item"
  message="This cannot be undone."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={handleConfirm}
  onCancel={() => setShowConfirm(false)}
/>
```

This ensures consistent theming, accessibility, and UX across all confirmation flows.

### Agent Icons

Always use the `AgentIcon` component — never manually check icon URLs or render `<img>` tags for agent icons:

```tsx
import { AgentIcon } from '@/components/AgentIcon';
<AgentIcon agent={agent} size={20} />
```

### ACP Agent Detection

Never hardcode ACP connection prefixes (e.g., `startsWith('kiro-')`). Use `agent.source === 'acp'` from the agents list. ACP metadata (`planUrl`, `planLabel`, `connectionName`) is available on agent configs for dynamic UI.

### Plugin Workflow

```bash
stallion remove my-workspace
stallion install ./examples/my-workspace
npm run dev:ui
```
