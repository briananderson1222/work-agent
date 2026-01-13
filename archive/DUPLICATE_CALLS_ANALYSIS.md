# Duplicate API Calls Analysis

## Root Causes Identified

### 1. React StrictMode (Dev Mode)
- **Impact**: All components mount twice in development
- **Effect**: Every `useEffect` runs twice, doubling API calls
- **Endpoints affected**: ALL endpoints
- **Solution**: This is expected in dev mode, but we need proper deduplication

### 2. SFDC Data Fetching (useSalesContext)
- **Current**: Uses `useEffect` that runs on every component mount
- **Problem**: Both Calendar and CRM tabs call `useSalesContext`, each triggering separate API calls
- **Endpoints affected**:
  - `/transform` for `sat-sfdc_get_my_personal_details` (4x = 2 components × 2 dev mode)
  - `/transform` for `sat-sfdc_list_user_assigned_accounts` (2x = 1 component × 2 dev mode)
  - `/transform` for `sat-sfdc_list_user_assigned_territories` (2x = 1 component × 2 dev mode)
- **Solution**: ✅ Created `SalesDataContext` with `useSyncExternalStore` pattern

### 3. Workspace Fetching
- **Current**: `WorkspacesContext.fetchOne` had no request deduplication
- **Problem**: Multiple simultaneous calls to same workspace endpoint
- **Endpoints affected**: `/workspaces/:slug` (6x)
- **Solution**: ✅ Added request deduplication using `fetching` Map

### 4. Analytics Fetching
- **Current**: Already has proper store pattern
- **Problem**: Called on every mount of components using it
- **Endpoints affected**: 
  - `/usage` (2x = 1 mount × 2 dev mode)
  - `/achievements` (2x = 1 mount × 2 dev mode)
- **Solution**: Already optimal, just dev mode doubling

### 5. Agent Tools Fetching
- **Current**: `useAgentTools` hook with `useEffect`
- **Problem**: Called by multiple components (ConversationsContext, ToolManagementView)
- **Endpoints affected**: `/:agent/tools` (2x)
- **Solution**: Should create a centralized store

## Changes Made

### ✅ 1. Created SalesDataContext
**File**: `examples/stallion-workspace/src/SalesDataContext.tsx`

- Uses `useSyncExternalStore` pattern (like StatsContext)
- Implements request deduplication (returns existing promise if already fetching)
- Implements 5-minute cache TTL
- Single source of truth for SFDC data
- All components subscribe to same store

**Benefits**:
- SFDC calls reduced from 4x to 1x (even in dev mode)
- Data shared across Calendar and CRM tabs
- Automatic cache invalidation after 5 minutes

### ✅ 2. Updated useSalesContext Hook
**File**: `examples/stallion-workspace/src/useSalesContext.ts`

- Now wraps `useSalesData` from the new context
- Fetch automatically uses cache if data is fresh
- Simplified from 70 lines to 20 lines

### ✅ 3. Updated Workspace Index
**File**: `examples/stallion-workspace/src/index.tsx`

- Wrapped components with `SalesDataProvider`
- Ensures single store instance across all tabs

### ✅ 4. Fixed WorkspacesContext Deduplication
**File**: `src-ui/src/contexts/WorkspacesContext.tsx`

- Added request deduplication to `fetchOne` method
- Uses `fetching` Map to track in-flight requests
- Returns existing promise if already fetching

**Benefits**:
- Workspace calls reduced from 6x to 1x (even in dev mode)

## Remaining Optimizations

### 1. Create AgentToolsContext
**Priority**: Medium
**Impact**: Reduces `/:agent/tools` calls from 2x to 1x

```typescript
// src-ui/src/contexts/AgentToolsContext.tsx
class AgentToolsStore {
  private tools = new Map<string, ToolMapping[]>();
  private fetching = new Map<string, Promise<void>>();
  
  async fetch(apiBase: string, agentSlug: string) {
    if (this.fetching.has(agentSlug)) {
      return this.fetching.get(agentSlug);
    }
    // ... fetch and cache
  }
}
```

### 2. Add Request Deduplication Layer
**Priority**: Low (most critical endpoints now fixed)
**Impact**: Global protection against duplicate requests

Could create a global fetch wrapper that deduplicates identical requests:

```typescript
// src-ui/src/utils/dedupedFetch.ts
const pendingRequests = new Map<string, Promise<Response>>();

export async function dedupedFetch(url: string, options?: RequestInit): Promise<Response> {
  const key = `${url}:${JSON.stringify(options)}`;
  
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }
  
  const promise = fetch(url, options).finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, promise);
  return promise;
}
```

## Expected Results After Changes

### Before (on page refresh):
- `/workspaces/:slug`: 6 calls
- `/usage`: 2 calls
- `/achievements`: 2 calls
- `/:agent/tools`: 2 calls
- `/transform` (sat-sfdc_get_my_personal_details): 4 calls
- `/transform` (sat-sfdc_list_user_assigned_accounts): 2 calls

### After (on page refresh):
- `/workspaces/:slug`: 1 call (✅ fixed)
- `/usage`: 2 calls (expected in dev mode, 1 in prod)
- `/achievements`: 2 calls (expected in dev mode, 1 in prod)
- `/:agent/tools`: 2 calls (can be optimized with AgentToolsContext)
- `/transform` (sat-sfdc_get_my_personal_details): 1 call (✅ fixed)
- `/transform` (sat-sfdc_list_user_assigned_accounts): 1 call (✅ fixed)

## Testing Instructions

1. **Reinstall the plugin** (required for changes to take effect):
   ```bash
   npx tsx scripts/cli-plugin.ts remove stallion-workspace
   npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace
   ```

2. **Start the dev server**:
   ```bash
   npm run dev:ui
   ```

3. **Open browser DevTools** → Network tab

4. **Navigate to Stallion workspace** → Calendar tab

5. **Refresh the page** (Cmd+R / Ctrl+R)

6. **Check Network tab**:
   - Filter by "workspaces" → should see 1 call (down from 6)
   - Filter by "transform" → should see 1 call per tool (down from 4 and 2)
   - Filter by "usage" → should see 2 calls (expected in dev mode)

7. **Switch to CRM tab** → should NOT trigger new SFDC calls (uses cached data)

## Production vs Development

In **production** (without StrictMode):
- All calls will be exactly 1x
- No double-mounting behavior
- Cache will work optimally

In **development** (with StrictMode):
- Some calls may still be 2x due to double-mounting
- This is expected React behavior for detecting side effects
- Our deduplication ensures the 2nd call returns cached data or existing promise

## Architecture Pattern

All API data should follow this pattern:

1. **Create a Store class** with:
   - `subscribe/getSnapshot` for `useSyncExternalStore`
   - Request deduplication (track in-flight requests)
   - Optional caching with TTL
   - Notify listeners on data changes

2. **Create a Context** that:
   - Instantiates the store
   - Provides store methods via context

3. **Create a custom hook** that:
   - Subscribes to store via `useSyncExternalStore`
   - Returns data and methods
   - Optionally triggers initial fetch

4. **Components** should:
   - Use the custom hook
   - Never call API directly
   - Subscribe to store for reactive updates

**Reference implementations**:
- `src-ui/src/contexts/StatsContext.tsx` (original pattern)
- `examples/stallion-workspace/src/SalesDataContext.tsx` (new implementation)
