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

**IMPORTANT: State Persistence in Workspace Components**

When building workspace components that are installed via the plugin system, **always use the WorkspaceNavigation context** for state persistence:

```typescript
import { useWorkspaceNavigation } from '@stallion-ai/sdk';

function MyWorkspaceComponent() {
  const { getTabState, setTabState } = useWorkspaceNavigation();
  
  // Save state
  const params = new URLSearchParams();
  params.set('filter', 'active');
  params.set('selectedId', '123');
  setTabState('my-tab', params.toString());
  
  // Load state
  const state = getTabState('my-tab');
  const params = new URLSearchParams(state);
  const filter = params.get('filter');
  const selectedId = params.get('selectedId');
}
```

**Why this matters:**
- State persists across page refreshes
- Works correctly with the plugin installation process
- Integrates with the workspace navigation system
- Avoids conflicts with other workspace components

**Common pattern for complex state:**
```typescript
// Save multiple values
const saveState = () => {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('filters', JSON.stringify(activeFilters));
  params.set('selectedItem', selectedItem?.id || '');
  setTabState('my-component', params.toString());
};

// Load on mount
useEffect(() => {
  const state = getTabState('my-component');
  const params = new URLSearchParams(state);
  setMode(params.get('mode') || 'default');
  const filters = params.get('filters');
  if (filters) setActiveFilters(JSON.parse(filters));
  const itemId = params.get('selectedItem');
  if (itemId) restoreSelectedItem(itemId);
}, []);
```

## Plugin/Component Creation

**IMPORTANT: Plugin Development Workflow**

All plugin changes should be made in the `examples/` directory and reinstalled to ensure compatibility:

```bash
# 1. Make changes in examples/stallion-workspace/
# 2. Remove the installed plugin
npx tsx scripts/cli-plugin.ts remove stallion-workspace

# 3. Reinstall from examples
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace

# 4. Test in the UI
npm run dev:ui
```

This workflow ensures:
- Plugin structure is correct and installable
- All files are properly copied to the UI directory
- Changes work through the plugin installation process
- No direct edits to `src-ui/src/workspaces/` that bypass the plugin system

**CRITICAL: SDK-Only Imports**

Workspace components MUST only import from `@stallion-ai/sdk`. Never import directly from core application code:

```typescript
// ✅ CORRECT - Import from SDK
import { useAgents, useNavigation, log } from '@stallion-ai/sdk';

// ❌ WRONG - Never import from core
import { log } from '@/utils/logger';
import { useAgents } from '@/contexts/AgentsContext';
```

This ensures:
- Plugins remain portable and decoupled from core implementation
- SDK provides a stable API contract
- Core refactoring doesn't break plugins
- Plugins can be distributed as standalone packages

## Core vs Plugin Boundaries

Understanding the separation between core application code and plugin/workspace code is critical for maintainability.

### What belongs in Core (`src-ui/src/`)

- **Contexts**: Global state providers (AgentsContext, NavigationContext, etc.)
- **SDK Adapter**: Bridge between core contexts and SDK
- **App Shell**: Header, ChatDock, routing, layout
- **Management Views**: Settings, AgentEditor, WorkspaceEditor
- **Shared UI Components**: Generic buttons, modals, inputs used across the app

### What belongs in SDK (`packages/sdk/`)

- **Hook wrappers**: Stable API for plugins to access core functionality
- **API utilities**: `transformTool`, `invokeAgent`, `sendMessage`
- **Type definitions**: Shared types for plugins
- **Generic UI components**: `Button`, `Pill`, `AutoSelectModal`
- **Query hooks**: `useApiQuery`, `useWorkspacesQuery`, etc.

### What belongs in Plugins/Workspaces (`examples/*/`, installed to `src-ui/src/workspaces/`)

- **Plugin-specific components**: Calendar, CRM, custom dashboards
- **Plugin-specific hooks**: `useSalesQueries`, `useCRMViewModel`
- **Plugin-specific utilities**: Cache helpers, data transformers, formatters
- **Plugin-specific state**: Local state management within the plugin
- **Plugin-specific styles**: CSS for plugin components

### Key Principles

1. **Plugins are self-contained**: A plugin should work with only SDK imports. If a plugin needs functionality not in the SDK, the SDK should be extended.

2. **Plugins define their own agents**: Plugins should explicitly specify which agent(s) they use. There is no "default agent" assumption.

3. **Plugin utilities stay in plugins**: Helper functions like cache management, data formatting, or business logic specific to a plugin should NOT be extracted to core or SDK.

4. **SDK provides capabilities, not implementations**: The SDK provides hooks like `useSendToChat(agentSlug)` where the plugin specifies the agent. The SDK never assumes which agent to use.

5. **Core doesn't know about plugins**: Core code should never import from or reference specific plugins. The plugin registry handles discovery.

### Example: Correct Plugin Structure

