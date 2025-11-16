# work-agent-plugins Repository Structure

## Create This Structure

```bash
mkdir -p ../work-agent-plugins/packages/work-workspace/{agents/{calendar-agent,crm-agent},src}
cd ../work-agent-plugins
git init
```

## Directory Layout

```
work-agent-plugins/
├── README.md
└── packages/
    └── work-workspace/
        ├── plugin.json                 # Manifest
        ├── workspace.json              # Workspace config
        ├── package.json                # NPM package
        ├── tsconfig.json               # TypeScript config
        ├── README.md                   # Plugin docs
        ├── agents/
        │   ├── calendar-agent/
        │   │   └── agent.json          # Calendar agent definition
        │   └── crm-agent/
        │       └── agent.json          # CRM agent definition
        └── src/
            ├── index.tsx               # Main export
            ├── Calendar.tsx            # Calendar component
            └── CRM.tsx                 # CRM component
```

## File Templates

### plugin.json
```json
{
  "name": "work-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "Work Workspace",
  "description": "Calendar and CRM workspace for daily work",
  "entrypoint": "./index.tsx",
  "agents": [
    { "slug": "calendar-agent", "source": "./agents/calendar-agent/agent.json" },
    { "slug": "crm-agent", "source": "./agents/crm-agent/agent.json" }
  ],
  "workspace": {
    "slug": "work",
    "source": "./workspace.json"
  },
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"]
}
```

### workspace.json
```json
{
  "name": "Work",
  "slug": "work",
  "icon": "💼",
  "description": "Daily work dashboard with calendar and CRM",
  "defaultAgent": "work-workspace:calendar-agent",
  "tabs": [
    {
      "id": "calendar",
      "label": "Calendar",
      "icon": "📅",
      "component": "work-workspace-calendar",
      "agent": "work-workspace:calendar-agent",
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
      "agent": "work-workspace:crm-agent",
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

### agents/calendar-agent/agent.json
```json
{
  "name": "Calendar Agent",
  "prompt": "You are a calendar assistant. Help users manage their schedule, view meetings, and organize their day.",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "guardrails": {
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "tools": {
    "mcpServers": ["sat-outlook"],
    "available": ["sat-outlook_calendar_*", "sat-outlook_email_read"],
    "autoApprove": ["sat-outlook_calendar_view"]
  }
}
```

### agents/crm-agent/agent.json
```json
{
  "name": "CRM Agent",
  "prompt": "You are a CRM assistant. Help users manage accounts, contacts, and opportunities in Salesforce.",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "guardrails": {
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "tools": {
    "mcpServers": ["sat-sfdc"],
    "available": ["sat-sfdc_query", "sat-sfdc_get_*"],
    "autoApprove": ["sat-sfdc_query"]
  }
}
```

### src/index.tsx
```typescript
import Calendar from './Calendar';
import CRM from './CRM';

// Export component registry
export default {
  'work-workspace-calendar': Calendar,
  'work-workspace-crm': CRM,
};
```

### src/Calendar.tsx (minimal template)
```typescript
import { useAgent, useNavigation } from '@stallion-ai/sdk';
import type { WorkspaceComponentProps } from '@stallion-ai/sdk';

export default function Calendar({ workspace }: WorkspaceComponentProps) {
  const agent = useAgent('work-workspace:calendar-agent');
  const { setDockState } = useNavigation();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>📅 Calendar</h1>
      <p>Agent: {agent?.name}</p>
      <button onClick={() => setDockState(true)}>Open Chat</button>
    </div>
  );
}
```

### src/CRM.tsx (minimal template)
```typescript
import { useAgent, useNavigation } from '@stallion-ai/sdk';
import type { WorkspaceComponentProps } from '@stallion-ai/sdk';

export default function CRM({ workspace }: WorkspaceComponentProps) {
  const agent = useAgent('work-workspace:crm-agent');
  const { setDockState } = useNavigation();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>🤝 CRM</h1>
      <p>Agent: {agent?.name}</p>
      <button onClick={() => setDockState(true)}>Open Chat</button>
    </div>
  );
}
```

## Migration Sources

Copy and simplify from:
- **Calendar**: `src-ui/src/workspaces/SADashboard.tsx`
- **CRM**: `src-ui/src/plugins/sfdc-account-manager/index.tsx`

Key changes:
- Replace context imports with `@stallion-ai/sdk` hooks
- Remove complex state management
- Focus on core functionality
- Use theme CSS variables
