# Work Agent Plugin Separation - Implementation Context

## Current Location
Working directory: `/Users/anderbs/dev/github/work-agent-plugin-separation`
Branch: `feature/plugin-separation`

## Mission
Complete the plugin separation by:
1. Creating separate `work-agent-plugins` repository
2. Migrating existing workspaces to simplified plugin structure
3. Integrating SDK into core app
4. Proving clean separation works

## What's Already Done ✅

### Architecture & Documentation
- **docs/WORKSPACE_AGENTS.md** - Workspace-owned agents architecture
- **PLUGIN_ARCHITECTURE.md** - Complete plugin system docs
- **PLUGIN_SEPARATION_PLAN.md** - Detailed implementation plan
- **PLUGIN_IMPLEMENTATION.md** - Integration guide

### Code Implemented
- **src-server/cli-plugin.ts** - CLI tool for plugin management
  - `work-agent plugin install <source>` (git or local)
  - `work-agent plugin list/remove/info`
  - Handles agent namespacing, file copying
  
- **packages/sdk/** - Enhanced SDK
  - `src/hooks.ts` - 15+ hooks wrapping core contexts
  - `src/providers.tsx` - SDKProvider for context injection
  - `src/api.ts` - Direct API utilities
  - `src/types/index.ts` - Complete TypeScript types
  
- **src-ui/src/core/PluginRegistry.ts** - Auto-discovery system
  - Uses Vite glob imports
  - Validates manifests
  - Loads components dynamically

- **examples/minimal-workspace/** - Example plugin package

### Key Concepts

**Simplified Naming:**
- `work-workspace` (not sa-workspace)
- Components: `Calendar`, `CRM` (not sa-dashboard, sfdc-account-manager)
- Agents: `work-workspace:calendar-agent`, `work-workspace:crm-agent`

**Workspace-Owned Agents:**
Workspaces bundle their own agent definitions. Agents are namespaced with workspace prefix to prevent conflicts.

**Installation Flow:**
```bash
work-agent plugin install github:work-agent/plugins#work-workspace
# Copies to:
# - .work-agent/agents/work-workspace:calendar-agent/
# - .work-agent/workspaces/work/
# - src-ui/src/workspaces/work-workspace/
```

## What Needs to Be Done 🚧

### Phase 1: Create Plugins Repository

1. **Create work-agent-plugins repository structure**
   ```bash
   mkdir -p ../work-agent-plugins/packages/work-workspace/{agents,src}
   cd ../work-agent-plugins
   git init
   ```

2. **Create plugin package structure**
   ```
   work-workspace/
   ├── plugin.json          # Manifest with agents[] and workspace
   ├── workspace.json       # Workspace config
   ├── agents/
   │   ├── calendar-agent/
   │   │   └── agent.json
   │   └── crm-agent/
   │       └── agent.json
   ├── src/
   │   ├── index.tsx       # Main export
   │   ├── Calendar.tsx    # Migrated from SADashboard
   │   └── CRM.tsx         # Migrated from sfdc-account-manager
   ├── package.json
   └── README.md
   ```

### Phase 2: Migrate Existing Components

3. **Migrate sa-dashboard → Calendar.tsx**
   - Source: `src-ui/src/workspaces/SADashboard.tsx`
   - Simplify: Remove complex state, focus on calendar view
   - Update imports: Use `@stallion-ai/sdk` hooks
   - Remove hardcoded dependencies

4. **Migrate sfdc-account-manager → CRM.tsx**
   - Source: `src-ui/src/plugins/sfdc-account-manager/index.tsx`
   - Simplify: Focus on core CRM functionality
   - Update imports: Use `@stallion-ai/sdk` hooks

5. **Create agent definitions**
   - `agents/calendar-agent/agent.json` - Calendar assistant with sat-outlook tools
   - `agents/crm-agent/agent.json` - CRM assistant with sat-sfdc tools

6. **Create workspace config**
   - `workspace.json` with tabs referencing namespaced agents
   - Default agent: `work-workspace:calendar-agent`

7. **Create plugin manifest**
   - `plugin.json` declaring bundled agents and workspace
   - Version: 1.0.0
   - SDK version: ^0.4.0

### Phase 3: Core App Integration

8. **Integrate SDKProvider in App.tsx**
   ```typescript
   import { SDKProvider } from '@stallion-ai/sdk';
   
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
   
   <SDKProvider value={sdkValue}>
     <App />
   </SDKProvider>
   ```

9. **Update WorkspaceView.tsx to use PluginRegistry**
   ```typescript
   import { pluginRegistry } from '../core/PluginRegistry';
   
   useEffect(() => {
     pluginRegistry.initialize();
   }, []);
   
   const Component = pluginRegistry.getWorkspace(activeTab?.component);
   ```

10. **Update src-ui/src/workspaces/index.tsx**
    - Remove hardcoded imports
    - Use PluginRegistry.getWorkspace() only
    - Keep DefaultWorkspace fallback

### Phase 4: Testing & Validation

11. **Build SDK package**
    ```bash
    cd packages/sdk
    npm run build
    ```

12. **Test plugin installation**
    ```bash
    tsx src-server/cli-plugin.ts install ../work-agent-plugins/packages/work-workspace
    ```

13. **Verify files copied correctly**
    - Check `.work-agent/agents/work-workspace:calendar-agent/`
    - Check `.work-agent/workspaces/work/`
    - Check `src-ui/src/workspaces/work-workspace/`

14. **Test in UI**
    - Start dev server
    - Navigate to work workspace
    - Verify components render
    - Test agent invocation with namespaced slugs

### Phase 5: Cleanup

15. **Remove old code from core**
    ```bash
    rm src-ui/src/workspaces/SADashboard.tsx
    rm -rf src-ui/src/plugins/sa-dashboard/
    rm -rf src-ui/src/plugins/sfdc-account-manager/
    ```

16. **Update .work-agent/workspaces/ configs**
    - Remove references to old workspace slugs
    - Update to use `work` workspace

17. **Commit and validate**
    - Core app should have no workspace code
    - All workspaces installed via CLI
    - Clean git status

## Key Files to Reference

### Architecture Docs
- `docs/WORKSPACE_AGENTS.md` - Workspace-owned agents pattern
- `PLUGIN_SEPARATION_PLAN.md` - Complete migration steps
- `PLUGIN_ARCHITECTURE.md` - Plugin system details

### Implementation
- `src-server/cli-plugin.ts` - CLI tool (ready to use)
- `packages/sdk/src/hooks.ts` - SDK hooks to use in plugins
- `src-ui/src/core/PluginRegistry.ts` - Auto-discovery system

### Examples
- `examples/minimal-workspace/` - Simple plugin example

## Important Patterns

### Plugin Manifest with Agents
```json
{
  "name": "work-workspace",
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

### Workspace Config with Namespaced Agents
```json
{
  "slug": "work",
  "defaultAgent": "work-workspace:calendar-agent",
  "tabs": [
    {
      "id": "calendar",
      "component": "work-workspace-calendar",
      "agent": "work-workspace:calendar-agent"
    }
  ]
}
```

### Component Using SDK
```typescript
import { useAgent, useSendMessage, useNavigation } from '@stallion-ai/sdk';

export function Calendar() {
  const agent = useAgent('work-workspace:calendar-agent');
  const sendMessage = useSendMessage();
  const { setDockState } = useNavigation();
  
  // Component implementation
}
```

## Success Criteria

- [ ] work-agent-plugins repo created with work-workspace package
- [ ] Calendar and CRM components migrated and simplified
- [ ] Agent definitions created with proper tool configurations
- [ ] Plugin installs successfully via CLI
- [ ] Components render in UI using PluginRegistry
- [ ] Agents invokable with namespaced slugs
- [ ] Core app has no hardcoded workspace imports
- [ ] Old workspace code removed
- [ ] Clean separation validated

## Commands to Run

```bash
# Create plugins repo
mkdir -p ../work-agent-plugins/packages/work-workspace
cd ../work-agent-plugins && git init

# Build SDK
cd work-agent-plugin-separation/packages/sdk
npm run build

# Install plugin
cd ../..
tsx src-server/cli-plugin.ts install ../work-agent-plugins/packages/work-workspace

# Test
npm run dev:server
npm run dev:ui

# Cleanup
rm src-ui/src/workspaces/SADashboard.tsx
rm -rf src-ui/src/plugins/sa-dashboard/
rm -rf src-ui/src/plugins/sfdc-account-manager/
```

## Questions to Address

1. Should we keep any existing workspaces in core, or move all to plugins?
2. How to handle .work-agent/workspaces/ configs during migration?
3. Should we create a template repository for new plugins?
4. How to version the SDK and ensure plugin compatibility?

## Next Steps Priority

1. **HIGH**: Create work-agent-plugins repo structure
2. **HIGH**: Migrate Calendar component (simplified)
3. **HIGH**: Create agent definitions
4. **MEDIUM**: Integrate SDKProvider in core app
5. **MEDIUM**: Test installation flow
6. **LOW**: Cleanup old code
7. **LOW**: Documentation updates

---

**Start by creating the work-agent-plugins repository and migrating the Calendar component. Focus on proving the separation works before cleaning up the core app.**
