# State Management Refactor Implementation Plan

## Overview
Refactor all API data fetching to use React Context + useSyncExternalStore pattern for consistency, caching, and automatic synchronization across components.

## Reference Implementation
See `src-ui/src/contexts/StatsContext.tsx` for the pattern to follow.

## Provider Hierarchy
```
ConfigProvider (foundation)
└─ WorkspacesProvider (independent)
   └─ AgentsProvider (may be workspace-scoped)
      └─ WorkflowsProvider (agent-scoped)
         └─ ConversationsProvider (agent-scoped)
            └─ StatsProvider (conversation-scoped) ✅ DONE
```

---

## Step 1: Create ConfigContext

**File:** `src-ui/src/contexts/ConfigContext.tsx`

**Data Structure:**
```typescript
type ConfigData = {
  apiEndpoint?: string;
  region?: string;
  defaultModel?: string;
  defaultChatFontSize?: number;
  systemPrompt?: string;
  templateVariables?: Array<{
    key: string;
    type: string;
    value?: string;
    format?: string;
  }>;
  logLevel?: string;
  meetingNotifications?: {
    enabled?: boolean;
    thresholds?: number[];
  };
};
```

**Store Methods:**
- `fetch(apiBase: string)` - GET `/config/app`
- `update(apiBase: string, config: Partial<ConfigData>)` - PUT `/config/app`

**Hook:**
```typescript
export function useConfig(apiBase: string, shouldFetch = true): ConfigData | null
```

**Replace in:**
- `App.tsx` line 845: `fetchAppConfig()`
- `src-ui/src/plugins/sa-dashboard/index.tsx` line 175
- `src-ui/src/views/SettingsView.tsx` (multiple locations)

---

## Step 2: Create WorkspacesContext

**File:** `src-ui/src/contexts/WorkspacesContext.tsx`

**Data Structure:**
```typescript
type WorkspaceData = {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabs: Array<{
    id: string;
    label: string;
    component: string;
    prompts?: Array<{
      id: string;
      label: string;
      prompt: string;
      agent?: string;
    }>;
  }>;
  globalPrompts?: Array<{
    id: string;
    label: string;
    prompt: string;
    agent?: string;
  }>;
};
```

**Store Methods:**
- `fetchAll(apiBase: string)` - GET `/workspaces`
- `fetchOne(apiBase: string, slug: string)` - GET `/workspaces/:slug`
- `create(apiBase: string, workspace: WorkspaceData)` - POST `/workspaces`
- `update(apiBase: string, slug: string, workspace: Partial<WorkspaceData>)` - PUT `/workspaces/:slug`
- `delete(apiBase: string, slug: string)` - DELETE `/workspaces/:slug`

**Hooks:**
```typescript
export function useWorkspaces(apiBase: string): WorkspaceData[]
export function useWorkspace(apiBase: string, slug: string): WorkspaceData | null
```

**Replace in:**
- `App.tsx` line 891: `fetchWorkspaces()`
- `App.tsx` line 923: `fetchWorkspace(slug)`

---

## Step 3: Create AgentsContext

**File:** `src-ui/src/contexts/AgentsContext.tsx`

**Data Structure:**
```typescript
type AgentData = {
  slug: string;
  name: string;
  description?: string;
  model?: string;
  icon?: string;
  updatedAt?: string;
  commands?: Record<string, any>;
  ui?: any;
  toolsConfig?: any;
  workflowWarnings?: string[];
};
```

**Store Methods:**
- `fetchAll(apiBase: string)` - GET `/api/agents`
- `fetchOne(apiBase: string, slug: string)` - GET `/agents/:slug`
- `create(apiBase: string, agent: AgentData)` - POST `/agents`
- `update(apiBase: string, slug: string, agent: Partial<AgentData>)` - PUT `/agents/:slug`
- `delete(apiBase: string, slug: string)` - DELETE `/agents/:slug`

**Hooks:**
```typescript
export function useAgents(apiBase: string, workspaceSlug?: string): AgentData[]
export function useAgent(apiBase: string, slug: string): AgentData | null
```

