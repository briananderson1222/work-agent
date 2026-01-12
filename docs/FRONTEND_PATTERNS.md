# Frontend Patterns

> **For AI Agents**: If you encounter a pattern not documented here, add it after implementing. This file is the source of truth for frontend conventions.

## Architecture Overview

### 4-Layer Data Architecture

The frontend uses a 4-layer architecture for data management. **All new data fetching should follow this pattern:**

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: View Layer (Components)                           │
│  - Pure rendering, no business logic                        │
│  - Consumes ViewModel hooks                                 │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: ViewModel Layer (Custom Hooks)                    │
│  - Component-specific business logic                        │
│  - Combines multiple queries, derives state                 │
│  - Lives in plugin or component directory                   │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Query Hooks (SDK)                                 │
│  - useAgentsQuery, useWorkspacesQuery, useTransformTool     │
│  - Wraps React Query with consistent config                 │
│  - Lives in packages/sdk/src/queries.ts                     │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Query Factories (SDK)                             │
│  - Single source of truth for query definitions             │
│  - Used by hooks AND imperative fetching (slash commands)   │
│  - Lives in packages/sdk/src/queryFactories.ts              │
└─────────────────────────────────────────────────────────────┘
```

### File Organization

```
packages/sdk/src/
├── queryFactories.ts    # Layer 1: Query definitions
├── queries.ts           # Layer 2: Query hooks
├── hooks.ts             # Context wrapper hooks
├── api.ts               # Low-level API utilities
└── ...

src-ui/src/
├── components/          # Shared UI components
├── contexts/            # React contexts (wired to SDK)
├── workspaces/          # Installed plugins
└── ...

