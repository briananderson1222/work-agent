# Vision: AI <-> UI Bridge

> The north star for Stallion's core differentiator. This document describes where we're going, what exists today, what's next, and what's aspirational. It evolves as capabilities are built.

*Last updated: 2026-04-11*

---

## The Thesis

Most AI tools treat the UI as a display layer and the AI as a backend. Stallion treats them as peers. The AI can reshape the UI. The UI can enrich the AI. Both share the same primitives (tools, knowledge, agents, project context) and can invoke each other.

This bidirectional integration is what makes Stallion a *platform* rather than a *chat wrapper*.

---

## Where We Are Today

### SDK as the Bridge

The `@stallion-ai/sdk` package is the current bridge layer. Plugin layouts import hooks and APIs that give them first-class access to the same primitives the AI uses:

**AI Primitives Available to UI:**
- `useAgents()`, `useAgent()` -- list and select agents
- `useSendToChat()`, `sendMessage()`, `streamMessage()` -- communicate with agents
- `callTool()` -- invoke MCP tools directly from UI
- `searchKnowledge()`, `uploadKnowledge()`, `fetchKnowledgeDocs()` -- knowledge management
- `useConversations()`, `useCreateChatSession()` -- conversation lifecycle
- `useConfig()`, `useAuth()` -- platform configuration
- `useProjectsQuery()`, `useLayoutsQuery()` -- project and layout management
- `invokeAgent()` -- programmatic agent invocation

**UI -> AI Context Flow:**
- `contextRegistry` -- plugins register `MessageContextProvider` implementations that prepend ambient context to outgoing messages (GPS, timezone, calendar, application state)
- Chat input supports file attachments, code snippets, and project references
- Layout panels can seed chat with contextual data

**AI -> Platform Control:**
- `stallion-control` MCP server exposes: agent CRUD, integration management, skill management, playbook management, project management, config read/update, scheduler jobs, UI navigation, message sending to other agents
- An agent with `stallion-control` can set up an entire project environment programmatically

### What This Enables Today

A plugin layout can build a complete vertical workspace -- a coding IDE, a research assistant, a support dashboard -- that:
1. Uses the same agents and tools as the chat
2. Displays domain-specific UI alongside the chat
3. Seeds context to the AI based on what the user is doing in the UI
4. Lets the AI navigate between views and configure the platform

This is real and working. Each layout is a vertical surface that bridges AI capabilities to a specific use case.

---

## What's Next (Phase 3-4)

### Structured UI Blocks in Chat

**Problem:** Today, agents can only return text (and markdown). If an agent queries a database and wants to show results, it renders a markdown table. If it wants user confirmation, it asks in text. This is limiting.

**Solution:** Define a `UIBlock` type system that agents can return via tool calls, rendered by the chat as interactive React components.

```typescript
type UIBlock =
  | { type: 'card'; title: string; body: string; actions?: Action[] }
  | { type: 'table'; columns: Column[]; rows: Row[] }
  | { type: 'form'; fields: FormField[]; onSubmit: string }
  | { type: 'chart'; chartType: 'bar' | 'line' | 'pie'; data: ChartData }
  | { type: 'code'; language: string; content: string; editable?: boolean }
  | { type: 'image'; src: string; alt: string }
  | { type: 'progress'; label: string; percent: number }
  | { type: 'choices'; question: string; options: string[]; onSelect: string }
```

An agent would use a `render_ui_block` MCP tool:
```
render_ui_block({ type: 'table', columns: [...], rows: [...] })
```

The chat renderer detects UIBlock responses and renders the appropriate React component instead of plain text.

**Anti-goals:**
- Not arbitrary React rendering -- a fixed component library
- Not replacing plugin layouts -- blocks are for inline chat, layouts are for workspaces
- Not code generation at runtime -- typed, structured data

### Richer Context Capture

**Problem:** The `contextRegistry` requires plugins to explicitly register context providers. The user has to be in a specific layout for context to flow. If the user has a file open, the AI doesn't know. If the terminal shows an error, the AI doesn't see it.

