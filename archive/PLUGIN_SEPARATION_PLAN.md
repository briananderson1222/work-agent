# Plugin Separation Implementation Plan

## 🎯 Goal

Establish clean separation between core application and plugins, with workspace-owned agents and CLI-based installation from separate git repository.

## 📋 Status Overview

### ✅ Completed

1. **Workspace-Owned Agent Architecture** (`docs/WORKSPACE_AGENTS.md`)
   - Workspaces can bundle agent definitions
   - Agents namespaced with workspace prefix (`work-workspace:calendar-agent`)
   - Self-contained, shareable packages

2. **CLI Tool** (`src-server/cli-plugin.ts`)
   - `work-agent plugin install <source>` - Install from git or local
   - `work-agent plugin list` - List installed plugins
   - `work-agent plugin remove <name>` - Remove plugin
   - `work-agent plugin info <name>` - Show plugin details

3. **Updated Manifest Schema**
   - `PluginManifest` now supports `agents[]` and `workspace` fields
   - Declares bundled agents and workspace config

### 🚧 In Progress

4. **Create Separate Plugins Repository**
   - Structure: `work-agent-plugins/packages/work-workspace/`
   - Migrate existing sa-dashboard → Calendar
   - Migrate existing sfdc-account-manager → CRM

5. **Core App Integration**
   - Integrate SDKProvider with all contexts
   - Update PluginRegistry to use installed plugins
   - Remove hardcoded workspace imports

6. **Testing & Validation**
   - Test installation from separate repo
   - Verify agent namespacing works
   - Ensure clean separation

## 📁 Repository Structure

### Core Repository (work-agent)

```
work-agent/
├── src-server/
│   ├── cli-plugin.ts           # ✅ Plugin CLI tool
│   └── runtime/                # Core runtime
├── src-ui/
│   ├── src/
│   │   ├── workspaces/         # Gitignored - plugins install here
│   │   │   └── .gitkeep
│   │   └── core/
│   │       └── PluginRegistry.ts
│   └── contexts/               # Core contexts
├── packages/
│   └── sdk/                    # ✅ Enhanced SDK
├── docs/
│   └── WORKSPACE_AGENTS.md     # ✅ Architecture docs
└── .work-agent/
    ├── plugins/                # Plugin staging area
    ├── agents/                 # Installed agents (namespaced)
    └── workspaces/             # Installed workspace configs
```

### Plugins Repository (work-agent-plugins) - TO CREATE

```
work-agent-plugins/
├── packages/
│   └── work-workspace/
│       ├── plugin.json
│       ├── workspace.json
│       ├── agents/
│       │   ├── calendar-agent/
│       │   │   └── agent.json
│       │   └── crm-agent/
│       │       └── agent.json
│       ├── src/
│       │   ├── index.tsx
│       │   ├── Calendar.tsx
│       │   └── CRM.tsx
│       └── README.md
└── README.md
```

## 🔄 Installation Flow

### 1. User Installs Plugin

```bash
cd work-agent
work-agent plugin install github:work-agent/plugins#work-workspace
```

### 2. CLI Tool Actions

1. Clones repo to `.work-agent/plugins/work-workspace/`
2. Reads `plugin.json`
3. Copies agents to `.work-agent/agents/` with namespace:
   - `work-workspace:calendar-agent/`
   - `work-workspace:crm-agent/`
4. Copies workspace config to `.work-agent/workspaces/work/`
5. Copies UI components to `src-ui/src/workspaces/work-workspace/`

### 3. Core App Discovery

1. PluginRegistry scans `src-ui/src/workspaces/`
2. Finds `work-workspace/plugin.json`
3. Loads components dynamically
4. Registers workspace with namespaced agents

## 📝 Plugin Manifest Example

```json
{
  "name": "work-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "Work Workspace",
  "description": "Calendar and CRM for daily work",
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
  },
  
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"]
}
```

## 🏗️ Migration Steps

### Step 1: Create Plugins Repository

```bash
# Create new repo
mkdir work-agent-plugins
cd work-agent-plugins
git init
mkdir -p packages/work-workspace/{agents,src}
```

### Step 2: Migrate SA Dashboard → Calendar

```bash
# Copy existing sa-dashboard component
cp work-agent/src-ui/src/workspaces/SADashboard.tsx \
   work-agent-plugins/packages/work-workspace/src/Calendar.tsx

# Simplify and update imports to use @stallion-ai/sdk
# Remove hardcoded dependencies
# Focus on calendar functionality
```

### Step 3: Migrate SFDC Account Manager → CRM

```bash
# Copy existing sfdc-account-manager
cp work-agent/src-ui/src/plugins/sfdc-account-manager/index.tsx \
   work-agent-plugins/packages/work-workspace/src/CRM.tsx

# Update imports to use @stallion-ai/sdk
# Simplify naming
```

### Step 4: Create Agent Definitions

```bash
# Create calendar-agent
cat > work-agent-plugins/packages/work-workspace/agents/calendar-agent/agent.json << EOF
{
  "name": "Calendar Agent",
  "prompt": "You are a calendar assistant...",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": {
    "mcpServers": ["sat-outlook"],
    "available": ["sat-outlook_calendar_*"]
  }
}
EOF

# Create crm-agent
cat > work-agent-plugins/packages/work-workspace/agents/crm-agent/agent.json << EOF
{
  "name": "CRM Agent",
  "prompt": "You are a CRM assistant...",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": {
    "mcpServers": ["sat-sfdc"],
    "available": ["sat-sfdc_*"]
  }
}
EOF
```

