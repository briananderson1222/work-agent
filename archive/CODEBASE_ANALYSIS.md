# Codebase Analysis Report

## Executive Summary

This analysis identifies architectural issues, DRY violations, separation of concerns problems, and SDK boundary gaps in the work-agent codebase. The findings are organized by severity and include effort estimates for remediation.

---

## 1. DRY Violations & Code Duplication

### 1.1 Massive Monolithic Components

| File | Size | Lines (est.) | Issue |
|------|------|--------------|-------|
| `Calendar.tsx` | 147KB | ~4,000 | Single component with data fetching, caching, UI, business logic |
| `ChatDock.tsx` | 103KB | ~2,800 | Contains 5+ sub-components, inline styles, streaming logic |
| `CRM.tsx` | 94KB | ~2,500 | Similar to Calendar - monolithic |
| `MonitoringView.tsx` | 87KB | ~2,300 | Complex state management mixed with rendering |
| `SettingsView.tsx` | 54KB | ~1,400 | Multiple tabs, CRUD operations inline |
| `voltagent-runtime.ts` | 145KB | ~3,800 | Entire backend in one file |

**Impact**: Hard to test, maintain, and reuse. Changes risk breaking unrelated functionality.

### 1.2 Duplicated Patterns

#### Cache Management (repeated in 3+ files)
```typescript
// Pattern repeated in Calendar.tsx, CRM.tsx, and others
function getFromCache<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        return data;
      }
      sessionStorage.removeItem(key);
    }
  } catch { }
  return null;
}
```

#### State Restoration Pattern (repeated in Calendar, CRM)
```typescript
// Both Calendar.tsx and CRM.tsx have nearly identical patterns
const initialState = useMemo(() => {
  const storedState = activeTab ? getTabState('calendar') : '';
  const params = new URLSearchParams(storedState);
  // ... parse state
}, [activeTab]);

useEffect(() => {
  if (activeTab) {
    const storedState = getTabState('calendar');
    // ... restore state
  }
}, [activeTab, getTabState]);
```

#### "Send to Chat" Pattern (repeated in Calendar, CRM)
```typescript
// Nearly identical in both files
const sendToChat = useCallback((message: string) => {
  const resolvedSlug = resolveAgentName('work-agent');
  const agent = agents.find(a => a.slug === resolvedSlug);
  if (!agent) return;
  const sessionId = createChatSession(resolvedSlug, agent.name);
  setDockState(true);
  setActiveChat(sessionId);
  sendMessage(sessionId, resolvedSlug, undefined, message);
}, [agents, createChatSession, setDockState, setActiveChat, sendMessage]);
```

### 1.3 Inline Styles Proliferation

`ChatDock.tsx` contains 100+ inline style objects like:
```typescript
style={{ 
  padding: '2px 6px', 
  fontSize: '0.7em',
  background: 'var(--color-primary)',
  color: 'white',
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontWeight: 400,
  marginLeft: '0.25rem'
}}
```

**Recommendation**: Extract to CSS classes or use a consistent styling approach.

---

## 2. Separation of Concerns Issues

### 2.1 Business Logic in UI Components

**ChatDock.tsx** mixes:
- Session management logic
- Message streaming/parsing
- Tool approval workflow
- History navigation
- Keyboard shortcuts
- Drag-to-resize logic
- Scroll management
- All rendering

**Calendar.tsx** mixes:
- API calls via `transformTool`
- Response parsing (`parseCalendarResponse`)
- Cache management
- Meeting provider detection (`detectMeetingProvider`)
- Name formatting (`formatOrganizerName`)
- All UI rendering

### 2.2 Missing ViewModel Layer

AGENTS.md documents this pattern but it's not followed:
```
Data Layer (Queries) → ViewModel Layer → View Layer
```

**Current state**:
- `useSalesQueries.ts` exists (good - Data Layer)
- No ViewModel hooks for Calendar or CRM
- Components directly consume queries and add business logic inline

**Example of what's missing** (from AGENTS.md):
```typescript
// useCRMViewModel.ts - DOESN'T EXIST
export function useCRMViewModel() {
  const { data: myDetails } = useMyPersonalDetails();
  const { data: myAccounts = [] } = useMyAccounts(myDetails?.userId);
  
  // Derived state
  const userDetails = myDetails ? {
    alias: myDetails.name,
    sfdcId: myDetails.userId
  } : null;
  
  return { userDetails, processedAccounts, isLoading: !myDetails };
}
```

### 2.3 Context Proliferation

20+ context files in `src-ui/src/contexts/`:
- `ActiveChatsContext.tsx` - 26KB
- `ConversationsContext.tsx` - 17KB
- `NavigationContext.tsx` - 8KB
- `ToastContext.tsx` - 10KB
- `MonitoringContext.tsx` - 8KB
- Plus 15+ more

Many could be consolidated or replaced with React Query patterns.

### 2.4 Inconsistent Data Fetching

Three different patterns in use:
1. **React Query** (via SDK): `useApiQuery`, `useWorkspacesQuery`
2. **Custom Store + useSyncExternalStore**: `ConversationsStore`, `ActiveChatsStore`
3. **Direct fetch**: Many components still use `fetch()` directly

AGENTS.md states: "Use React Query for ALL API data" - not followed.

---

## 3. SDK/Plugin Boundary Issues

### 3.1 Incomplete SDK Implementation

