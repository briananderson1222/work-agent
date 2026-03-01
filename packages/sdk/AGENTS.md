# Query Factories Pattern

## Overview

Query factories are the **single source of truth** for all data fetching in the SDK. They define query keys, fetch functions, and cache configuration in one place.

## Why Query Factories?

**Problem:** Without query factories, fetch logic is duplicated:
```typescript
// ❌ BAD - Duplicated logic
export function useAgentTools(slug: string) {
  return useQuery({
    queryKey: ['agent-tools', slug],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/agents/${slug}/tools`);
      return response.json();
    },
  });
}

// Somewhere else in a command...
const data = await queryClient.fetchQuery({
  queryKey: ['agent-tools', slug], // Duplicate key!
  queryFn: async () => {
    const response = await fetch(`${apiBase}/agents/${slug}/tools`); // Duplicate fetch!
    return response.json();
  },
});
```

**Solution:** Query factories define it once:
```typescript
// ✅ GOOD - Single source of truth
export const agentQueries = {
  tools: (slug: string) => ({
    queryKey: ['agent-tools', slug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${slug}/tools`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  }),
};

// In hooks
export function useAgentTools(slug: string) {
  return useQuery(agentQueries.tools(slug));
}

// In commands
const data = await queryClient.fetchQuery(agentQueries.tools(slug));
```

## Pattern Structure

### 1. Create Query Factory (`queryFactories.ts`)

```typescript
import { _getApiBase } from './api';

export const agentQueries = {
  // List all agents
  list: () => ({
    queryKey: ['agents'],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents`);
      if (!response.ok) throw new Error('Failed to fetch agents');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  }),

  // Get single agent
  detail: (slug: string) => ({
    queryKey: ['agent', slug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${slug}`);
      if (!response.ok) throw new Error('Failed to fetch agent');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  }),

  // Get agent tools
  tools: (slug: string) => ({
    queryKey: ['agent-tools', slug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${slug}/tools`);
      if (!response.ok) throw new Error('Failed to fetch tools');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  }),
};
```

### 2. Use in Hooks (`queries.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { agentQueries } from './queryFactories';

export function useAgents(config?: QueryConfig) {
  return useQuery({
    ...agentQueries.list(),
    ...config,
  });
}

export function useAgent(slug: string, config?: QueryConfig) {
  return useQuery({
    ...agentQueries.detail(slug),
    ...config,
  });
}

export function useAgentTools(slug: string, config?: QueryConfig) {
  return useQuery({
    ...agentQueries.tools(slug),
    ...config,
    enabled: !!slug && (config?.enabled ?? true),
  });
}
```

### 3. Use in Commands (Imperative)

```typescript
import { agentQueries } from '@stallion-ai/sdk';

registerCommand('tools', async ({ agent, queryClient }) => {
  // Uses same query factory as the hook!
  const tools = await queryClient.fetchQuery(
    agentQueries.tools(agent.slug)
  );
  
  return { type: 'ephemeral', content: `Found ${tools.length} tools` };
});
```

### 4. Export from SDK (`index.ts`)

```typescript
// Export query factories for imperative use
export { agentQueries } from './queryFactories';

// Export hooks for reactive use
export { useAgents, useAgent, useAgentTools } from './queries';
```

## Benefits

### 1. Cache Sharing
Both hooks and commands use the same cache:
```typescript
// Component fetches data
const { data } = useAgentTools('my-agent');

// Later, command reads from cache (no network request!)
const tools = await queryClient.fetchQuery(agentQueries.tools('my-agent'));
```

### 2. Type Safety
Query keys and data are co-located:
```typescript
// TypeScript knows the shape of the data
const tools: Tool[] = await queryClient.fetchQuery(agentQueries.tools(slug));
```

### 3. Easy Invalidation
Invalidate queries using the same factory:
```typescript
// Invalidate all agent queries
queryClient.invalidateQueries({ queryKey: agentQueries.list().queryKey });

// Invalidate specific agent
queryClient.invalidateQueries({ queryKey: agentQueries.detail(slug).queryKey });
```

### 4. Testability
Mock query factories in tests:
```typescript
jest.mock('./queryFactories', () => ({
  agentQueries: {
    tools: () => ({
      queryKey: ['agent-tools', 'test'],
      queryFn: async () => mockTools,
    }),
  },
}));
```

## Migration Guide

### Before (Duplicated Logic)
```typescript
// In hook
export function useAgentTools(slug: string) {
  return useApiQuery(
    ['agentTools', slug],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${slug}/tools`);
      return response.json();
    }
  );
}

// In command (duplicate!)
const response = await fetch(`${apiBase}/agents/${slug}/tools`);
const data = await response.json();
```

### After (Query Factory)
```typescript
// 1. Create factory
export const agentQueries = {
  tools: (slug: string) => ({
    queryKey: ['agent-tools', slug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${slug}/tools`);
      return response.json();
    },
  }),
};

// 2. Update hook
export function useAgentTools(slug: string) {
  return useQuery(agentQueries.tools(slug));
}

// 3. Update command
const data = await queryClient.fetchQuery(agentQueries.tools(slug));
```

## Best Practices

1. **Group by domain** - `agentQueries`, `workspaceQueries`, `conversationQueries`
2. **Consistent naming** - `list()`, `detail(id)`, `create()`, `update(id)`, `delete(id)`
3. **Include staleTime** - Define cache duration in the factory
4. **Error handling** - Throw errors in queryFn for React Query to catch
5. **Type parameters** - Use generics for typed responses

## References

- [React Query: Query Factories](https://tanstack.com/query/latest/docs/react/community/lukemorales-query-key-factory)
- [React Query: Best Practices](https://tkdodo.eu/blog/effective-react-query-keys)