examples/my-plugin/
├── useMyViewModel.ts    # Layer 3: Plugin-specific ViewModel
├── useMyQueries.ts      # Plugin-specific query hooks (if needed)
├── MyComponent.tsx      # Layer 4: View
└── ...
```

## Layer 1: Query Factories

Query factories define the query configuration once, used by both hooks and imperative code:

```typescript
// packages/sdk/src/queryFactories.ts
export const agentQueries = {
  agent: (agentSlug: string) => ({
    queryKey: ['agent', agentSlug],
    queryFn: async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/agents/${agentSlug}`);
      if (!response.ok) throw new Error('Failed to fetch agent');
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  }),

  tools: (agentSlug: string) => ({
    queryKey: ['agent-tools', agentSlug],
    queryFn: async () => { /* ... */ },
    staleTime: 5 * 60 * 1000,
  }),

  stats: (agentSlug: string, conversationId: string) => ({
    queryKey: ['stats', agentSlug, conversationId],
    queryFn: async () => { /* ... */ },
    staleTime: 30 * 1000,
  }),
};
```

**When to add to query factories:**
- Query is used by both hooks AND imperative code (slash commands)
- Query needs consistent cache key across the app

## Layer 2: Query Hooks (SDK)

Query hooks wrap React Query and are exported from the SDK:

```typescript
// packages/sdk/src/queries.ts
import { agentQueries } from './queryFactories';

// Hook that uses a factory
export function useAgentToolsQuery(agentSlug: string | undefined, config?: QueryConfig) {
  return useQuery({
    ...agentQueries.tools(agentSlug!),
    ...config,
    enabled: !!agentSlug && (config?.enabled ?? true),
  });
}

// Hook for custom queries
export function useTransformTool<T>(
  agentSlug: string,
  toolName: string,
  toolArgs: any,
  transformFn: string,
  config?: QueryConfig<T>
) {
  return useQuery({
    queryKey: ['transform', agentSlug, toolName, toolArgs],
    queryFn: () => transformTool(agentSlug, toolName, toolArgs, transformFn),
    staleTime: config?.staleTime ?? 5 * 60 * 1000,
    enabled: config?.enabled ?? true,
  });
}
```

**Available SDK Query Hooks:**
- `useAgentsQuery` - All agents
- `useWorkspacesQuery` - All workspaces
- `useConversationsQuery(agentSlug)` - Conversations for agent
- `useModelsQuery` - Bedrock models
- `useConfigQuery` - App configuration
- `useTransformTool` - Tool invocation with transform
- `useInvokeAgent` - Agent invocation with schema
- `useApiQuery` - Generic custom queries
- `useStatsQuery` - Conversation stats

## Layer 3: ViewModel Hooks

ViewModel hooks combine queries and add business logic. **These live in the plugin/component, NOT in SDK:**

```typescript
// examples/my-plugin/useMyViewModel.ts
import { useTransformTool, useAgents } from '@stallion-ai/sdk';

export function useCRMViewModel() {
  // Use SDK query hooks
  const { data: myDetails } = useTransformTool(
    'work-agent',
    'sat-sfdc_get_my_personal_details',
    {},
    'data => data'
  );
  
  const { data: myAccounts = [] } = useTransformTool(
    'work-agent',
    'sat-sfdc_list_user_assigned_accounts',
    { userId: myDetails?.userId },
    'data => data',
    { enabled: !!myDetails?.userId }
  );
  
  // Derived state (business logic)
  const userDetails = myDetails ? {
    alias: myDetails.name,
    sfdcId: myDetails.userId
  } : null;
  
  const processedAccounts = myAccounts.map(member => ({
    ...member.account,
    _sources: [{ type: 'owner', label: userDetails?.alias }]
  }));
  
  return { 
    userDetails, 
    processedAccounts, 
    isLoading: !myDetails 
  };
}
```

**ViewModel responsibilities:**
- Combine multiple queries
- Derive computed state
- Format data for display
- Handle loading/error states

**ViewModel should NOT:**
- Contain JSX
- Make direct fetch calls (use SDK hooks)
- Be placed in SDK (plugin-specific logic stays in plugin)

## Layer 4: View Components

Components consume ViewModels and render UI:

```typescript
// examples/my-plugin/CRM.tsx
import { useCRMViewModel } from './useCRMViewModel';

export function CRM() {
  const vm = useCRMViewModel();
  
  if (vm.isLoading) return <Loading />;
  
  return (
    <div className="crm-container">
      <UserHeader user={vm.userDetails} />
      <AccountList accounts={vm.processedAccounts} />
    </div>
  );
}
```

**View responsibilities:**
- Render UI based on ViewModel state
- Handle user interactions (call ViewModel actions)
- Apply styling

**View should NOT:**
- Contain business logic
- Make API calls
- Transform data

## SDK vs Core vs Plugin Boundaries

### What belongs in SDK (`packages/sdk/`)

- Query factories (`queryFactories.ts`)
- Query hooks (`queries.ts`)
- Context wrapper hooks (`hooks.ts`)
- API utilities (`api.ts`, `transformTool`, `invokeAgent`)
- Shared types
- Generic UI components (`Button`, `Pill`, `AutoSelectModal`)

### What belongs in Core (`src-ui/src/`)

- React contexts (actual implementations)
- SDK Adapter (wires contexts to SDK)
- App Shell (Header, ChatDock, routing)
- Management Views (Settings, AgentEditor)

### What belongs in Plugins (`examples/*/`)

- ViewModel hooks (business logic)
- Plugin-specific query hooks (if SDK doesn't cover it)
- View components
- Plugin-specific utilities
- Plugin-specific styles

### Key Principle

**Plugins import from SDK only. If a plugin needs functionality not in SDK, extend the SDK.**

```typescript
// ✅ Correct - plugin imports from SDK
import { useTransformTool, useAgents, useSendToChat } from '@stallion-ai/sdk';

// ❌ Wrong - plugin imports from core
import { useAgents } from '@/contexts/AgentsContext';
```

## SDK Hook Categories

### Context Hooks (wrap core contexts)

```typescript
// Agent/Workspace data
useAgents()              // All agents
useAgent(slug)           // Single agent
useWorkspaces()          // All workspaces
useWorkspace(slug)       // Single workspace

// Chat operations
useCreateChatSession()   // Create new chat
useSendMessage()         // Send message
useSendToChat(agentSlug) // Send + open dock (convenience)

// Navigation
useNavigation()          // Full navigation state
useDockState()           // Dock open/close

// Other
useToast()               // Toast notifications
useConfig()              // App configuration
useModels()              // Available models
```

### Query Hooks (wrap React Query)

```typescript
// Pre-built queries
useAgentsQuery()
useWorkspacesQuery()
useConversationsQuery(agentSlug)
useModelsQuery()
useStatsQuery(agentSlug, conversationId)

// Tool invocation
useTransformTool(agent, tool, args, transform)
useInvokeAgent(agent, content, options)

// Generic
useApiQuery(queryKey, queryFn, config)
useApiMutation(mutationFn, options)
```

## Component Size Guidelines

| Threshold | Action |
|-----------|--------|
| < 300 lines | Acceptable |
| 300-500 lines | Consider extraction |
| > 500 lines | Must extract |

### Extraction Pattern

1. **Extract ViewModel** for business logic
2. **Extract sub-components** for UI sections
3. **Extract CSS** to replace inline styles

## Styling Patterns

### CSS Variables (Required)

```css
/* ✅ Correct */
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

/* ❌ Wrong */
.my-component {
  background: #ffffff;
  color: #333;
}
```

### No Inline Styles

```typescript
// ❌ Avoid
<div style={{ padding: '8px', background: '#fff' }}>

// ✅ Prefer
<div className="my-container">
```

## Plugin Development Workflow

```bash
# 1. Make changes in examples/my-workspace/
# 2. Remove and reinstall
npx tsx scripts/cli-plugin.ts remove my-workspace
npx tsx scripts/cli-plugin.ts install ./examples/my-workspace

# 3. Test
npm run dev:ui
```

## Logging

```typescript
import { log } from '@/utils/logger';

log.context('State updated:', newState);
log.api('API call:', endpoint);
log.chat('Message:', message);
```

Enable in browser: `localStorage.debug = 'app:*'`

**Never use `console.log()` in production code.**

## Common Pitfalls

1. **Business logic in components** - Extract to ViewModel hooks
2. **Direct API calls in components** - Use SDK query hooks
3. **Plugin importing from core** - Use SDK only
4. **ViewModel in SDK** - Keep plugin logic in plugin
5. **Hardcoded colors** - Use CSS variables
6. **Inline styles** - Extract to CSS classes
7. **Large components** - Extract when > 300 lines
8. **console.log** - Use structured logging
