# Redux-Like State Management Pattern

## Philosophy

**Subscription ≠ Action**

- **Subscribing to data** = reading current state (no side effects)
- **Dispatching actions** = explicitly triggering data fetches/updates
- **Caching layer** = TTL-based, prevents redundant fetches within action logic

## Pattern Structure

### 1. Store Class

```typescript
class DataStore {
  private data = /* initial state */;
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>(); // Request deduplication
  private cacheTTL = 5 * 60 * 1000; // Optional: cache TTL

  // Subscription (no side effects)
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.data;

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  // Optional: cache validation
  private isCacheValid(): boolean {
    if (!this.data.lastFetch) return false;
    return (Date.now() - this.data.lastFetch) < this.cacheTTL;
  };

  // Action: explicit fetch
  async fetch(force = false) {
    // Cache layer: return if data is fresh
    if (!force && this.isCacheValid()) {
      console.log('[Store] Using cached data');
      return;
    }

    // Request deduplication: return existing promise
    if (this.fetching.has('key')) {
      console.log('[Store] Fetch already in progress');
      return this.fetching.get('key');
    }

    this.data = { ...this.data, loading: true };
    this.notify();

    const promise = (async () => {
      try {
        // Fetch data
        const response = await fetch('/api/data');
        this.data = { ...await response.json(), loading: false, lastFetch: Date.now() };
      } catch (err) {
        this.data = { ...this.data, loading: false, error: err.message };
      } finally {
        this.fetching.delete('key');
        this.notify();
      }
    })();

    this.fetching.set('key', promise);
    return promise;
  }
}
```

### 2. Context Setup

```typescript
const store = new DataStore();

const ActionsContext = createContext<{
  fetch: (force?: boolean) => Promise<void>;
} | null>(null);

export function Provider({ children }: { children: ReactNode }) {
  const fetch = useCallback((force = false) => store.fetch(force), []);

  return (
    <ActionsContext.Provider value={{ fetch }}>
      {children}
    </ActionsContext.Provider>
  );
}
```

### 3. Hooks

```typescript
// Hook for actions (explicit fetch)
export function useDataActions() {
  const context = useContext(ActionsContext);
  if (!context) throw new Error('Must be within Provider');
  return context;
}

// Hook for data subscription (no side effects)
export function useData() {
  const data = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  return data;
}
```

### 4. Component Usage

```typescript
function MyComponent() {
  // Subscribe to data (no fetch)
  const data = useData();
  const { fetch } = useDataActions();
  
  // Explicit action: fetch on mount (once)
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetch(); // Will use cache if valid
    }
  }, [fetch]);
  
  return <div>{data.loading ? 'Loading...' : data.value}</div>;
}
```

## Key Benefits

### 1. No Double-Fetch in Dev Mode
- `useRef` prevents `useEffect` from running twice
- Even if it runs twice, cache layer prevents redundant API calls

### 2. Explicit Control
- Components explicitly call `fetch()` when they need data
- Other components just subscribe to updates

### 3. Request Deduplication
- Multiple simultaneous `fetch()` calls return the same promise
- Only one actual API request happens

### 4. Caching Layer
- TTL-based cache prevents unnecessary refetches
- Configurable per endpoint (e.g., 5min for user data, 30s for real-time data)
- `force` parameter bypasses cache when needed

### 5. Separation of Concerns
- **Actions** = side effects (fetch, update, delete)
- **Subscriptions** = reactive reads (no side effects)
- **Store** = single source of truth

## Migration Guide

### Before (Auto-fetch in hook)
```typescript
export function useData() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // ❌ Runs twice in dev mode
    fetch('/api/data').then(setData);
  }, []);
  
  return data;
}
```

### After (Redux-like pattern)
```typescript
// Store
class DataStore {
  async fetch() {
    if (this.isCacheValid()) return; // ✅ Cache layer
    if (this.fetching.has('key')) return this.fetching.get('key'); // ✅ Deduplication
    // ... fetch logic
  }
}

// Hook for subscription
export function useData() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// Hook for actions
export function useDataActions() {
  return { fetch: () => store.fetch() };
}

// Component
function MyComponent() {
  const data = useData(); // ✅ Just subscribe
  const { fetch } = useDataActions();
  
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetch(); // ✅ Explicit action, runs once
    }
  }, [fetch]);
}
```

## Implemented Examples

### 1. SalesDataContext (Plugin)
**File**: `examples/stallion-workspace/src/SalesDataContext.tsx`

- Fetches SFDC data (personal details, territories, accounts)
- 5-minute cache TTL
- Request deduplication
- Explicit `fetch()` action in Calendar component

### 2. WorkspacesContext (Core)
**File**: `src-ui/src/contexts/WorkspacesContext.tsx`

- Fetches workspace configurations
- Request deduplication per workspace
- Explicit `fetchOne()` action in WorkspaceView

### 3. AgentToolsContext (Core)
**File**: `src-ui/src/contexts/AgentToolsContext.tsx`

- Fetches agent tools
- Request deduplication per agent
- Explicit `fetch()` action in useAgentTools hook

## Customization

### Cache TTL
```typescript
class DataStore {
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  
  // Or make it configurable
  constructor(cacheTTL = 5 * 60 * 1000) {
    this.cacheTTL = cacheTTL;
  }
}
```

### Force Refresh
```typescript
// In component
const { fetch } = useDataActions();

// Normal fetch (uses cache)
fetch();

// Force refresh (bypasses cache)
fetch(true);
```

### Multiple Keys
```typescript
class DataStore {
  async fetch(key: string) {
    if (this.fetching.has(key)) {
      return this.fetching.get(key);
    }
    // ... fetch logic per key
  }
}
```

## Testing

### Before Fix
```
Page refresh → 6 API calls to /workspaces/:slug
Page refresh → 4 API calls to /transform (SFDC)
```

### After Fix
```
Page refresh → 1 API call to /workspaces/:slug
Page refresh → 1 API call to /transform (SFDC)
Switch tabs → 0 API calls (uses cache)
Wait 5min + switch tabs → 1 API call (cache expired)
```

## Best Practices

1. **Always use `useRef` for one-time fetches**
   ```typescript
   const hasFetchedRef = useRef(false);
   useEffect(() => {
     if (!hasFetchedRef.current) {
       hasFetchedRef.current = true;
       fetch();
     }
   }, [fetch]);
   ```

2. **Separate actions from subscriptions**
   - `useDataActions()` → actions (fetch, update, delete)
   - `useData()` → subscription (read-only)

3. **Implement caching for expensive operations**
   - User data: 5-10 minutes
   - Configuration: 10-30 minutes
   - Real-time data: 10-30 seconds

4. **Use request deduplication for all fetches**
   - Prevents race conditions
   - Reduces server load
   - Improves performance

5. **Make cache TTL configurable**
   - Different endpoints have different freshness requirements
   - Allow `force` parameter to bypass cache

## Next Steps

Apply this pattern to:
- [ ] AgentsContext
- [ ] ConversationsContext
- [ ] ModelsContext
- [ ] Any other contexts with API calls

## References

- Redux: https://redux.js.org/
- useSyncExternalStore: https://react.dev/reference/react/useSyncExternalStore
- React 18 Strict Mode: https://react.dev/reference/react/StrictMode
