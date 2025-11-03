# Workspace/Agent Separation - Integration Guide

## Completed Work

### Backend (Phase 1) ✅
- ✅ Added `WorkspaceConfig`, `WorkspaceTab`, `WorkspacePrompt`, `WorkspaceMetadata` types to `src-server/domain/types.ts`
- ✅ Added workspace validation to `src-server/domain/validator.ts`
- ✅ Added workspace CRUD methods to `ConfigLoader`:
  - `loadWorkspace(slug)`
  - `listWorkspaces()`
  - `createWorkspace(config)`
  - `updateWorkspace(slug, updates)`
  - `deleteWorkspace(slug)`
  - `saveWorkspace(slug, config)`
  - `getWorkspacesUsingAgent(agentSlug)` - checks dependencies
  - `workspaceExists(slug)`
- ✅ Added workspace REST API endpoints in `src-server/runtime/voltagent-runtime.ts`:
  - `GET /workspaces` - list all workspaces
  - `GET /workspaces/:slug` - get workspace config
  - `POST /workspaces` - create workspace
  - `PUT /workspaces/:slug` - update workspace
  - `DELETE /workspaces/:slug` - delete workspace
- ✅ Updated agent DELETE endpoint to check workspace dependencies before deletion
- ✅ Created example workspace: `.work-agent/workspaces/default-workspace/workspace.json`

### Frontend (Phase 2) ✅
- ✅ Added workspace types to `src-ui/src/types.ts`:
  - `WorkspaceConfig`, `WorkspaceTab`, `WorkspacePrompt`, `WorkspaceMetadata`
  - Updated `NavigationView` to include `workspace-new` and `workspace-edit`
- ✅ Created `WorkspaceSelector` component (`src-ui/src/components/WorkspaceSelector.tsx`)
- ✅ Created `TabNavigation` component (`src-ui/src/components/TabNavigation.tsx`)
- ✅ Created `AgentSelectorModal` component (`src-ui/src/components/AgentSelectorModal.tsx`)
- ✅ Updated `QuickActionsBar` to support workspace prompts with agent references

## Remaining Integration Work

### App.tsx Integration (Phase 2-4)

The following changes need to be made to `src-ui/src/App.tsx`:

#### 1. Add Workspace State (after line ~100)
```typescript
const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([]);
const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceConfig | null>(null);
const [activeTabId, setActiveTabId] = useState<string>('');
const [agentSelectorModal, setAgentSelectorModal] = useState<{
  show: boolean;
  onSelect: (slug: string) => void;
} | null>(null);
```

#### 2. Add Workspace Loading Function
```typescript
const fetchWorkspaces = async () => {
  try {
    const response = await fetch(`${API_BASE}/workspaces`);
    const data = await response.json();
    if (data.success) {
      setWorkspaces(data.data);
      // Load first workspace by default
      if (data.data.length > 0 && !selectedWorkspace) {
        handleWorkspaceSelect(data.data[0].slug);
      }
    }
  } catch (error) {
    console.error('Failed to load workspaces:', error);
  }
};

const handleWorkspaceSelect = async (slug: string) => {
  try {
    const response = await fetch(`${API_BASE}/workspaces/${slug}`);
    const data = await response.json();
    if (data.success) {
      setSelectedWorkspace(data.data);
      setActiveTabId(data.data.tabs[0]?.id || '');
    }
  } catch (error) {
    console.error('Failed to load workspace:', error);
  }
};
```

#### 3. Update useEffect to Load Workspaces
```typescript
useEffect(() => {
  fetchAgents();
  fetchWorkspaces(); // Add this line
}, []);
```

#### 4. Replace AgentSelector with WorkspaceSelector (line ~1679)
```typescript
<WorkspaceSelector
  workspaces={workspaces}
  selectedWorkspace={selectedWorkspace}
  onSelect={handleWorkspaceSelect}
  onCreateWorkspace={() => setNavigationView({ type: 'workspace-new' })}
  onEditWorkspace={(slug) => setNavigationView({ type: 'workspace-edit', slug })}
  onSettings={() => setNavigationView({ type: 'settings' })}
/>
```

