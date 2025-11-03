# Design: Workspace/Agent Separation

## Architecture

### Current State
```
Agent Definition (agent.json)
├─ AI Config (prompt, model, tools)
└─ UI Config (component, quickPrompts, workflowShortcuts)
```

### Target State
```
Agent Definition (agent.json) - GLOBAL
└─ AI Config ONLY (prompt, model, tools, guardrails)

Workspace Definition (workspace.json)
├─ Defines tabs with components
├─ Global prompts (each references an agent)
└─ Tab-specific prompts (each references an agent)
```

## File Structure

```
.work-agent/
  agents/
    sa-agent/
      agent.json              # Pure AI config
      memory/                 # Unchanged
      workflows/              # Unchanged
  workspaces/
    sa-workspace/
      workspace.json          # UI config
```

## Schema Definitions

### Agent Schema (Simplified)
```typescript
{
  name: string;
  prompt: string;
  model?: string;
  region?: string;
  guardrails?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  };
  tools?: {
    mcpServers: string[];
    available?: string[];
    autoApprove?: string[];
    aliases?: Record<string, string>;
  };
  // NO UI FIELDS
}
```

### Workspace Schema (New)
```typescript
{
  name: string;                    // Display name
  slug: string;                    // URL-safe identifier
  icon?: string;                   // Emoji or icon identifier
  description?: string;            // Optional description
  tabs: Array<{
    id: string;                    // Tab identifier
    label: string;                 // Tab display name
    component: string;             // React component ID
    icon?: string;                 // Optional tab icon
    prompts?: Array<{              // Tab-specific prompts
      id: string;
      label: string;
      prompt: string;
      agent?: string;              // Optional: agent to use (if omitted, user selects)
    }>;
  }>;
  globalPrompts?: Array<{          // Workspace-level prompts
    id: string;
    label: string;
    prompt: string;
    agent?: string;                // Optional: agent to use (if omitted, user selects)
  }>;
}
```

## UI Changes

### Navigation Flow
1. **Workspace Selector**
   - Dropdown shows workspaces (not agents)
   - Management actions: New Workspace, Edit Workspace, Settings
   - Settings contains agent management (agents are global)

2. **Workspace View**
   - Tab navigation for multi-tab workspaces
   - Active tab renders its component
   - Quick actions show: global prompts + active tab's local prompts
   - Each prompt optionally specifies which agent to use

3. **Agent Selection Flow**
   - When prompt has no agent specified: show agent selector modal
   - When `onSendToChat(text)` called without agent: show agent selector modal
   - User selects agent, then message is sent
   - Selected agent is remembered for that session

4. **Settings View**
   - Agent Management section (create, edit, delete agents - GLOBAL)
   - Workspace Management section (create, edit, delete workspaces)
   - App Configuration section (region, model, etc.)

### Component Registry
- Workspace components remain in `src-ui/src/workspaces/`
- Registry maps component IDs to React components
- Each tab can use a different component
- Components receive workspace context and `onSendToChat(text, agent?)` callback
- If agent is omitted, system shows agent selector before sending

## API Changes

### New Endpoints
```
GET    /workspaces                    # List all workspaces
GET    /workspaces/:slug              # Get workspace config
POST   /workspaces                    # Create workspace
PUT    /workspaces/:slug              # Update workspace
DELETE /workspaces/:slug              # Delete workspace
```

### Existing Endpoints (Unchanged)
```
GET    /agents                        # List agents (no UI metadata)
POST   /agents/:slug/chat             # Chat with agent
POST   /agents/:slug/invoke           # Invoke workflow
```

## Migration Strategy

### Phase 1: Add Workspace Support (Non-Breaking)
- Add workspace configuration loader
- Add workspace API endpoints
- Keep existing agent UI metadata working
- Add workspace selector alongside agent selector

### Phase 2: Migrate Existing Configs
- Provide migration script to split agent.json files
- Create workspace.json for each agent with UI metadata
- Remove UI fields from agent.json

### Phase 3: Remove Legacy Support
- Remove UI metadata parsing from agent loader
- Remove agent selector (workspace selector only)
- Update documentation

## Example: SA Workspace

### Before (agent.json)
```json
{
  "name": "SA Agent",
  "prompt": "You are a solutions architect assistant...",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": { "mcpServers": ["sat-outlook", "sat-sfdc"] },
  "ui": {
    "component": "sa-dashboard",
    "quickPrompts": [
      { "id": "triage", "label": "Daily Triage", "prompt": "..." }
    ]
  }
}
```

### After

**agents/sa-agent/agent.json**
```json
{
  "name": "SA Agent",
  "prompt": "You are a solutions architect assistant...",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": { "mcpServers": ["sat-outlook", "sat-sfdc"] }
}
```

**workspaces/sa-workspace/workspace.json**
```json
{
  "name": "Solutions Architect",
  "slug": "sa-workspace",
  "icon": "🏗️",
  "tabs": [
    {
      "id": "calendar-email",
      "label": "Calendar & Email",
      "component": "sa-calendar-dashboard",
      "prompts": [
        { 
          "id": "triage", 
          "label": "Daily Triage", 
          "prompt": "Review today's calendar and unread emails. Summarize key meetings and action items.",
          "agent": "sa-agent"
        }
      ]
    },
    {
      "id": "salesforce",
      "label": "Salesforce",
      "component": "sa-salesforce-dashboard",
      "prompts": [
        { 
          "id": "opportunities", 
          "label": "Review Opportunities", 
          "prompt": "Show my open opportunities and highlight any that need attention.",
          "agent": "sa-agent"
        }
      ]
    }
  ],
  "globalPrompts": [
    { 
      "id": "standup", 
      "label": "Standup Prep", 
      "prompt": "Draft today's standup update based on yesterday's activities.",
      "agent": "sa-agent"
    }
  ]
}
```

## Trade-offs

### Pros
- Clear separation of concerns (AI vs UI)
- Multiple workspaces can share same agent
- Easier to add new workspace views without touching agent config
- Tab-based navigation enables richer UX
- Local + global prompts provide better organization

### Cons
- More configuration files to manage
- Migration effort for existing setups
- Slightly more complex mental model (workspace references agent)
- Need to maintain workspace/agent relationship consistency

## Open Questions

1. Should workspaces be able to reference multiple agents (one per tab)?
2. Should we support workspace inheritance/templates?
3. How should we handle workspace deletion when agent is still referenced?
4. Should tabs support lazy loading of components?
