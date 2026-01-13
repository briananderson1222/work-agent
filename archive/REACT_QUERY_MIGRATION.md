# React Query Migration

## What Changed

Migrated `SalesDataContext` from manual store pattern to React Query.

### Before (150 lines)
```typescript
class SalesDataStore {
  private data = ...;
  private listeners = ...;
  private fetching = ...;
  private cacheTTL = ...;
  
  subscribe = ...;
  getSnapshot = ...;
  fetch() { /* 50 lines of cache/dedupe logic */ }
}

// Component
const hasFetchedRef = useRef(false);
useEffect(() => {
  if (!hasFetchedRef.current) {
    hasFetchedRef.current = true;
    fetchSalesData();
  }
}, [fetchSalesData]);
```

### After (30 lines)
```typescript
// Hook
export function useSalesData() {
  return useQuery({
    queryKey: ['salesData'],
    queryFn: async () => {
      // Fetch logic
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Component
const salesContext = useSalesContext(); // Auto-fetches, caches, dedupes
```

## Key Benefits

1. **No manual fetch** - React Query auto-fetches on mount
2. **No useRef hack** - React Query handles StrictMode correctly
3. **No manual cache** - Built-in TTL-based caching
4. **No manual deduplication** - Automatic request deduplication
5. **80% less code** - 150 lines → 30 lines

## SDK Integration

React Query hooks exported through SDK for plugins:

```typescript
// packages/sdk/src/index.ts
export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

Plugins can now use:
```typescript
import { useQuery, transformTool } from '@stallion-ai/sdk';

export function useSalesData() {
  return useQuery({
    queryKey: ['salesData'],
    queryFn: () => transformTool(...),
  });
}
```

## Local State Separation

**API data** → React Query:
- `myDetails`, `myTerritories`, `myAccounts`

**Local state** → Store:
- `sfdcCache` (per-meeting SFDC context)
- `loggedActivities` (per-meeting logged activities)

```typescript
// API data
const { data } = useSalesData();

// Local state
const { sfdcCache, setSfdcCache } = useLocalSalesState();
```

## Testing

```bash
# Reinstall plugin
npx tsx scripts/cli-plugin.ts remove stallion-workspace
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace

# Start dev server
npm run dev:ui

# Test: Refresh Calendar page
# Expected: 1 API call (not 2x or 4x)
# Switch tabs: 0 API calls (uses cache)
# Wait 5min: Fresh API call (cache expired)
```

## Next Steps

Migrate other contexts:
- [ ] WorkspacesContext
- [ ] AgentsContext
- [ ] ConversationsContext
- [ ] ModelsContext
- [ ] ToolsContext

Each migration will reduce code by ~80% and eliminate manual cache/dedupe logic.
