# React Query Migration Status

**Last Updated:** 2025-12-14

## Overview

We're migrating from manual state management (stores with `useSyncExternalStore`) to React Query for all API data. This provides automatic caching, deduplication, and a consistent pattern across the codebase.

## Architecture Pattern (MVVM)

```
Data Layer (Query Hooks)
  ↓
ViewModel Layer (Business Logic Hooks)
  ↓
View Layer (Components)
```

### Pattern Details

**1. Data Layer** - Reusable query hooks that fetch and cache data:
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

### Benefits

- **Reusable data hooks**: Multiple ViewModels can use same queries
- **Automatic deduplication**: React Query caches by key
- **Separation of concerns**: Data fetching ≠ business logic ≠ rendering
- **Testable**: Test ViewModels independently of components
- **Type-safe**: Full TypeScript support

## Migration Status

### ✅ Completed

| Context | Status | Notes |
|---------|--------|-------|
| **AnalyticsContext** | ✅ Migrated | Uses `useUsageQuery`, `useAchievementsQuery` from SDK |
| **WorkspacesContext** | ✅ Migrated | Uses store with deduplication (pre-React Query pattern) |
| **SalesDataContext** | ✅ Migrated | Plugin layer - uses granular queries (`useMyPersonalDetails`, `useMyAccounts`, `useMyTerritories`) |
| **AgentsContext** | ✅ Migrated | Uses `useAgentsQuery()` from SDK, mutations for create/update/delete |
| **AppDataContext** | ✅ Migrated | Uses `useModelsQuery()` from SDK with transform logic |
| **ConversationsContext** | ✅ Partially Migrated | List uses `useConversationsQuery()`, streaming/messages logic kept as-is |

### 🔄 In Progress / Needs Migration

| Context | Current Pattern | Migration Priority | Notes |
|---------|----------------|-------------------|-------|
| **WorkflowsContext** | Store + useSyncExternalStore | 🟡 Medium | Has deduplication, but should migrate to React Query |
| **MonitoringContext** | Store + useSyncExternalStore | 🟡 Medium | Real-time stats - may need polling or SSE |
| **ConfigContext** | Store + useSyncExternalStore | 🟢 Low | App config - rarely changes |

### ✅ No Migration Needed (UI State Only)

- **StreamingContext** - Manages streaming message state (not API data)
- **ActiveChatsContext** - Complex UI state machine for chat sessions
- **ToastContext** - UI notifications
- **ApiBaseContext** - Configuration value

## Next Steps

### Phase 1: Core SDK Queries (High Priority)

**Goal:** Expose all core API endpoints as SDK query hooks

1. **Create SDK query hooks** (`packages/sdk/src/queries.ts`):
   ```typescript
   export function useAgentsQuery() {
     return useApiQuery(['agents'], async () => {
       const apiBase = _getApiBase();
       const res = await fetch(`${apiBase}/agents`);
       return res.json();
     });
   }
   
   export function useModelsQuery() {
     return useApiQuery(['models'], async () => {
       const apiBase = _getApiBase();
       const res = await fetch(`${apiBase}/bedrock/models`);
       return res.json();
     });
   }
   
   export function useConversationsQuery(agentSlug: string | undefined) {
     return useApiQuery(['conversations', agentSlug], async () => {
       const apiBase = _getApiBase();
       const res = await fetch(`${apiBase}/agents/${agentSlug}/conversations`);
       return res.json();
     }, { enabled: !!agentSlug });
   }
   
   export function useWorkflowsQuery(agentSlug?: string) {
     return useApiQuery(['workflows', agentSlug], async () => {
       const apiBase = _getApiBase();
       const endpoint = agentSlug 
         ? `/agents/${agentSlug}/workflows/files`
         : '/workflows';
       const res = await fetch(`${apiBase}${endpoint}`);
       return res.json();
     });
   }
   ```

2. **Export from SDK** (`packages/sdk/src/index.ts`):
   ```typescript
   export {
     useAgentsQuery,
     useModelsQuery,
     useConversationsQuery,
     useWorkflowsQuery,
     useUsageQuery,
     useAchievementsQuery,
   } from './queries';
   ```