```
examples/my-workspace/
├── plugin.json           # Plugin manifest
├── index.tsx             # Main component (imports from @stallion-ai/sdk only)
├── MyFeature.tsx         # Feature component
├── useMyViewModel.ts     # Plugin-specific ViewModel
├── useMyQueries.ts       # Plugin-specific React Query hooks
├── utils/
│   └── cache.ts          # Plugin-specific cache utility (NOT in SDK)
└── workspace.css         # Plugin-specific styles
```

### Anti-patterns to Avoid

```typescript
// ❌ WRONG: Plugin assuming a default agent
const sendToChat = useSendToChat(); // No agent specified

// ✅ CORRECT: Plugin explicitly specifies agent
const sendToChat = useSendToChat('my-plugin-agent');

// ❌ WRONG: Extracting plugin utility to SDK
// packages/sdk/src/utils/cache.ts - DON'T DO THIS

// ✅ CORRECT: Keep plugin utilities in plugin
// examples/my-workspace/utils/cache.ts

// ❌ WRONG: Core importing from plugin
import { Calendar } from '@/workspaces/stallion-workspace/Calendar';

// ✅ CORRECT: Core uses plugin registry
const Component = workspaceRegistry.get(workspace.component);
```

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

## Debugging

### Frontend Logging

**CRITICAL: Never use `console.log()` directly in production code.**

The frontend uses the `debug` package for structured logging with namespaces. This allows users to control log output without code changes.

```typescript
import { log } from '@/utils/logger';

// Use appropriate namespace
log.context('Agent loaded:', agent);
log.api('Fetching conversations');
log.chat('Message sent:', message);
log.workflow('Workflow started:', workflowId);
log.plugin('Plugin registered:', pluginName);
log.auth('Auth error:', error);
```

**When to use each namespace:**
- `app:context` - Context providers, state management, React hooks
- `app:api` - API calls, responses, network errors
- `app:chat` - Chat interactions, messages, streaming
- `app:workflow` - Workflow execution, state changes
- `app:plugin` - Plugin loading, registration, errors
- `app:auth` - Authentication, authorization, token refresh

**Enable/disable logs in browser console:**

```javascript
// Enable all logs
localStorage.debug = 'app:*'

// Enable specific namespace
localStorage.debug = 'app:api,app:chat'

// Disable all logs
localStorage.debug = ''

// Then refresh the page
```

**Available namespaces:**
- `app:context` - Context providers and state management
- `app:api` - API calls and responses
- `app:chat` - Chat interactions and messages
- `app:workflow` - Workflow execution
- `app:plugin` - Plugin loading and registration
- `app:auth` - Authentication and authorization

**Exception:** Temporary debugging during development is acceptable, but must be removed before committing.

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

**Use React Query for ALL API data:**
- Provides consistent pattern across the codebase
- Automatic caching and deduplication
- Single source of truth for all API state
- Easy to debug and reason about
- Components automatically stay in sync

**Migration Status:** See [REACT_QUERY_MIGRATION_STATUS.md](./REACT_QUERY_MIGRATION_STATUS.md) for current progress and next steps.

**Architecture Pattern (MVVM)**:

```
Data Layer (Queries)
  ↓
ViewModel Layer (Custom Hooks)
  ↓
View Layer (Components)
```

**1. Data Layer** - Reusable query hooks:
```typescript
// useSalesQueries.ts
export function useMyPersonalDetails() {
  return useApiQuery(['sfdc', 'personalDetails'], async () => {
    return await transformTool('work-agent', 'sat-sfdc_get_my_personal_details', {}, 'data => data');
  });
}

export function useMyAccounts(userId: string | undefined) {
  return useApiQuery(['sfdc', 'accounts', userId], async () => {
    return await transformTool('work-agent', 'sat-sfdc_list_user_assigned_accounts', { userId }, 'data => data');
  }, { enabled: !!userId });
}
```

**2. ViewModel Layer** - Component-specific business logic:
```typescript
// useCRMViewModel.ts
export function useCRMViewModel() {
  const { data: myDetails } = useMyPersonalDetails();
  const { data: myAccounts = [] } = useMyAccounts(myDetails?.userId);
  
  // Derived state
  const userDetails = myDetails ? {
    alias: myDetails.name,
    sfdcId: myDetails.userId
  } : null;
  
  // Business logic
  const processedAccounts = myAccounts.map(member => ({
    ...member.account,
    _sources: [{ type: 'owner', label: userDetails?.alias }]
  }));
  
  return { userDetails, processedAccounts, isLoading: !myDetails };
}
```

**3. View Layer** - Just render:
```typescript
// CRM.tsx
export function CRM() {
  const vm = useCRMViewModel();
  
  return <div>{vm.processedAccounts.map(...)}</div>;
}
```

**Benefits**:
- **Reusable data hooks**: Multiple ViewModels can use same queries
- **Automatic deduplication**: React Query caches by key
- **Separation of concerns**: Data fetching ≠ business logic ≠ rendering
- **Testable**: Test ViewModels independently of components
- **Type-safe**: Full TypeScript support

**Simple UI state (NOT API data)**:
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
