# Agent Development Guide

## Navigation Patterns

### Routing Strategy

The application uses a hybrid routing approach:

**Core Application: HTML5 Path-Based Routing**
- Main navigation uses clean URLs: `/workspaces/my-workspace`, `/agents/my-agent`
- Browser history API for navigation state
- Enables deep linking and bookmarking
- Query parameters for persistent core features: `/workspaces/my-workspace?dock=open&conversation=conv-123`

**Plugins/Components: Hash-Based Routing**
- Plugin state persists via URL hash: `/workspaces/my-workspace#view=calendar&date=2025-11-11`
- State survives page refresh
- Multiple plugins can maintain independent hash state

**Example URL Structure:**
```
/workspaces/my-workspace?dock=open&conversation=conv-123#tab=main&filter=active
/agents/code-reviewer?conversation=conv-456
```

### Agent Switching

Agents can be switched dynamically without server restarts:

**CLI:**
```bash
/switch <agent-slug>
```

**HTTP API:**
```bash
POST /agents/<agent-slug>/text
POST /agents/<agent-slug>/stream
POST /agents/<agent-slug>/invoke
```

**Desktop UI:**
- Use the agent selector dropdown in the top toolbar
- Each agent maintains isolated memory and conversation history
- Navigation: `/agents/<agent-slug>`

### Workspace Navigation

Workspaces define UI layout and are separate from agent logic:

```json
{
  "tabs": [
    {
      "id": "main",
      "label": "Main",
      "component": "work-agent-dashboard"
    }
  ]
}
```

- Core navigation: `/workspaces/<workspace-slug>`
- Tab state: Hash-based within workspace component
- Example: `/workspaces/my-workspace#tab=custom`

## Plugin/Component Creation

### Creating a Custom Workspace Component

1. **Define the component in your workspace:**

```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "tabs": [
    {
      "id": "custom",
      "label": "Custom View",
      "component": "my-custom-component"
    }
  ]
}
```

2. **Register the component in the UI:**

```typescript
// src-ui/src/components/workspaces/MyCustomComponent.tsx
export function MyCustomComponent() {
  return (
    <div>
      {/* Your custom UI */}
    </div>
  );
}

// Register in workspace registry
const WORKSPACE_COMPONENTS = {
  'my-custom-component': MyCustomComponent,
  'work-agent-dashboard': WorkAgentDashboard,
};
```

### Creating an MCP Tool Plugin

1. **Define the tool:**

```json
// .work-agent/tools/my-tool/tool.json
{
  "id": "my-tool",
  "kind": "mcp",
  "displayName": "My Tool",
  "description": "Custom tool functionality",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@my-org/mcp-server"],
  "permissions": {
    "filesystem": false,
    "network": true
  }
}
```

2. **Reference in agent configuration:**

```json
{
  "name": "My Agent",
  "tools": {
    "mcpServers": ["my-tool"],
    "available": ["my-tool_*"],
    "autoApprove": ["my-tool_safe_operation"]
  }
}
```

### Creating a Built-in Tool

1. **Define the tool:**

```json
// .work-agent/tools/my-builtin/tool.json
{
  "id": "my-builtin",
  "kind": "builtin",
  "displayName": "My Built-in Tool",
  "description": "Custom built-in functionality"
}
```

2. **Implement in runtime:**

```typescript
// src-server/runtime/tools/my-builtin.ts
export const myBuiltinTool = {
  name: 'my-builtin_action',
  description: 'Performs custom action',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  execute: async (params: { input: string }) => {
    // Implementation
    return { result: 'success' };
  }
};
```

### Quick Prompts

Add quick actions to agent toolbar:

```json
{
  "ui": {
    "quickPrompts": [
      {
        "id": "daily-standup",
        "label": "Daily Standup",
        "prompt": "Generate my daily standup update"
      }
    ]
  }
}
```

### Workflow Shortcuts

Surface workflows in agent UI:

```json
{
  "ui": {
    "workflowShortcuts": ["example-simple.ts", "daily-summary.ts"]
  }
}
```

Workflows are VoltAgent TypeScript files in `.work-agent/agents/<slug>/workflows/`.

## Component Communication Patterns

### Agent → UI

Agents communicate with UI via:
- **REST API responses** (text, stream, invoke endpoints)
- **SSE streams** for real-time updates
- **Conversation history** loaded from memory

### UI → Agent

UI sends requests via:
- **POST /agents/:slug/text** - Single response
- **POST /agents/:slug/stream** - Streaming response
- **POST /agents/:slug/invoke** - Silent tool invocation

### Tool Approval Flow

1. Agent requests tool execution
2. If tool not in `autoApprove`, UI prompts user
3. User approves/denies
4. Result returned to agent

Silent invocations (`/invoke` endpoint) bypass approval.

## Best Practices

### Agent Design

- **Single responsibility**: Each agent should have a focused purpose
- **Clear prompts**: System instructions should be specific and actionable
- **Tool scoping**: Use `available` to limit tool access, `autoApprove` for safe operations
- **Model selection**: Choose appropriate model for task complexity

