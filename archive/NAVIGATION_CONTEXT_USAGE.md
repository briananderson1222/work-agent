# NavigationContext Usage

## Overview

`NavigationContext` centralizes routing state and URL management, eliminating prop drilling and providing consistent access to navigation state across all components.

## Benefits

1. **No prop drilling** - Components access routing state directly via hook
2. **URL persistence** - All navigation state syncs with browser URL
3. **Type-safe** - Full TypeScript support for navigation state
4. **Reactive** - Components auto-update when URL changes (back/forward buttons)
5. **Centralized** - Single source of truth for routing

## API

### Hook: `useNavigation()`

Returns navigation state and methods:

```typescript
const {
  // State (from URL)
  pathname,              // Current path
  selectedAgent,         // Active agent slug
  selectedWorkspace,     // Active workspace slug
  activeConversation,    // Active conversation ID
  activeTab,             // Active tab ID
  isDockOpen,            // Chat dock open state
  isDockMaximized,       // Chat dock maximized state
  fontSize,              // Font size preference
  
  // Methods
  navigate,              // Navigate to new path with params
  updateParams,          // Update query params only
  setAgent,              // Set active agent
  setWorkspace,          // Set active workspace
  setConversation,       // Set active conversation
  setDockState,          // Set dock open/maximized state
} = useNavigation();
```

## Usage Examples

### ChatDock - Get API Base and Active Conversation

**Before (prop drilling):**
```typescript
<ChatDock
  apiBase={API_BASE}
  selectedAgent={selectedAgent}
  activeConversation={activeConversation}
  // ... many more props
/>

function ChatDock({ apiBase, selectedAgent, activeConversation }: Props) {
  // Use props
}
```

**After (context):**
```typescript
<ChatDock />

function ChatDock() {
  const apiBase = useApiBase();
  const { selectedAgent, activeConversation } = useNavigation();
  // Use directly
}
```

### Agent Selector - Navigate to Agent

**Before:**
```typescript
<AgentSelector
  selectedAgent={selectedAgent}
  onSelectAgent={(slug) => {
    setSelectedAgent(slug);
    navigate(`/agents/${slug}`);
  }}
/>
```

**After:**
```typescript
<AgentSelector />

function AgentSelector() {
  const { selectedAgent, setAgent } = useNavigation();
  
  return (
    <button onClick={() => setAgent('my-agent')}>
      Select Agent
    </button>
  );
}
```

### Workspace View - Get Active Tab

**Before:**
```typescript
<WorkspaceView
  activeTab={activeTab}
  onTabChange={(tab) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    window.history.replaceState({}, '', `?${params}`);
  }}
/>
```

**After:**
```typescript
<WorkspaceView />

function WorkspaceView() {
  const { activeTab, updateParams } = useNavigation();
  
  const handleTabChange = (tab: string) => {
    updateParams({ tab });
  };
}
```

### Chat Dock State Persistence

**Before:**
```typescript
const [isDockOpen, setIsDockOpen] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get('dock') === 'open';
});

const toggleDock = () => {
  const newState = !isDockOpen;
  setIsDockOpen(newState);
  const params = new URLSearchParams(window.location.search);
  if (newState) {
    params.set('dock', 'open');
  } else {
    params.delete('dock');
  }
  window.history.replaceState({}, '', `?${params}`);
};
```

**After:**
```typescript
const { isDockOpen, setDockState } = useNavigation();

const toggleDock = () => {
  setDockState(!isDockOpen);
};
```

## Migration Guide

### Step 1: Remove Props

Components no longer need these props:
- `apiBase` - Use `useApiBase()` from ConfigContext
- `selectedAgent` - Use `useNavigation().selectedAgent`
- `selectedWorkspace` - Use `useNavigation().selectedWorkspace`
- `activeConversation` - Use `useNavigation().activeConversation`
- `isDockOpen`, `isDockMaximized` - Use `useNavigation()`

### Step 2: Update Component

```typescript
// Before
function MyComponent({ apiBase, selectedAgent }: Props) {
  // ...
}

// After
function MyComponent() {
  const apiBase = useApiBase();
  const { selectedAgent } = useNavigation();
  // ...
}
```

### Step 3: Update Parent

```typescript
// Before
<MyComponent apiBase={API_BASE} selectedAgent={selectedAgent} />

// After
<MyComponent />
```

## Integration with Existing Contexts

### ConfigContext
- Provides `useApiBase()` hook
- Returns API base URL from env or config

### NavigationContext
- Provides `useNavigation()` hook
- Manages all routing state

### Other Contexts
- Can use `useApiBase()` and `useNavigation()` internally
- No need to pass these as props

## Example: Fully Decoupled ChatDock

```typescript
function ChatDock() {
  // Get everything from contexts
  const apiBase = useApiBase();
  const { selectedAgent, activeConversation, isDockOpen, setDockState } = useNavigation();
  const agents = useAgents(apiBase);
  const models = useModels(apiBase);
  const { showToast } = useToast();
  
  // No props needed!
  return (
    <div className={isDockOpen ? 'open' : 'closed'}>
      {/* Chat UI */}
    </div>
  );
}

// Usage - no props!
<ChatDock />
```

## Benefits Summary

1. **Cleaner components** - No prop drilling
2. **Easier testing** - Mock contexts instead of props
3. **Better DX** - IntelliSense for all navigation state
4. **URL sync** - Automatic persistence to URL
5. **Browser integration** - Back/forward buttons work automatically
