# Implementation Tasks

## Phase 1: Backend Foundation (Parallel with Phase 2)

### 1.1 Define Workspace Schema
- [ ] Create TypeScript interface for `WorkspaceConfig` in `src-server/domain/types.ts`
- [ ] Define tab structure with id, label, component, prompts (each with agent reference)
- [ ] Define global prompts structure (each with agent reference)
- [ ] Add JSON schema for validation
- **Validation**: Schema compiles without errors

### 1.2 Create Workspace Configuration Loader
- [ ] Add `WorkspaceLoader` class in `src-server/domain/config-loader.ts`
- [ ] Implement `loadWorkspaces()` to scan `.work-agent/workspaces/`
- [ ] Implement `loadWorkspace(slug)` to read and parse `workspace.json`
- [ ] Add validation against workspace schema
- [ ] Validate agent references exist
- **Validation**: Unit tests pass for loading valid/invalid workspace configs

### 1.3 Add Workspace REST API Endpoints
- [ ] Add `GET /workspaces` endpoint to list all workspaces
- [ ] Add `GET /workspaces/:slug` endpoint to get workspace config
- [ ] Add `POST /workspaces` endpoint to create workspace
- [ ] Add `PUT /workspaces/:slug` endpoint to update workspace
- [ ] Add `DELETE /workspaces/:slug` endpoint to delete workspace
- [ ] Add validation for duplicate slugs and missing agent references
- **Validation**: API tests pass for all CRUD operations

### 1.4 Update Agent Loader to Remove UI Fields
- [ ] Remove `ui` field parsing from agent schema
- [ ] Add validation to reject UI fields in agent.json
- [ ] Update agent schema documentation
- **Validation**: Agent loader rejects configs with UI fields

### 1.5 Add Agent Dependency Checking
- [ ] Implement `getWorkspacesUsingAgent(agentSlug)` function to scan all workspace prompts
- [ ] Update agent DELETE endpoint to check workspace prompt dependencies
- [ ] Return error with dependent workspace list if agent is referenced by any prompt
- **Validation**: Cannot delete agent referenced by workspace prompts

## Phase 2: Frontend Foundation (Parallel with Phase 1)

### 2.1 Create Workspace Types
- [ ] Add `WorkspaceConfig` interface in `src-ui/src/types.ts`
- [ ] Add `WorkspaceTab` interface
- [ ] Add `WorkspacePrompt` interface (with agent field)
- [ ] Update `NavigationView` to include workspace context
- **Validation**: TypeScript compiles without errors

### 2.2 Add Workspace State Management
- [ ] Add `workspaces` state array in App.tsx
- [ ] Add `selectedWorkspace` state
- [ ] Add `activeTabId` state for current tab
- [ ] Add `fetchWorkspaces()` function
- [ ] Load workspaces on app initialization
- **Validation**: Workspaces load and display in console

### 2.3 Create WorkspaceSelector Component
- [ ] Create `src-ui/src/components/WorkspaceSelector.tsx`
- [ ] Implement dropdown showing workspace name, icon, description
- [ ] Add search/filter functionality
- [ ] Add management actions: New Workspace, Edit Workspace, Settings
- [ ] Replace AgentSelector with WorkspaceSelector in App.tsx
- **Validation**: Workspace selector renders and switches workspaces

### 2.4 Add Tab Navigation Component
- [ ] Create `src-ui/src/components/TabNavigation.tsx`
- [ ] Render tab bar with labels and icons
- [ ] Handle tab switching with state preservation
- [ ] Hide tab bar for single-tab workspaces
- [ ] Integrate into workspace panel in App.tsx
- **Validation**: Tabs render and switch without remounting components

### 2.5 Update Quick Actions Bar
- [ ] Modify `QuickActionsBar` to accept global and local prompts separately
- [ ] Display global prompts first, then tab-specific prompts
- [ ] Update prompt execution to use agent specified in prompt definition (if present)
- [ ] Show agent selector modal if prompt has no agent specified
- [ ] Remove workflow shortcuts (move to future enhancement)
- **Validation**: Global and local prompts display correctly per tab

### 2.6 Create Agent Selector Modal
- [ ] Create `src-ui/src/components/AgentSelectorModal.tsx`
- [ ] Display list of available agents with names and models
- [ ] Support search/filter functionality
- [ ] Return selected agent to caller
- [ ] Integrate with prompt execution and sendToChat flows
- **Validation**: Modal shows agents and returns selection

## Phase 3: Workspace Management UI