**Replace in:**
- `App.tsx` line 862: `fetchAgents()`
- `App.tsx` line 1140: Agent fetch in `/tools` command
- `App.tsx` line 1177: Agent fetch in `/tools` command

---

## Step 4: Create WorkflowsContext

**File:** `src-ui/src/contexts/WorkflowsContext.tsx`

**Data Structure:**
```typescript
type WorkflowMetadata = {
  id: string;
  name: string;
  description?: string;
  agentSlug: string;
};

type WorkflowCatalog = Record<string, WorkflowMetadata[]>; // keyed by agentSlug
```

**Store Methods:**
- `fetchAll(apiBase: string)` - GET `/workflows`
- `fetchForAgent(apiBase: string, agentSlug: string)` - GET `/agents/:slug/workflows/files`

**Hooks:**
```typescript
export function useWorkflows(apiBase: string): WorkflowCatalog
export function useAgentWorkflows(apiBase: string, agentSlug: string): WorkflowMetadata[]
```

**Replace in:**
- `App.tsx` line 994: `fetchWorkflows()`

---

## Step 5: Create ConversationsContext

**File:** `src-ui/src/contexts/ConversationsContext.tsx`

**Data Structure:**
```typescript
type ConversationData = {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

type MessageData = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
};
```

**Store Methods:**
- `fetchConversations(apiBase: string, agentSlug: string)` - GET `/agents/:slug/conversations`
- `fetchMessages(apiBase: string, agentSlug: string, conversationId: string)` - GET `/agents/:slug/conversations/:id/messages`
- `deleteConversation(apiBase: string, agentSlug: string, conversationId: string)` - DELETE `/agents/:slug/conversations/:id`

**Hooks:**
```typescript
export function useConversations(apiBase: string, agentSlug: string): ConversationData[]
export function useMessages(apiBase: string, agentSlug: string, conversationId: string): MessageData[]
```

**Replace in:**
- `App.tsx` line 955: `fetchConversations(agentSlug)`
- `App.tsx` line 588: Message loading in `loadConversation()`
- `App.tsx` line 2199: Message loading in `openConversation()`
- `App.tsx` line 2231: Conversation list fetch

---

## Step 6: Update main.tsx

**File:** `src-ui/src/main.tsx`

**Changes:**
```typescript
import { ConfigProvider } from './contexts/ConfigContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { AgentsProvider } from './contexts/AgentsContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { StatsProvider } from './contexts/StatsContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppDataProvider apiBase={API_BASE}>
      <ConfigProvider>
        <WorkspacesProvider>
          <AgentsProvider>
            <WorkflowsProvider>
              <ConversationsProvider>
                <StatsProvider>
                  <App />
                </StatsProvider>
              </ConversationsProvider>
            </WorkflowsProvider>
          </AgentsProvider>
        </WorkspacesProvider>
      </ConfigProvider>
    </AppDataProvider>
  </React.StrictMode>
);
```

---

## Step 7: Refactor App.tsx

**Remove direct fetch functions:**
- `fetchAppConfig()` - Replace with `useConfig()`
- `fetchAgents()` - Replace with `useAgents()`
- `fetchWorkspaces()` - Replace with `useWorkspaces()`
- `fetchWorkspace(slug)` - Replace with `useWorkspace(slug)`
- `fetchConversations(agentSlug)` - Replace with `useConversations(agentSlug)`
- `fetchWorkflows()` - Replace with `useWorkflows()`

**Update state:**
- Remove `agents` state - use `useAgents()` directly
- Remove `workspaces` state - use `useWorkspaces()` directly
- Remove `workflowCatalog` state - use `useWorkflows()` directly
- Keep `sessions` state (chat-specific, not API data)

---

## Step 8: Update SA Dashboard

**File:** `src-ui/src/plugins/sa-dashboard/index.tsx`

**Changes:**
- Line 175: Replace direct fetch with `useConfig(sdk.apiBase)`

---

