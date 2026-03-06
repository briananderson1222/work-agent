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

### Agent Configuration

Agents live in `.stallion-ai/agents/<slug>/agent.json`:
- `tools.mcpServers`: MCP server IDs to load
- `tools.available`: Tools agent can invoke (wildcards supported)
- `tools.autoApprove`: Tools that skip user confirmation

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /agents/:slug/stream` | Streaming chat |
| `POST /agents/:slug/invoke` | Silent tool invocation |

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