### 3.1 Create Workspace Editor View
- [ ] Create `src-ui/src/views/WorkspaceEditorView.tsx`
- [ ] Add form fields: name, slug, icon, description
- [ ] Add tab configuration section (add/remove/reorder tabs)
- [ ] Add global prompts configuration section (with agent dropdown per prompt)
- [ ] Add tab-specific prompts configuration per tab (with agent dropdown per prompt)
- [ ] Implement save/cancel actions
- **Validation**: Can create and edit workspace configs via UI

### 3.2 Add Workspace Editor Navigation
- [ ] Add "New Workspace" action to workspace selector
- [ ] Add "Edit Workspace" action to workspace selector
- [ ] Update navigation to support workspace editor view
- [ ] Handle workspace creation/update API calls
- **Validation**: Workspace editor opens and saves successfully

### 3.3 Update Settings View
- [ ] Reorganize SettingsView into sections: Agents, Workspaces, App Config
- [ ] Move agent management (create, edit, delete) to Agents section
- [ ] Add workspace management to Workspaces section
- [ ] Keep app configuration in App Config section
- **Validation**: Settings view shows all sections with proper navigation

## Phase 4: Component Updates

### 4.1 Update Workspace Component Props
- [ ] Update `AgentWorkspaceProps` to include workspace and tab context
- [ ] Pass workspace config to workspace components
- [ ] Pass active tab info to components
- [ ] Add `onSendToChat(text, agent?)` callback to component props (agent optional)
- [ ] Implement agent selector modal trigger when agent is omitted
- [ ] Update all existing workspace components to accept new props
- **Validation**: All workspace components render without errors

### 4.2 Update Chat Integration
- [ ] Update chat session creation to use agent specified in prompt
- [ ] Update session labels to show agent name
- [ ] Update chat dock to display agent context
- **Validation**: Chat sessions use correct agent from prompt definition

### 4.3 Update WorkspaceRenderer
- [ ] Modify `WorkspaceRenderer` to resolve component from tab config
- [ ] Add fallback for missing components
- [ ] Pass workspace and tab context to rendered components
- **Validation**: Components render based on tab configuration

## Phase 5: Migration and Documentation

### 5.1 Create Migration Script
- [ ] Create `scripts/migrate-agents-to-workspaces.ts`
- [ ] Scan agents with UI metadata
- [ ] Generate workspace.json for each agent with UI config
- [ ] Remove UI fields from agent.json
- [ ] Create backup before migration
- **Validation**: Script successfully migrates existing configs

### 5.2 Update Documentation
- [ ] Update README with workspace/agent separation explanation
- [ ] Add workspace configuration guide
- [ ] Add migration guide for existing users
- [ ] Update architecture diagrams
- [ ] Add example workspace configurations
- **Validation**: Documentation is clear and complete

### 5.3 Create Example Workspace
- [ ] Create SA workspace with Calendar/Email and Salesforce tabs
- [ ] Configure global and local prompts
- [ ] Create placeholder Salesforce dashboard component
- [ ] Test full workflow: select workspace, switch tabs, use prompts
- **Validation**: SA workspace works end-to-end

## Phase 6: Testing and Polish

### 6.1 Integration Testing
- [ ] Test workspace CRUD operations
- [ ] Test tab navigation and state preservation
- [ ] Test prompt execution from different tabs
- [ ] Test agent dependency checking
- [ ] Test workspace/agent relationship consistency
- **Validation**: All integration tests pass

### 6.2 Error Handling
- [ ] Add error messages for missing agent references
- [ ] Add error messages for invalid workspace configs
- [ ] Add error messages for duplicate workspace slugs
- [ ] Add error messages for agent deletion with dependencies
- **Validation**: All error cases display helpful messages

### 6.3 UI Polish
- [ ] Add loading states for workspace switching
- [ ] Add animations for tab transitions
- [ ] Add icons for workspace selector
- [ ] Improve workspace editor UX
- [ ] Add keyboard shortcuts for tab navigation
- **Validation**: UI feels smooth and responsive

## Dependencies

- **Phase 1 and 2 can run in parallel** (backend and frontend foundations)
- **Phase 3 depends on Phase 1 and 2** (needs API and state management)
- **Phase 4 depends on Phase 2** (needs workspace state)
- **Phase 5 depends on Phase 1-4** (needs full implementation)
- **Phase 6 runs after Phase 5** (final testing and polish)

## Rollback Plan

If issues arise, the system can temporarily support both models:
1. Keep agent UI metadata parsing as fallback
2. Prefer workspace config when available
3. Fall back to agent UI metadata if no workspace found
4. This allows gradual migration and easy rollback