**Solution:** SDK hooks that layouts can use to automatically capture and expose UI state:

```typescript
// Layout registers what's visible
useContextExposure({
  activeFile: currentFilePath,
  selectedText: selection,
  terminalLastOutput: lastTerminalLine,
  visibleDiff: currentDiff,
});

// Agent can request a snapshot
capture_context({ sources: ['activeFile', 'terminalLastOutput'] })
```

This is opt-in per layout -- layouts declare what they expose, agents request what they need.

### Notification & Progress from Agents

**Problem:** Long-running agent tasks provide no feedback until completion. The user stares at a spinner.

**Solution:** Agents can push progress and notification events that the UI renders:
- Progress bars for multi-step tasks
- Toast notifications for completed sub-tasks
- Inline status updates in the chat stream

---

## Long-Term Vision (Phase 5+)

### Agent-Composable Layouts

The AI can dynamically arrange the workspace:

```
compose_layout({
  panels: [
    { position: 'left', component: 'file-tree', width: '25%' },
    { position: 'center', component: 'editor', file: 'src/index.ts' },
    { position: 'right', component: 'chat', agent: 'code-reviewer' },
    { position: 'bottom', component: 'terminal' }
  ]
})
```

Panels are drawn from installed plugin components. The AI selects and arranges them based on the task. A debugging task gets a different layout than a code review task.

### Reactive Context Flow

Instead of polling or explicit capture, the UI continuously streams relevant context to the AI:

- User scrolls to a function -- the function signature enters context
- User switches terminal tabs -- the new terminal's recent output enters context
- User opens a diff -- the changed lines enter context
- User highlights text -- the selection enters context

The AI sees what the user sees, in real-time, without the user having to copy-paste or describe it.

### Self-Improving Workspaces

Combining `stallion-control` (agents managing agents) with composable layouts and self-improving playbooks (inspired by Hermes):

1. User starts a task: "Review this PR"
2. Agent configures the workspace: opens diff view, file tree, related tests
3. Agent creates a temporary "PR reviewer" sub-agent with relevant tools
4. As the review progresses, the agent refines its playbook for future PR reviews
5. Next time, the workspace setup is faster and the review is more thorough

The platform learns not just from conversations, but from how workspace configurations lead to good outcomes.

---

## Anti-Goals

- **Not replacing frontend development.** Stallion is not trying to let AI write arbitrary React at runtime. UI blocks are typed, structured, from a component library.
- **Not competing with Figma/design tools.** The composable layout is for functional workspace arrangement, not visual design.
- **Not surveillance.** Context capture is opt-in per layout. Users control what's exposed. No keystroke logging, no screen recording, no ambient monitoring without explicit layout participation.
- **Not magic.** Every AI->UI action is an explicit tool call. Every UI->AI context flow is a registered provider. The bridge is transparent and debuggable.

---

## Inspiration Sources

| Source | Pattern | How it applies |
|--------|---------|---------------|
| **Hermes** self-improving skills | Agent creates artifacts from experience | Agents refine workspace configs and playbooks |
| **Codex** Smart Approvals | Guardian sub-agent | Review tool calls before they affect the UI |
| **Vercel AI SDK** `useChat` | Streaming structured responses | UIBlock rendering in chat stream |
| **Happier** Inbox | Aggregated notifications | Multi-agent approval/notification panel |
| **VS Code** Extension API | `registerWebviewViewProvider` | Plugin component registration for composable layouts |

---

## Implementation Sequence

1. **UIBlock type system** -- Define the types, build the chat renderer (Phase 3-4)
2. **`render_ui_block` MCP tool** -- Agents can produce blocks (Phase 3-4)
3. **Context exposure hooks** -- SDK hooks for layouts to declare visible state (Phase 4-5)
4. **`capture_context` MCP tool** -- Agents request UI snapshots (Phase 4-5)
5. **Agent-composable layouts** -- `compose_layout` tool, panel registry (Phase 5)
6. **Reactive context streaming** -- Continuous context flow (Phase 5+)
7. **Self-improving workspaces** -- Playbook-driven workspace optimization (Phase 5+)
