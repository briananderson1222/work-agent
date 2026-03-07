# Management Redesign — Agents, Workspaces, Prompts

## Problem

The current management views have several issues:
- **No delete** for agents or workspaces (backend supports it, UI doesn't)
- **Prompts view** is a stub — no CRUD, no standalone prompt management
- **Navigate-away editors** — clicking an agent/workspace takes you to a separate full-page editor, losing context
- **Monolithic editors** — 44-48KB files mixing basic and power-user config at the same level
- **Inconsistent data flow** — editors use raw `fetch()` instead of SDK mutations
- **No prompt registry** — prompts are embedded in workspace/agent configs with no reuse

## Design

### Layout: Split-Pane

All three management views (agents, workspaces, prompts) share a consistent split-pane layout:

```
┌─────────────────────────────────────────────────────┐
│  manage / agents                        [+ New]     │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  Search...   │  Agent Name              [Save] [⋮]  │
│              │                                      │
│  ┌─────────┐ │  ── Basic ──────────────────────     │
│  │ Agent 1 │ │  Name: [___________]                 │
│  ├─────────┤ │  Description: [___________]          │
│  │ Agent 2 │◄│  System Prompt: [textarea]           │
│  ├─────────┤ │                                      │
│  │ Agent 3 │ │  ── Advanced ▸ ─────────────────     │
│  └─────────┘ │  (collapsed by default)              │
│              │  Model, Region, Guardrails, etc.     │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

- Left panel: ~280px, searchable list, selected item highlighted
- Right panel: inline editor with sections
- No page navigation — selection changes the right panel content
- Empty state when nothing selected: "Select an item or create a new one"

### Editor Structure: Basic / Advanced

Each editor has two tiers:

**Basic** (always visible):
- The fields 80% of users need 80% of the time
- Name, description, icon, primary content (system prompt / tabs / prompt text)

**Advanced** (collapsed by default, expandable):
- Power-user configuration
- Model selection, region, guardrails, maxSteps, tools, commands

### Prompt Registry

Follows the plugin pattern:

```
~/.stallion-ai/prompts/
  ├── prompts.json          # Local prompt store
  └── registry-cache.json   # Cached registry index
```

**PromptRegistryProvider interface:**
```typescript
interface IPromptRegistryProvider {
  readonly id: string;
  readonly displayName: string;
  listPrompts(): Promise<PromptEntry[]>;
  getPrompt(id: string): Promise<PromptEntry>;
}
```

Plugins can register prompt providers (like they register scheduler providers, voice providers, etc.).

**Prompt entity:**
```typescript
interface Prompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;        // Optional agent assignment
  source?: string;       // 'local' | plugin id
  createdAt: string;
  updatedAt: string;
}
```

## Implementation Phases

### Phase 1: Foundation
- `SplitPaneLayout` component + CSS
- Prompt types + file-based storage + API routes

### Phase 2: Views
- Redesigned AgentsView (split-pane, basic/advanced, delete)
- Redesigned WorkspacesView (same pattern)
- New PromptsView (full CRUD)

### Phase 3: Registry
- PromptRegistryProvider interface
- Built-in prompts
- Registry browsing tab in PromptsView

## Files Changed

### New
- `src-ui/src/components/SplitPaneLayout.tsx` + `.css`
- `src-server/services/prompt-service.ts`
- `src-server/routes/prompts.ts`
- `src-server/providers/types.ts` (extend with prompt types)

### Modified
- `src-ui/src/views/AgentsView.tsx` — full rewrite
- `src-ui/src/views/WorkspacesView.tsx` — full rewrite
- `src-ui/src/views/PromptsView.tsx` — full rewrite
- `src-ui/src/App.tsx` — routing updates
- `src-server/runtime/stallion-runtime.ts` — mount prompt routes