### Step 5: Create Workspace Config

```json
{
  "name": "Work",
  "slug": "work",
  "icon": "💼",
  "description": "Daily work dashboard",
  "defaultAgent": "work-workspace:calendar-agent",
  "tabs": [
    {
      "id": "calendar",
      "label": "Calendar",
      "icon": "📅",
      "component": "work-workspace-calendar",
      "agent": "work-workspace:calendar-agent"
    },
    {
      "id": "crm",
      "label": "CRM",
      "icon": "🤝",
      "component": "work-workspace-crm",
      "agent": "work-workspace:crm-agent"
    }
  ]
}
```

### Step 6: Create Plugin Manifest

```json
{
  "name": "work-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "Work Workspace",
  "description": "Calendar and CRM workspace",
  "entrypoint": "./index.tsx",
  "agents": [
    { "slug": "calendar-agent", "source": "./agents/calendar-agent/agent.json" },
    { "slug": "crm-agent", "source": "./agents/crm-agent/agent.json" }
  ],
  "workspace": {
    "slug": "work",
    "source": "./workspace.json"
  }
}
```

### Step 7: Create Main Export

```typescript
// src/index.tsx
import Calendar from './Calendar';
import CRM from './CRM';

// Export component registry
export default {
  'work-workspace-calendar': Calendar,
  'work-workspace-crm': CRM,
};
```

### Step 8: Test Installation

```bash
# From work-agent directory
work-agent plugin install ../work-agent-plugins/packages/work-workspace

# Verify installation
work-agent plugin list
work-agent plugin info work-workspace

# Check files were copied
ls .work-agent/agents/work-workspace:calendar-agent/
ls .work-agent/workspaces/work/
ls src-ui/src/workspaces/work-workspace/
```

### Step 9: Remove Old Code from Core

```bash
# Remove hardcoded workspace imports
rm src-ui/src/workspaces/SADashboard.tsx
rm -rf src-ui/src/plugins/sa-dashboard/
rm -rf src-ui/src/plugins/sfdc-account-manager/

# Update workspaces/index.tsx to use PluginRegistry only
```

## 🔌 Core App Integration

### Update App.tsx

```typescript
import { SDKProvider } from '@stallion-ai/sdk';
import { pluginRegistry } from './core/PluginRegistry';
import * as AgentsContext from './contexts/AgentsContext';
// ... import all contexts

// Initialize plugin registry
useEffect(() => {
  pluginRegistry.initialize();
}, []);

// Create SDK value
const sdkValue = {
  apiBase: API_BASE,
  contexts: {
    agents: AgentsContext,
    workspaces: WorkspacesContext,
    conversations: ConversationsContext,
    activeChats: ActiveChatsContext,
    models: ModelsContext,
    config: ConfigContext,
    navigation: NavigationContext,
    toast: ToastContext,
    stats: StatsContext,
    keyboardShortcuts: KeyboardShortcutsContext,
    workflows: WorkflowsContext,
  },
  hooks: {
    slashCommandHandler: useSlashCommandHandler,
    slashCommands: useSlashCommands,
    toolApproval: useToolApproval,
    keyboardShortcut: useKeyboardShortcut,
  },
};

return (
  <SDKProvider value={sdkValue}>
    <App />
  </SDKProvider>
);
```

### Update WorkspaceView.tsx

```typescript
import { pluginRegistry } from '../core/PluginRegistry';

const Component = pluginRegistry.getWorkspace(activeTab?.component);

if (!Component) {
  return <div>Workspace component not found</div>;
}

return (
  <SDKProvider value={sdkValue}>
    <Component {...props} />
  </SDKProvider>
);
```

## ✅ Validation Checklist

- [ ] CLI tool can install from git repo
- [ ] Agents are copied with namespace prefix
- [ ] Workspace config is installed correctly
- [ ] UI components are discovered by PluginRegistry
- [ ] Components can access SDK hooks
- [ ] Agents can be invoked with namespaced slugs
- [ ] Multiple plugins can coexist without conflicts
- [ ] Removing plugin cleans up all files
- [ ] Core app has no hardcoded workspace imports

## 📚 Documentation Updates Needed

1. Update README.md with CLI installation instructions
2. Create CONTRIBUTING.md for plugin developers
3. Update PLUGIN_ARCHITECTURE.md with workspace-owned agents
4. Create example plugin template repository
5. Document agent namespacing convention

## 🚀 Next Actions

1. **Create work-agent-plugins repository**
   ```bash
   mkdir ../work-agent-plugins
   cd ../work-agent-plugins
   git init
   ```

2. **Migrate sa-dashboard to work-workspace**
   - Copy components
   - Create agent definitions
   - Create workspace config
   - Create plugin manifest

3. **Test installation flow**
   ```bash
   cd ../work-agent
   work-agent plugin install ../work-agent-plugins/packages/work-workspace
   ```

4. **Integrate SDK in core app**
   - Wrap with SDKProvider
   - Update PluginRegistry usage
   - Remove hardcoded imports

5. **Validate separation**
   - Core app should have no workspace code
   - All workspaces installed via CLI
   - Clean git status in core repo

## 🎯 Success Criteria

- ✅ Core app is clean (no workspace code)
- ✅ Plugins install from separate repo
- ✅ Workspace-owned agents work correctly
- ✅ Agent namespacing prevents conflicts
- ✅ CLI tool handles all plugin operations
- ✅ SDK provides full access to core functionality
- ✅ Documentation is complete and accurate
