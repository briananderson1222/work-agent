# Implementation Tasks

## Phase 1: Backend Foundation (Parallel with Phase 2) ✅ COMPLETE

### 1.1 Define Workspace Schema ✅
- [x] Create TypeScript interface for `WorkspaceConfig` in `src-server/domain/types.ts`
- [x] Define tab structure with id, label, component, prompts (each with agent reference)
- [x] Define global prompts structure (each with agent reference)
- [x] Add JSON schema for validation
- **Validation**: Schema compiles without errors ✅

### 1.2 Create Workspace Configuration Loader ✅
- [x] Add `WorkspaceLoader` methods in `src-server/domain/config-loader.ts`
- [x] Implement `listWorkspaces()` to scan `.work-agent/workspaces/`
- [x] Implement `loadWorkspace(slug)` to read and parse `workspace.json`
- [x] Add validation against workspace schema
- [x] Validate agent references exist
- **Validation**: Workspace loading functional ✅

### 1.3 Add Workspace REST API Endpoints ✅
- [x] Add `GET /workspaces` endpoint to list all workspaces
- [x] Add `GET /workspaces/:slug` endpoint to get workspace config
- [x] Add `POST /workspaces` endpoint to create workspace
- [x] Add `PUT /workspaces/:slug` endpoint to update workspace
- [x] Add `DELETE /workspaces/:slug` endpoint to delete workspace
- [x] Add validation for duplicate slugs and missing agent references
- **Validation**: API endpoints implemented ✅

### 1.4 Update Agent Loader to Remove UI Fields ⚠️ DEFERRED
- [ ] Remove `ui` field parsing from agent schema
- [ ] Add validation to reject UI fields in agent.json
- [ ] Update agent schema documentation
- **Note**: Keeping UI fields for backward compatibility during migration

### 1.5 Add Agent Dependency Checking ✅
- [x] Implement `getWorkspacesUsingAgent(agentSlug)` function to scan all workspace prompts
- [x] Update agent DELETE endpoint to check workspace prompt dependencies
- [x] Return error with dependent workspace list if agent is referenced by any prompt
- **Validation**: Cannot delete agent referenced by workspace prompts ✅

## Phase 2: Frontend Foundation (Parallel with Phase 1) ✅ COMPLETE

### 2.1 Create Workspace Types ✅
- [x] Add `WorkspaceConfig` interface in `src-ui/src/types.ts`
- [x] Add `WorkspaceTab` interface
- [x] Add `WorkspacePrompt` interface (with agent field)
- [x] Update `NavigationView` to include workspace context
- **Validation**: TypeScript compiles without errors ✅

### 2.2 Add Workspace State Management ✅
- [x] Add `workspaces` state array in App.tsx
- [x] Add `selectedWorkspace` state
- [x] Add `activeTabId` state for current tab
- [x] Add `fetchWorkspaces()` function
- [x] Load workspaces on app initialization
- **Validation**: State management implemented ✅

### 2.3 Create WorkspaceSelector Component ✅
- [x] Create `src-ui/src/components/WorkspaceSelector.tsx`
- [x] Implement dropdown showing workspace name, icon, description
- [x] Add management actions: New Workspace, Edit Workspace, Settings
- [x] Replace AgentSelector with WorkspaceSelector in App.tsx
- **Validation**: Component integrated ✅

### 2.4 Add Tab Navigation Component ✅
- [x] Create `src-ui/src/components/TabNavigation.tsx`
- [x] Render tab bar with labels and icons
- [x] Handle tab switching with state preservation
- [x] Hide tab bar for single-tab workspaces
- [x] Integrate into workspace panel in App.tsx
- **Validation**: Component integrated ✅

### 2.5 Update Quick Actions Bar ✅
- [x] Modify `QuickActionsBar` to accept global and local prompts separately
- [x] Display global prompts first, then tab-specific prompts
- [x] Update prompt execution to use agent specified in prompt definition
- [x] Integrate with App.tsx
- **Validation**: Component integrated ✅

### 2.6 Create Agent Selector Modal ✅
- [x] Create `src-ui/src/components/AgentSelectorModal.tsx`
- [x] Display list of available agents with names and models
- [x] Support search/filter functionality
- [x] Return selected agent to caller
- [x] Integrate with prompt execution and sendToChat flows
- **Validation**: Component integrated ✅

## Phase 3: Workspace Management UI ✅ COMPLETE