### Workspace Design

- **Tab organization**: Group related functionality in tabs
- **Quick prompts**: Surface common tasks for one-click access
- **Component reuse**: Share components across workspaces when possible

### Tool Development

- **Permission scoping**: Request minimal permissions needed
- **Error handling**: Return clear error messages
- **Documentation**: Provide detailed descriptions for LLM understanding
- **Idempotency**: Design operations to be safely retryable

### UI/Component Development

- **Theme colors**: Always use CSS variables from the theme palette (e.g., `var(--bg-primary)`, `var(--text-primary)`, `var(--border-primary)`)
- **Light/Dark mode**: Ensure all custom styles work in both light and dark modes by using theme variables instead of hardcoded colors
- **Avoid hardcoded colors**: Never use direct color values like `#fff` or `rgb()` - use theme variables to maintain consistency

### State Management

**Use React Context + useSyncExternalStore for ALL API data:**
- Provides consistent pattern across the codebase
- Automatic caching and deduplication
- Single source of truth for all API state
- Easy to debug and reason about
- Components automatically stay in sync

**Implementation pattern:**
1. Create a Context with `useSyncExternalStore` for reactive updates
2. Implement a store class with subscribe/getSnapshot methods
3. Provide a custom hook (e.g., `useStats()`, `useAgents()`) that encapsulates subscription logic
4. Wrap the app with the Provider in `main.tsx`

**Example contexts to create:**
- `StatsContext` - Conversation statistics (✅ implemented)
- `AgentsContext` - Agent list and metadata
- `WorkspacesContext` - Workspace configurations
- `ConversationsContext` - Conversation history
- `ToolsContext` - Available tools

**Prefer state management over business logic in components:**
- **Keep components thin**: Components should primarily handle rendering and user interactions
- **Move logic to contexts**: Data fetching, transformations, and business rules belong in context stores
- **Use custom hooks**: Encapsulate complex state logic in hooks that components can consume
- **Avoid inline calculations**: Move data transformations to the store or custom hooks
- **Single responsibility**: Components render UI, contexts manage state and logic

**Example - Bad (logic in component):**
```typescript
function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
  
  const processedData = data?.items
    .filter(i => i.active)
    .map(i => ({ ...i, label: i.name.toUpperCase() }));
  
  return <div>{processedData?.map(...)}</div>;
}
```

**Example - Good (logic in context):**
```typescript
// In context/store
class DataStore {
  private data = new Map();
  
  async fetch() {
    const response = await fetch('/api/data');
    const result = await response.json();
    this.data.set('items', this.processItems(result.items));
    this.notify();
  }
  
  private processItems(items) {
    return items
      .filter(i => i.active)
      .map(i => ({ ...i, label: i.name.toUpperCase() }));
  }
}

// In component
function MyComponent() {
  const { items } = useData();
  return <div>{items?.map(...)}</div>;
}
```

**Simple UI state (NOT API data):**
- Use `useState` for component-local state (toggles, form inputs, etc.)
- Use `useReducer` for complex component state machines
- Keep it simple - only use Context for data that comes from the backend

**Reference implementation:** See `src-ui/src/contexts/StatsContext.tsx` for the pattern.

**@stallion-ai/sdk integration:**
The SDK should expose hooks that follow this pattern:
```typescript
// Instead of direct API calls in components
const { agents, loading } = useAgents();
const { workspaces } = useWorkspaces();
const { conversations } = useConversations(agentSlug);
```

This makes SDK data easily accessible and automatically synchronized across all components.

### Memory Management

- **Conversation scoping**: Each agent has isolated memory via `userId: agent:<slug>:user:<id>`
- **Session cleanup**: Old sessions persist in NDJSON files
- **Working memory**: Use `.work-agent/agents/<slug>/memory/working/` for temporary state

## Component Architecture

### ChatDock Component

The ChatDock is a persistent component that renders across all app views (workspace, agents, tools, workflows, settings). It manages its own state and provides a consistent chat interface regardless of navigation.

**Key Principles:**
- **Always rendered**: ChatDock is rendered once at the app level, not conditionally per view
- **Self-contained state**: Manages its own collapse/expand, height, sessions, and messages
- **Persists across navigation**: State is preserved when switching between views
- **Independent of view logic**: Does not depend on workspace or management view state

**Implementation:**
```typescript
// In App.tsx - rendered once for entire app
<ChatDock
  agents={agents}
  apiBase={API_BASE}
  availableModels={availableModels}
  onRequestAuth={handleAuthError}
/>
```

**State Management:**
- Dock UI state (collapsed, maximized, height) persisted to localStorage
- Session state managed internally with React state
- Integrates with ConversationsContext for persistence

**Benefits:**
- Chat sessions don't reset when navigating between views
- Consistent UX across all pages
- Cleaner separation of concerns
- Easier to test and maintain

### Memory Management