## Step 9: Update SettingsView

**File:** `src-ui/src/views/SettingsView.tsx`

**Changes:**
- Replace `loadConfig()` with `useConfig(apiBase)`
- Replace `loadAgents()` with `useAgents(apiBase)`
- Replace `loadWorkspaces()` with `useWorkspaces(apiBase)`
- Use context methods for create/update/delete operations

---

## Step 10: Create SDK Package (@stallion-ai/sdk)

**File:** `packages/stallion-ai-sdk/src/index.ts`

**Exports:**
```typescript
// Contexts
export { ConfigProvider, useConfig } from './contexts/ConfigContext';
export { WorkspacesProvider, useWorkspaces, useWorkspace } from './contexts/WorkspacesContext';
export { AgentsProvider, useAgents, useAgent } from './contexts/AgentsContext';
export { WorkflowsProvider, useWorkflows, useAgentWorkflows } from './contexts/WorkflowsContext';
export { ConversationsProvider, useConversations, useMessages } from './contexts/ConversationsContext';
export { StatsProvider, useStats } from './contexts/StatsContext';

// Combined provider
export { StallionProvider } from './StallionProvider';

// Types
export type { ConfigData, WorkspaceData, AgentData, ConversationData, StatsData } from './types';
```

**File:** `packages/stallion-ai-sdk/src/StallionProvider.tsx`

```typescript
export function StallionProvider({ children, apiBase }: { children: ReactNode; apiBase: string }) {
  return (
    <ConfigProvider apiBase={apiBase}>
      <WorkspacesProvider apiBase={apiBase}>
        <AgentsProvider apiBase={apiBase}>
          <WorkflowsProvider apiBase={apiBase}>
            <ConversationsProvider apiBase={apiBase}>
              <StatsProvider apiBase={apiBase}>
                {children}
              </StatsProvider>
            </ConversationsProvider>
          </WorkflowsProvider>
        </AgentsProvider>
      </WorkspacesProvider>
    </ConfigProvider>
  );
}
```

---

## Step 11: Update main.tsx to use SDK

**File:** `src-ui/src/main.tsx`

**Simplified:**
```typescript
import { StallionProvider } from '@stallion-ai/sdk';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppDataProvider apiBase={API_BASE}>
      <StallionProvider apiBase={API_BASE}>
        <App />
      </StallionProvider>
    </AppDataProvider>
  </React.StrictMode>
);
```

---

## Step 12: Testing & Validation

**For each context:**
1. Verify data loads correctly
2. Test caching (multiple components using same data)
3. Test deduplication (concurrent fetches)
4. Test updates propagate to all subscribers
5. Test error handling
6. Verify no duplicate network requests in DevTools

**Integration tests:**
1. Agent switching updates conversations
2. Workspace switching updates agents
3. Config changes reflect immediately
4. Stats update after messages

---

## Implementation Order

1. **ConfigContext** (simplest, no dependencies)
2. **WorkspacesContext** (independent)
3. **AgentsContext** (may use config/workspace)
4. **WorkflowsContext** (uses agents)
5. **ConversationsContext** (uses agents)
6. Update main.tsx with all providers
7. Refactor App.tsx to use hooks
8. Update SA Dashboard
9. Update SettingsView
10. Create SDK package
11. Migrate to SDK
12. Testing

---

## Success Criteria

- ✅ No direct `fetch()` calls in components (except chat streaming)
- ✅ All API data accessed via hooks
- ✅ Single source of truth for each data type
- ✅ Automatic caching and deduplication
- ✅ Components stay synchronized
- ✅ SDK provides clean API for all data access
- ✅ Consistent pattern across entire codebase

---

## Notes

- Keep chat streaming as direct fetch (real-time, not cacheable)
- Tool approval endpoints can stay as direct fetch (one-time actions)
- Follow StatsContext.tsx pattern exactly for consistency
- Each store class should have subscribe/getSnapshot methods
- Use useSyncExternalStore in hooks
- Pass apiBase to all hooks (don't hardcode)