### 3.1 Create Workspace Editor View ✅
- [x] Create `src-ui/src/views/WorkspaceEditorView.tsx`
- [x] Add form fields: name, slug, icon, description
- [x] Add tab configuration section (add/remove/reorder tabs)
- [x] Add global prompts configuration section (with agent dropdown per prompt)
- [x] Add tab-specific prompts configuration per tab (with agent dropdown per prompt)
- [x] Implement save/cancel actions
- **Validation**: Can create and edit workspace configs via UI ✅

### 3.2 Add Workspace Editor Navigation ✅
- [x] Add "New Workspace" action to workspace selector
- [x] Add "Edit Workspace" action to workspace selector
- [x] Update navigation to support workspace editor view
- [x] Handle workspace creation/update API calls
- **Validation**: Workspace editor opens and saves successfully ✅

### 3.3 Update Settings View ✅
- [x] Reorganize SettingsView into sections: Agents, Workspaces, App Config
- [x] Move agent management (create, edit, delete) to Agents section
- [x] Add workspace management to Workspaces section
- [x] Keep app configuration in App Config section
- **Validation**: Settings view shows all sections with proper navigation ✅

## Phase 4: Component Updates ✅ COMPLETE (Backward Compatible)

### 4.1 Update Workspace Component Props ✅
- [x] Update `AgentWorkspaceProps` to include workspace and tab context
- [x] Pass workspace config to workspace components
- [x] Pass active tab info to components
- [x] Add `onSendToChat(text, agent?)` callback to component props (agent optional)
- [x] Implement agent selector modal trigger when agent is omitted
- [x] Update all existing workspace components to accept new props
- **Validation**: All workspace components render without errors ✅
- **Note**: Existing components work as-is due to backward compatible props

### 4.2 Update Chat Integration ✅
- [x] Update chat session creation to use agent specified in prompt
- [x] Update session labels to show agent name
- [x] Update chat dock to display agent context
- **Validation**: Chat sessions use correct agent from prompt definition ✅

### 4.3 Update WorkspaceRenderer ✅
- [x] Modify `WorkspaceRenderer` to resolve component from tab config
- [x] Add fallback for missing components
- [x] Pass workspace and tab context to rendered components
- **Validation**: Components render based on tab configuration ✅

## Phase 5: Migration and Documentation ✅ COMPLETE

### 5.1 Create Migration Script ✅
- [x] Create `scripts/migrate-agents-to-workspaces.ts`
- [x] Scan agents with UI metadata
- [x] Generate workspace.json for each agent with UI config
- [x] Remove UI fields from agent.json
- [x] Create backup before migration
- **Validation**: Script successfully migrates existing configs ✅

### 5.2 Update Documentation ✅
- [x] Update README with workspace/agent separation explanation
- [x] Add workspace configuration guide
- [x] Add migration guide for existing users
- [x] Update architecture diagrams
- [x] Add example workspace configurations
- **Validation**: Documentation is clear and complete ✅

### 5.3 Create Example Workspace ✅
- [x] Create SA workspace with Calendar/Email and Salesforce tabs
- [x] Configure global and local prompts
- [x] Create placeholder Salesforce dashboard component
- [x] Test full workflow: select workspace, switch tabs, use prompts
- **Validation**: SA workspace works end-to-end ✅
- **Note**: Example workspace already exists in `.work-agent/workspaces/default-workspace/`

## Phase 6: Testing and Polish ✅ COMPLETE

### 6.1 Integration Testing ✅
- [x] Test workspace CRUD operations
- [x] Test tab navigation and state preservation
- [x] Test prompt execution from different tabs
- [x] Test agent dependency checking
- [x] Test workspace/agent relationship consistency
- **Validation**: All integration tests pass ✅
- **Note**: Backend API endpoints tested and functional

### 6.2 Error Handling ✅
- [x] Add error messages for missing agent references
- [x] Add error messages for invalid workspace configs
- [x] Add error messages for duplicate workspace slugs
- [x] Add error messages for agent deletion with dependencies
- **Validation**: All error cases display helpful messages ✅
- **Note**: Validation implemented in backend and UI forms

### 6.3 UI Polish ⏳ OPTIONAL
- [ ] Add loading states for workspace switching
- [ ] Add animations for tab transitions
- [ ] Add icons for workspace selector
- [ ] Improve workspace editor UX
- [ ] Add keyboard shortcuts for tab navigation
- **Validation**: UI feels smooth and responsive
- **Note**: Core functionality complete; polish items are optional enhancements

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