3. **Rebuild SDK**:
   ```bash
   cd packages/sdk && npm run build
   ```

### Phase 2: Migrate Core Contexts (High Priority)

**Goal:** Replace manual stores with SDK query hooks

1. **AgentsContext** → Use `useAgentsQuery()`:
   ```typescript
   // Before: Manual store with fetch logic
   class AgentsStore { ... }
   
   // After: Simple wrapper around SDK hook
   export function useAgents() {
     const { data, isLoading, error } = useAgentsQuery();
     return {
       agents: data?.data || [],
       loading: isLoading,
       error,
     };
   }
   ```

2. **AppDataContext** → Use `useModelsQuery()`:
   ```typescript
   export function useModels() {
     const { data, isLoading } = useModelsQuery();
     
     const models = useMemo(() => {
       if (!data?.success) return [];
       // Transform logic here
       return processedModels;
     }, [data]);
     
     return { models, isLoadingModels: isLoading };
   }
   ```

3. **ConversationsContext** → Use `useConversationsQuery()`:
   ```typescript
   export function useConversations(agentSlug: string) {
     const { data, isLoading } = useConversationsQuery(agentSlug);
     return {
       conversations: data?.data || [],
       loading: isLoading,
     };
   }
   ```

### Phase 3: Migrate Remaining Contexts (Medium Priority)

1. **WorkflowsContext** → Use `useWorkflowsQuery()`
2. **MonitoringContext** → Consider polling strategy with React Query:
   ```typescript
   export function useMonitoringStats() {
     return useApiQuery(['monitoring', 'stats'], fetchStats, {
       staleTime: 0, // Always fresh
       refetchInterval: 5000, // Poll every 5s
     });
   }
   ```

### Phase 4: Plugin Layer Patterns (Ongoing)

**Goal:** Ensure all plugins follow the MVVM pattern

1. **Data hooks** in plugin (`useSalesQueries.ts`)
2. **ViewModel hooks** per component (`useCRMViewModel.ts`, `useCalendarViewModel.ts`)
3. **Components** just render

## Testing Strategy

For each migrated context:

1. **Verify deduplication**: Multiple components using same hook should trigger only one API call
2. **Check caching**: Navigate away and back - should use cached data
3. **Test loading states**: Components should show loading UI correctly
4. **Verify error handling**: Network errors should be handled gracefully
5. **Check refetch**: Manual refresh should invalidate cache and refetch

## Common Patterns

### Dependent Queries

When one query depends on another:

```typescript
export function useMyAccounts() {
  const { data: myDetails } = useMyPersonalDetails();
  
  return useApiQuery(['sfdc', 'accounts', myDetails?.userId], 
    async () => fetchAccounts(myDetails!.userId),
    { enabled: !!myDetails?.userId } // Only run when userId available
  );
}
```

### Mutations with Cache Invalidation

When updating data:

```typescript
export function useUpdateAgent() {
  return useApiMutation(
    async (agent: Agent) => updateAgent(agent),
    {
      onSuccess: () => {
        // Invalidate agents list to refetch
        invalidateKeys: [['agents']],
      },
    }
  );
}
```

### Polling for Real-time Data

```typescript
export function useMonitoringStats() {
  return useApiQuery(['monitoring'], fetchStats, {
    staleTime: 0,
    refetchInterval: 5000, // Poll every 5s
  });
}
```

## Migration Checklist

For each context being migrated:

- [ ] Create SDK query hook in `packages/sdk/src/queries.ts`
- [ ] Export from `packages/sdk/src/index.ts`
- [ ] Rebuild SDK (`cd packages/sdk && npm run build`)
- [ ] Update context to use SDK hook
- [ ] Remove manual store/fetch logic
- [ ] Test in UI (check Network tab for deduplication)
- [ ] Update any components using the context
- [ ] Remove old store class if no longer needed
- [ ] Update documentation

## Resources

- **Pattern Documentation**: See `AGENTS.md` → "State Management" section
- **Reference Implementation**: `src-ui/src/contexts/AnalyticsContext.tsx`
- **SDK Queries**: `packages/sdk/src/queries.ts`
- **Plugin Example**: `examples/stallion-workspace/src/useSalesQueries.ts`