`packages/sdk/src/hooks.ts` exports hooks that throw errors:
```typescript
export function useSlashCommandHandler() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.slashCommandHandler) throw new Error('useSlashCommandHandler not available');
  return sdk.hooks.slashCommandHandler();
}
```

But `SDKAdapter.tsx` doesn't wire up all hooks:
```typescript
const sdkValue: SDKContextValue = {
  contexts: {
    agents: { useAgents: () => agents },
    // ... some contexts
  },
  hooks: {
    // Many hooks NOT wired up
  }
};
```

### 3.2 SDK vs Core Import Confusion

AGENTS.md states:
> Workspace components MUST only import from `@stallion-ai/sdk`

But plugins need functionality not exposed by SDK:
- `useWorkspaceNavigation` - partially available
- `useSlashCommandHandler` - throws error
- `useToolApproval` - throws error

### 3.3 Plugin Installation Workflow Issues

The plugin system copies files to `src-ui/src/workspaces/` but:
- No build step for plugins
- No version management
- Direct file copying bypasses npm package resolution

---

## 4. Backend Architecture Issues

### 4.1 Monolithic Runtime File

`voltagent-runtime.ts` (145KB) contains:
- HTTP route handlers
- Agent lifecycle management
- MCP tool management
- Streaming pipeline
- Monitoring/analytics
- CRUD operations for agents, tools, workspaces, workflows

Should be split into:
- `routes/agents.ts`
- `routes/tools.ts`
- `routes/workspaces.ts`
- `routes/analytics.ts`
- `services/agent-manager.ts`
- `services/mcp-manager.ts`

### 4.2 Route Handler Duplication

Routes defined inline in `configureApp`:
```typescript
app.get('/api/agents', async (c) => { ... });
app.post('/agents', async (c) => { ... });
app.put('/agents/:slug', async (c) => { ... });
app.delete('/agents/:slug', async (c) => { ... });
// ... 50+ more routes
```

Should use Hono's route grouping and separate route files.

### 4.3 Missing Service Layer

Business logic embedded in route handlers:
```typescript
app.delete('/agents/:slug', async (c) => {
  // Dependency check logic
  const dependentWorkspaces = await this.configLoader.getWorkspacesUsingAgent(slug);
  if (dependentWorkspaces.length > 0) { ... }
  
  // Cleanup logic
  if (this.activeAgents.has(slug)) {
    this.activeAgents.delete(slug);
  }
  
  // Persistence
  await this.configLoader.deleteAgent(slug);
  
  // Reload
  await this.initialize();
});
```

Should be: `await agentService.deleteAgent(slug);`

---

## 5. Prioritized Remediation Plan

### Phase 1: Quick Wins (1-2 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Extract inline styles to CSS classes | 3 days | Medium |
| Create shared cache utility | 1 day | Medium |
| Create `useSendToChat` hook | 0.5 days | Low |
| Create `useStateRestoration` hook | 1 day | Medium |

### Phase 2: Component Decomposition (2-4 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Split ChatDock into sub-components | 5 days | High |
| Extract ChatDock business logic to hooks | 3 days | High |
| Create Calendar ViewModel | 2 days | Medium |
| Create CRM ViewModel | 2 days | Medium |
| Split Calendar.tsx into components | 4 days | Medium |
| Split CRM.tsx into components | 4 days | Medium |

### Phase 3: SDK Completion (2-3 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Wire up missing SDK hooks | 3 days | High |
| Document SDK API contract | 2 days | Medium |
| Add SDK integration tests | 3 days | High |
| Create plugin development guide | 2 days | Medium |

### Phase 4: Backend Refactoring (3-4 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Extract routes to separate files | 3 days | Medium |
| Create AgentService | 2 days | High |
| Create MCPService | 2 days | High |
| Create WorkspaceService | 2 days | Medium |
| Add service layer tests | 5 days | High |

### Phase 5: Data Layer Consolidation (2-3 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Migrate ConversationsStore to React Query | 3 days | High |
| Migrate ActiveChatsStore to React Query | 3 days | High |
| Consolidate contexts | 3 days | Medium |
| Update AGENTS.md with patterns | 1 day | Low |

---

## 6. Recommended File Structure

### Frontend
```
src-ui/src/
├── components/           # Pure UI components
│   ├── chat/
│   │   ├── ChatDock.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   ├── ToolCallDisplay.tsx
│   │   └── ReasoningSection.tsx
│   └── ...
├── hooks/
│   ├── queries/          # React Query hooks
│   ├── viewmodels/       # ViewModel hooks
│   └── utils/            # Utility hooks
├── services/             # API service layer
├── utils/                # Pure utility functions
└── views/                # Page-level components
```

### Backend
```
src-server/
├── routes/
│   ├── agents.ts
│   ├── tools.ts
│   ├── workspaces.ts
│   └── analytics.ts
├── services/
│   ├── agent-service.ts
│   ├── mcp-service.ts
│   └── workspace-service.ts
├── runtime/
│   └── voltagent-runtime.ts  # Core VoltAgent integration only
└── domain/
```

---

## 7. Key Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Largest component file | 147KB | <20KB |
| Inline style instances | ~200 | 0 |
| SDK hooks throwing errors | ~10 | 0 |
| Direct fetch calls in components | ~30 | 0 |
| Backend routes in single file | ~50 | 0 |

---

## Next Steps

1. Review this analysis with the team
2. Prioritize based on current pain points
3. Create tickets for Phase 1 tasks
4. Establish code review guidelines to prevent regression
