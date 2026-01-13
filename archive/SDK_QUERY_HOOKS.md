# SDK Query Hooks

## Philosophy

Plugins shouldn't need to know about React Query. The SDK provides simple hooks that handle all the complexity.

## Plugin Usage

```typescript
import { useApiQuery, transformTool } from '@stallion-ai/sdk';

// Simple: just provide cache key and fetch function
export function useSalesData() {
  return useApiQuery(
    ['salesData'], // Cache key
    async () => {
      const details = await transformTool('work-agent', 'satSfdc_getMyPersonalDetails', {}, 'data => data');
      // ... fetch logic
      return { myDetails, myTerritories, myAccounts };
    }
    // Optional: { staleTime: 10 * 60 * 1000 } to override default
  );
}

// Component
const { data, isLoading, error } = useSalesData();
```

## SDK Hooks

### `useApiQuery(key, fetchFn, config?)`
Generic query hook for any API call.

**Parameters**:
- `key`: Cache key (array of strings/numbers/objects)
- `fetchFn`: Async function that returns data
- `config`: Optional `{ staleTime?, gcTime?, enabled? }`

**Returns**: `{ data, isLoading, error, refetch }`

### `useTransformTool(agent, tool, args, transform, config?)`
Query hook for transform tool calls. Auto-generates cache key.

```typescript
const { data } = useTransformTool(
  'work-agent',
  'satSfdc_getMyPersonalDetails',
  {},
  'data => data'
);
```

### `useInvokeAgent(agent, content, options?, config?)`
Query hook for agent invocations. Auto-generates cache key.

```typescript
const { data } = useInvokeAgent(
  'work-agent',
  'Summarize this data',
  { schema: MySchema }
);
```

### `useApiMutation(mutationFn, options?)`
Mutation hook for updates/creates/deletes.

```typescript
const mutation = useApiMutation(
  (newData) => fetch('/api/data', { method: 'POST', body: JSON.stringify(newData) }),
  {
    onSuccess: () => console.log('Success!'),
    invalidateKeys: [['salesData']] // Refetch these queries
  }
);

mutation.mutate({ name: 'New Item' });
```

### `useInvalidateQuery()`
Manually invalidate cache.

```typescript
const invalidate = useInvalidateQuery();
invalidate(['salesData']); // Force refetch
```

## Configuration

### Stale Time
How long data is considered fresh (no refetch).

```typescript
useApiQuery(key, fetchFn, { staleTime: 10 * 60 * 1000 }) // 10 minutes
```

**Defaults**: 5 minutes

### GC Time
How long unused data stays in cache.

```typescript
useApiQuery(key, fetchFn, { gcTime: 30 * 60 * 1000 }) // 30 minutes
```

**Defaults**: 10 minutes

### Enabled
Conditionally enable/disable query.

```typescript
useApiQuery(key, fetchFn, { enabled: !!userId }) // Only fetch if userId exists
```

## Cache Keys

Cache keys determine when data is shared/refetched.

**Same key = shared data**:
```typescript
// Both components get same cached data
useApiQuery(['salesData'], fetchFn);
useApiQuery(['salesData'], fetchFn);
```

**Different key = separate data**:
```typescript
useApiQuery(['salesData', userId], fetchFn); // Per-user cache
useApiQuery(['salesData', 'user-123'], fetchFn);
useApiQuery(['salesData', 'user-456'], fetchFn);
```

**Auto-generated keys**:
```typescript
// SDK generates: ['transform', 'work-agent', 'satSfdc_getMyPersonalDetails', {}]
useTransformTool('work-agent', 'satSfdc_getMyPersonalDetails', {}, 'data => data');
```

## Benefits

1. **No React Query knowledge needed** - Just use SDK hooks
2. **Auto-caching** - Data cached by key
3. **Auto-deduplication** - Multiple calls = 1 request
4. **StrictMode safe** - No double-fetch issues
5. **Type-safe** - Full TypeScript support

## Migration Example

### Before (Manual Store)
```typescript
// 150 lines of store code
class SalesDataStore {
  private data = ...;
  private listeners = ...;
  private fetching = ...;
  subscribe = ...;
  fetch() { /* cache/dedupe logic */ }
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

### After (SDK Hook)
```typescript
// 10 lines
export function useSalesData() {
  return useApiQuery(['salesData'], async () => {
    // Fetch logic
  });
}

// Component
const { data } = useSalesData(); // That's it!
```

## Testing

```bash
# Reinstall plugin
npx tsx scripts/cli-plugin.ts remove stallion-workspace
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace

# Start dev
npm run dev:ui

# Test: Refresh page → 1 API call (not 2x or 4x)
```