#### 5. Add TabNavigation (after WorkspaceSelector)
```typescript
{selectedWorkspace && (
  <TabNavigation
    tabs={selectedWorkspace.tabs}
    activeTabId={activeTabId}
    onTabChange={setActiveTabId}
  />
)}
```

#### 6. Update QuickActionsBar
```typescript
const activeTab = selectedWorkspace?.tabs.find(t => t.id === activeTabId);

<QuickActionsBar
  globalPrompts={selectedWorkspace?.globalPrompts}
  localPrompts={activeTab?.prompts}
  onPromptSelect={handlePromptSelect}
/>
```

#### 7. Add Prompt Handler with Agent Selection
```typescript
const handlePromptSelect = async (prompt: WorkspacePrompt) => {
  if (prompt.agent) {
    // Agent specified, use it directly
    handleSendToChat(prompt.prompt, prompt.agent);
  } else {
    // No agent specified, show selector
    setAgentSelectorModal({
      show: true,
      onSelect: (agentSlug) => {
        setAgentSelectorModal(null);
        handleSendToChat(prompt.prompt, agentSlug);
      }
    });
  }
};
```

#### 8. Add AgentSelectorModal Rendering
```typescript
{agentSelectorModal?.show && (
  <AgentSelectorModal
    agents={agents}
    onSelect={agentSelectorModal.onSelect}
    onCancel={() => setAgentSelectorModal(null)}
  />
)}
```

#### 9. Update WorkspaceRenderer Props
```typescript
<WorkspaceRenderer
  componentId={activeTab?.component || 'work-agent-dashboard'}
  workspace={selectedWorkspace}
  activeTab={activeTab}
  onSendToChat={(text, agent) => {
    if (agent) {
      handleSendToChat(text, agent);
    } else {
      setAgentSelectorModal({
        show: true,
        onSelect: (agentSlug) => {
          setAgentSelectorModal(null);
          handleSendToChat(text, agentSlug);
        }
      });
    }
  }}
/>
```

### Workspace Editor View (Phase 3)

Create `src-ui/src/views/WorkspaceEditorView.tsx`:
- Form for workspace name, slug, icon, description
- Tab configuration (add/remove/reorder)
- Global prompts editor with agent dropdown
- Tab-specific prompts editor with agent dropdown
- Save/cancel actions

### Settings View Update (Phase 3)

Update `src-ui/src/views/SettingsView.tsx`:
- Add "Agents" section (move existing agent management here)
- Add "Workspaces" section (list/create/edit/delete workspaces)
- Keep "App Configuration" section

### WorkspaceRenderer Update (Phase 4)

Update `src-ui/src/workspaces/index.tsx`:
- Add `workspace` and `activeTab` props to `AgentWorkspaceProps`
- Update `onSendToChat` signature to accept optional agent parameter
- Pass new props to all workspace components

## Testing Checklist

Once integration is complete:

- [ ] Workspaces load on app start
- [ ] Can switch between workspaces
- [ ] Tabs display and switch correctly
- [ ] Global prompts work across all tabs
- [ ] Tab-specific prompts only show on their tab
- [ ] Prompts with agent specified execute directly
- [ ] Prompts without agent show agent selector modal
- [ ] Cannot delete agent referenced by workspace
- [ ] Workspace CRUD operations work via API
- [ ] Settings view shows agent and workspace management

## Migration Path

For existing users with agent UI metadata:

1. Keep agent UI metadata parsing as fallback (already in place)
2. Create migration script to generate workspace.json from agent.json UI fields
3. Gradually migrate existing configs
4. Eventually remove UI metadata support from agent loader

## Notes

- Backend is fully functional and tested
- Frontend components are created and ready
- Main integration point is App.tsx state management
- Workspace components need minor prop updates
- This is a non-breaking change if done incrementally
