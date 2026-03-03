# Workspace-Owned Agents

## Concept

Workspaces can bundle their own agent definitions, making them fully self-contained and shareable. This enables community contributions where a workspace defines both the UI and the AI agents that power it.

## Architecture

### Traditional Model (Separate)
```
~/.stallion-ai/
  agents/
    my-agent/
      agent.json
  workspaces/
    my-workspace/
      workspace.json  # References my-agent
```

### Workspace-Owned Model (Bundled)
```
my-plugins/
  packages/
    work-workspace/
      plugin.json
      agents/
        calendar-agent/
          agent.json
        crm-agent/
          agent.json
      src/
        Calendar.tsx
        CRM.tsx
```

## Benefits

1. **Self-contained**: Workspace + agents in one package
2. **Shareable**: `npm install @stallion-ai/work-workspace` gets everything
3. **Versioned together**: Agent prompts and UI stay in sync
4. **Community-friendly**: Easy to contribute complete workflows
5. **Portable**: Move between Stallion instances easily

## Manifest Schema

### Plugin Manifest (`plugin.json`)

```json
{
  "name": "work-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.3.0",
  "displayName": "Work Workspace",
  "description": "Calendar and CRM workspace for daily work",
  "entrypoint": "./index.tsx",
  "agents": [
    {
      "slug": "calendar-agent",
      "source": "./agents/calendar-agent/agent.json"
    },
    {
      "slug": "crm-agent",
      "source": "./agents/crm-agent/agent.json"
    }
  ],
  "workspace": {
    "slug": "work",
    "source": "./workspace.json"
  }
}
```

### Workspace Config (`workspace.json`)

```json
{
  "name": "Work",
  "slug": "work",
  "icon": "💼",
  "description": "Daily work dashboard with calendar and CRM",
  "defaultAgent": "calendar-agent",
  "tabs": [
    {
      "id": "calendar",
      "label": "Calendar",
      "icon": "📅",
      "component": "work-workspace-calendar",
      "agent": "calendar-agent",
      "prompts": [
        {
          "id": "daily-summary",
          "label": "Daily Summary",
          "prompt": "Summarize my calendar for today"
        }
      ]
    },
    {
      "id": "crm",
      "label": "CRM",
      "icon": "🤝",
      "component": "work-workspace-crm",
      "agent": "crm-agent",
      "prompts": [
        {
          "id": "account-summary",
          "label": "Account Summary",
          "prompt": "Show me my top accounts"
        }
      ]
    }
  ]
}
```

### Agent Config (`agents/calendar-agent/agent.json`)

```json
{
  "name": "Calendar Agent",
  "prompt": "You are a calendar assistant. Help users manage their schedule.",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": {
    "mcpServers": ["files"],
    "available": ["files_*"],
    "autoApprove": ["files_read"]
  }
}
```

## Installation Flow

### 1. User Installs Plugin

```bash
wa install github:org/my-plugin.git
```

### 2. Plugin Loader

1. Clones repo to `~/.stallion-ai/plugins/work-workspace/`
2. Reads `plugin.json`
3. Installs agents to `~/.stallion-ai/agents/`
4. Installs workspace to `~/.stallion-ai/workspaces/`
5. Copies UI components to `src-ui/src/workspaces/work-workspace/`

### 3. Agent Registration

Agents are registered with workspace prefix:

```
work-workspace:calendar-agent
work-workspace:crm-agent
```

This prevents naming conflicts between plugins.

### 4. Workspace References Agents

Workspace config references bundled agents:

```json
{
  "tabs": [
    {
      "id": "calendar",
      "agent": "work-workspace:calendar-agent"
    }
  ]
}
```

## Component Structure

```typescript
// src/Calendar.tsx
import { useSendMessage, useAgent } from '@stallion-ai/sdk';

export function Calendar() {
  const agent = useAgent('work-workspace:calendar-agent');
  const sendMessage = useSendMessage();
  
  const handleSummary = async () => {
    await sendMessage(
      sessionId,
      'work-workspace:calendar-agent',
      undefined,
      'Summarize my day'
    );
  };
  
  return <div>Calendar UI</div>;
}
```

## Migration Path

### From Separate Agents

**Before:**
```
~/.stallion-ai/
  agents/sa-agent/
  workspaces/sa-workspace/
```

**After:**
```
my-plugins/
  packages/work-workspace/
    agents/calendar-agent/
    workspace.json
```

### Migration Steps

1. Create plugin package structure
2. Copy agent definitions to `agents/`
3. Update agent slugs with workspace prefix
4. Update workspace config to reference bundled agents
5. Copy UI components to `src/`
6. Create `plugin.json` manifest
7. Test installation

## Naming Convention

### Workspace Naming

- **Package**: `@stallion-ai/work-workspace`
- **Workspace slug**: `work`
- **Display name**: "Work"

### Component Naming

- **Calendar**: `work-workspace-calendar`
- **CRM**: `work-workspace-crm`

### Agent Naming

- **Calendar Agent**: `work-workspace:calendar-agent`
- **CRM Agent**: `work-workspace:crm-agent`

## CLI Commands

```bash
# Install plugin from git
wa install github:org/my-plugin.git

# Install from local path
wa install ./my-plugins/packages/work-workspace

# List installed plugins
wa list

# Remove plugin
wa remove work-workspace
```

## Security Considerations

1. **Agent isolation**: Workspace-owned agents run in same security context as user-defined agents
2. **Tool permissions**: Agents declare required tools in manifest
3. **Workspace permissions**: UI components declare required permissions
4. **Sandboxing**: Future enhancement to isolate plugin execution

## Best Practices

1. **Namespace agents**: Use workspace prefix to avoid conflicts
2. **Version together**: Keep agent prompts and UI in sync
3. **Document dependencies**: List required MCP servers in README
4. **Test isolation**: Ensure plugin works standalone
5. **Provide examples**: Include sample prompts and workflows

## Example: Work Workspace

```
work-workspace/
├── plugin.json
├── workspace.json
├── agents/
│   ├── calendar-agent/
│   │   └── agent.json
│   └── crm-agent/
│       └── agent.json
├── src/
│   ├── index.tsx
│   ├── Calendar.tsx
│   └── CRM.tsx
└── README.md
```

This creates a complete, shareable workspace with:
- Calendar view powered by calendar-agent
- CRM view powered by crm-agent
- Self-contained, installable via CLI
- Community can fork and customize
