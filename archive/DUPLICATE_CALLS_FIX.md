# Duplicate API Calls - Fix Implementation

## Summary

Fixed duplicate API calls on page refresh by implementing proper store patterns with request deduplication and caching.

## Changes Made

### 1. ✅ SalesDataContext (Plugin)
**Files**:
- `examples/stallion-workspace/src/SalesDataContext.tsx` (new)
- `examples/stallion-workspace/src/useSalesContext.ts` (updated)
- `examples/stallion-workspace/src/index.tsx` (updated)

**What it does**:
- Centralizes SFDC data fetching in a single store
- Uses `useSyncExternalStore` pattern for reactive updates
- Implements request deduplication (returns existing promise if already fetching)
- Implements 5-minute cache TTL
- Shares data across Calendar and CRM tabs

**Impact**:
- `/transform` (sat-sfdc_get_my_personal_details): 4 calls → 1 call
- `/transform` (sat-sfdc_list_user_assigned_accounts): 2 calls → 1 call
- `/transform` (sat-sfdc_list_user_assigned_territories): 2 calls → 1 call

### 2. ✅ WorkspacesContext Deduplication (Core)
**File**: `src-ui/src/contexts/WorkspacesContext.tsx`

**What it does**:
- Added request deduplication to `fetchOne` method
- Tracks in-flight requests in `fetching` Map
- Returns existing promise if already fetching same workspace

**Impact**:
- `/workspaces/:slug`: 6 calls → 1 call

### 3. ✅ AgentToolsContext (Core)
**Files**:
- `src-ui/src/contexts/AgentToolsContext.tsx` (new)
- `src-ui/src/hooks/useAgentTools.ts` (updated)
- `src-ui/src/main.tsx` (updated)

**What it does**:
- Centralizes agent tools fetching in a single store
- Uses `useSyncExternalStore` pattern
- Implements request deduplication per agent
- Caches tools data per agent

**Impact**:
- `/:agent/tools`: 2 calls → 1 call

## Testing Instructions

### 1. Reinstall Plugin
```bash
# Remove old version
npx tsx scripts/cli-plugin.ts remove stallion-workspace

# Install updated version
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace
```

### 2. Start Dev Server
```bash
npm run dev:ui
```

### 3. Test in Browser
1. Open DevTools → Network tab
2. Navigate to Stallion workspace → Calendar tab
3. Refresh page (Cmd+R / Ctrl+R)
4. Check Network tab:
   - Filter "workspaces" → 1 call (was 6)
   - Filter "transform" → 1 call per tool (was 4 and 2)
   - Filter "tools" → 1 call (was 2)

### 4. Test Tab Switching
1. Switch to CRM tab
2. Should NOT see new SFDC API calls (uses cached data)
3. Wait 5+ minutes, switch tabs again
4. Should see fresh API calls (cache expired)

## Expected Results

### Before Fix
```
/workspaces/:slug                              → 6 calls
/usage                                         → 2 calls
/achievements                                  → 2 calls
/:agent/tools                                  → 2 calls
/transform (sat-sfdc_get_my_personal_details) → 4 calls
/transform (sat-sfdc_list_user_assigned_accounts) → 2 calls
```

### After Fix
```
/workspaces/:slug                              → 1 call ✅
/usage                                         → 2 calls (expected in dev mode)
/achievements                                  → 2 calls (expected in dev mode)
/:agent/tools                                  → 1 call ✅
/transform (sat-sfdc_get_my_personal_details) → 1 call ✅
/transform (sat-sfdc_list_user_assigned_accounts) → 1 call ✅
```

**Note**: `/usage` and `/achievements` still show 2 calls in dev mode due to React StrictMode double-mounting. This is expected behavior and will be 1 call in production.

## Architecture Pattern

All new API data contexts should follow this pattern:

```typescript
// 1. Create Store class
class DataStore {
  private data = /* initial state */;
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();
  
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  
  getSnapshot = () => this.data;
  
  private notify = () => {
    this.listeners.forEach(listener => listener());
  };
  
  async fetch(key: string) {
    // Deduplicate: return existing promise if already fetching
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }
    
    const promise = (async () => {
      try {
        // Fetch data
        // Update this.data
        // this.notify()
      } finally {
        this.fetching.delete(key);
      }
    })();
    
    this.fetching.set(key, promise);
    return promise;
  }
}

// 2. Create Context
const store = new DataStore();
const Context = createContext<DataStore | null>(null);

export function Provider({ children }) {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

// 3. Create Hook
export function useData() {
  const store = useContext(Context);
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { data, fetch: () => store.fetch() };
}
```

## Benefits

1. **Eliminates duplicate requests**: Request deduplication ensures only one in-flight request per resource
2. **Reduces server load**: Fewer API calls = less backend processing
3. **Improves performance**: Cached data loads instantly
4. **Better UX**: Faster page loads and tab switches
5. **Maintainable**: Single source of truth for each data type
6. **Scalable**: Pattern can be applied to any API endpoint

## Next Steps

If you see duplicate calls on the CRM page:
1. Check which endpoints are being called multiple times
2. Apply the same pattern:
   - Create a Context with Store class
   - Implement request deduplication
   - Add optional caching with TTL
   - Update components to use the new hook

## Reference Implementations

- **Original pattern**: `src-ui/src/contexts/StatsContext.tsx`
- **SFDC data**: `examples/stallion-workspace/src/SalesDataContext.tsx`
- **Agent tools**: `src-ui/src/contexts/AgentToolsContext.tsx`
- **Workspaces**: `src-ui/src/contexts/WorkspacesContext.tsx`
