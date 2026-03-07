# Project Architecture — Client-Side Integration Audit

> Maps every UI and SDK integration point that must change to support the Project concept.
> Companion to `docs/plans/project-architecture.md`.

---

## 1. NavigationContext (`src-ui/src/contexts/NavigationContext.tsx`)

### What it does today

Custom URL-based router built on `useSyncExternalStore` + `window.history`. No React Router.

**`NavigationState` shape:**
```ts
{
  pathname: string;
  selectedAgent: string | null;
  selectedWorkspace: string | null;   // ← workspace slug from URL
  activeConversation: string | null;
  activeChat: string | null;
  activeTab: string | null;
  isDockOpen: boolean;
  isDockMaximized: boolean;
  fontSize: number | null;
}
```

**URL patterns parsed today:**
- `/workspaces/:slug` → `selectedWorkspace`
- `/workspaces/:slug/:tabId` → `selectedWorkspace` + `activeTab`
- `/agents/:slug` → `selectedAgent`
- Query params: `?workspace=`, `?tab=`, `?dock=open`, `?maximize=true`, etc.

**Persistence:** `lastWorkspace` is stored in `localStorage` under `stallion-last-workspace`. Used to restore the last-used workspace on app load.

**Navigation methods exposed:**
- `setWorkspace(slug)` — navigates to `/workspaces/:slug`, persists to localStorage
- `setWorkspaceTab(slug, tabId)` — navigates to `/workspaces/:slug/:tabId`
- `setAgent(slug)` — navigates to `/agents/:slug`
- `setDockState(open, maximized)` — updates query params
- `setActiveChat(id)` — updates `?chat=` param
- `navigate(pathname, params)` — raw navigation
- `updateParams(params)` — replaceState without push

### What needs to change for Projects

1. **Add `selectedProject` to `NavigationState`.** Projects are the new top-level context. The URL scheme becomes `/projects/:projectSlug/layouts/:layoutSlug` (or similar).

2. **New URL patterns:**
   - `/projects/:projectSlug` — project home (shows first layout)
   - `/projects/:projectSlug/layouts/:layoutSlug` — specific layout
   - `/projects/:projectSlug/layouts/:layoutSlug/:tabId` — layout + tab
   - `/projects/:projectSlug/conversations` — conversation list for project
   - Keep `/workspaces/:slug` as a redirect to `/projects/default/layouts/:slug` for backwards compat

3. **Replace `lastWorkspace` with `lastProject` + `lastLayout`.** Two separate localStorage keys. The sidebar shows all projects so "last used" is less critical, but still useful for deep-linking.

4. **Add navigation methods:**
   - `setProject(slug)` — navigate to project
   - `setLayout(projectSlug, layoutSlug)` — navigate to layout within project
   - `setLayoutTab(projectSlug, layoutSlug, tabId)` — navigate to tab within layout

5. **`selectedWorkspace` → `selectedLayout`.** The concept of "selected workspace" becomes "selected layout within a project." Rename throughout.

6. **`NavigationState` additions:**
   ```ts
   selectedProject: string | null;    // new
   selectedLayout: string | null;     // replaces selectedWorkspace
   // selectedWorkspace kept as alias during migration
   ```

---

## 2. WorkspacesContext (`src-ui/src/contexts/WorkspacesContext.tsx`)

### What it does today

A `useSyncExternalStore`-based store that caches workspace data fetched from `/workspaces` API. Provides:
- `fetchAll(apiBase)` — fetches all workspaces, stores in memory
- `fetchOne(apiBase, slug)` — fetches single workspace
- `create/update/delete` — CRUD mutations
- `useWorkspaces(apiBase)` — subscribe to all workspaces
- `useWorkspace(apiBase, slug)` — subscribe to single workspace

**`WorkspaceData` shape:**
```ts
{
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabs: Array<{ id, label, component, prompts? }>;
  globalPrompts?: Array<{ id, label, prompt, agent? }>;
}
```

Note: This context is **separate from** the SDK's `useWorkspacesQuery` (which uses React Query). The context is used by `WorkspaceView` and `WorkspacesView`. The SDK query is used by `App.tsx`.

### What needs to change for Projects

1. **This context becomes `LayoutsContext` (or is replaced by a `ProjectsContext`).** The data it manages is layouts-within-projects, not top-level workspaces.

2. **New `ProjectsContext`** needed with:
   - `fetchAll()` → fetches `/api/projects` → list of `ProjectMetadata`
   - `fetchOne(slug)` → fetches `/api/projects/:slug` → full `ProjectConfig`
   - `create/update/delete` for projects
   - `useProjects()` — subscribe to project list
   - `useProject(slug)` — subscribe to single project

3. **`LayoutsContext`** (renamed from WorkspacesContext):
   - All methods gain a `projectSlug` parameter
   - `fetchAll(apiBase, projectSlug)` → `/api/projects/:slug/layouts`
   - `fetchOne(apiBase, projectSlug, layoutId)` → `/api/projects/:slug/layouts/:id`
   - `WorkspaceData` → `LayoutData` with `projectSlug` field added

4. **Migration shim:** Keep `WorkspacesContext` as a thin wrapper that reads from the Default project's layouts. Allows existing consumers (`WorkspaceView`, `WorkspacesView`) to work without immediate changes.

---

## 3. ActiveChatsContext (`src-ui/src/contexts/ActiveChatsContext.tsx`)

### What it does today

The most complex context. Manages all active chat sessions (the ChatDock tabs). Uses `useSyncExternalStore` + `sessionStorage` for persistence across page refreshes.

**`ChatUIState` shape (per session):**
```ts
{
  input, attachments, queuedMessages, inputHistory,
  status, hasUnread, abortController,
  agentSlug, agentName, title,
  conversationId,           // backend conversation ID
  messages, ephemeralMessages, toolCalls, streamingMessage,
  model,                    // per-session model override
  sessionAutoApprove,       // trusted tools for this session
  pendingApprovals, approvalToasts,
  isEditingQueue,
}
```

**Session keying:** Sessions are keyed by `sessionId` = `${agentSlug}:${Date.now()}`. The `conversationId` is assigned after the first message.

**Persistence:** `sessionStorage` stores minimal data: `{ sessionId, conversationId, agentSlug, model, sessionAutoApprove, ephemeralMessages, inputHistory }`. Rehydrated on mount.

**Key hooks exported:**
- `useCreateChatSession()` — creates a new session, returns sessionId
- `useOpenConversation(apiBase)` — opens an existing conversation in the dock
- `useSendMessage(apiBase, ...)` — sends a message, handles streaming, queuing, tool calls
- `useCancelMessage()` — aborts in-flight request
- `useRehydrateSessions(apiBase)` — restores sessions from sessionStorage on mount
- `useAllActiveChats()` — subscribe to all sessions
- `useActiveChatState(sessionId)` — subscribe to single session

### What needs to change for Projects

1. **Add `projectSlug` to `ChatUIState`.** Each chat session needs to know which project it belongs to (for RAG context, provider resolution, directory focus).

   ```ts
   // Add to ChatUIState:
   projectSlug?: string;          // Which project this chat belongs to
   projectName?: string;          // For display in dock tab badge
   focusDirectoryId?: string;     // Which project directory is focused
   ```

2. **Add `projectSlug` to `sessionStorage` persistence.** The minimal stored shape needs `projectSlug` so sessions can be rehydrated with correct project context.

3. **`useCreateChatSession()` gains optional `projectSlug` param:**
   ```ts
   // Before:
   createChatSession(agentSlug, agentName, title?)
   // After:
   createChatSession(agentSlug, agentName, title?, projectSlug?)
   ```

4. **`useSendMessage()` passes project context to backend.** The API call to `/agents/:slug/chat` gains an optional `projectId` query param (per the architecture plan) for RAG injection.

5. **Dock tab display.** Each session tab in `ChatDockTabBar` should show a project badge/color. The `ChatUIState.projectName` field enables this without additional lookups.

6. **"Quick Chat" sessions.** Sessions with no `projectSlug` are "Quick Chat" — no RAG, system default provider. The dock's "+" button should offer: "Quick Chat" vs "Chat in [current project]".

7. **Session pruning on startup.** The existing pruning logic (checks if conversations still exist on backend) should also validate that the project still exists.

8. **No structural changes to the store pattern.** The `useSyncExternalStore` + `sessionStorage` approach is solid and doesn't need to change. Just add fields.

---

## 4. App.tsx (`src-ui/src/App.tsx`)

### What it does today

The root component. Owns:
- `currentView: NavigationView` state — the active "page" (workspace, agents, settings, etc.)
- `activeTabId` state — active tab within the current workspace
- Route parsing on `popstate` — maps URL paths to `NavigationView` types
- `handleWorkspaceSelect(slug, preferredTabId)` — selects a workspace, sets tab, navigates
- `navigateToView(view)` — maps `NavigationView` to URL, calls `navigate()`
- `renderViewContent()` — renders the correct view component based on `currentView`
- Auto-selects workspace on load (prefers `lastWorkspace`, falls back to first)
- Passes workspace data down to `Header` as props

**Layout structure:**
```jsx
<div className="app">
  <Header workspaces={...} selectedWorkspace={...} ... />
  <div className="main-content">
    <div className="content-view">{renderViewContent()}</div>
  </div>
  <ChatDock />
  <GlobalVoiceButton />
</div>
```

No sidebar. The left nav items (Agents, Plugins, Monitoring, etc.) are in the `Header` as icon buttons.

### What needs to change for Projects

1. **Add project sidebar to layout.** The `<div className="app">` structure becomes:
   ```jsx
   <div className="app">
     <Header ... />  {/* simplified — no workspace selector */}
     <div className="app-body">
       <ProjectSidebar ... />   {/* new */}
       <div className="content-view">{renderViewContent()}</div>
     </div>
     <ChatDock />
     <GlobalVoiceButton />
   </div>
   ```

2. **`currentView` type union expands.** New view types needed:
   - `{ type: 'project'; projectSlug: string }` — project home
   - `{ type: 'layout'; projectSlug: string; layoutSlug: string }` — specific layout
   - `{ type: 'project-new' }` — create project form
   - `{ type: 'project-edit'; projectSlug: string }` — edit project
   - `{ type: 'project-knowledge'; projectSlug: string }` — knowledge management
   - Keep `{ type: 'workspace' }` as alias for `{ type: 'layout' }` during migration

3. **`handleWorkspaceSelect` → `handleLayoutSelect(projectSlug, layoutSlug, tabId?)`.**

4. **Auto-select logic changes.** Instead of auto-selecting a workspace, auto-expand the last-used project in the sidebar. The sidebar shows all projects — no "selected" project concept at the app level.

5. **`navigateToView` gains project/layout cases.** URL scheme: `/projects/:slug/layouts/:layoutSlug`.

6. **`useWorkspacesQuery` → `useProjectsQuery`.** App.tsx currently calls `useWorkspacesQuery()` from the SDK to get the workspace list for the Header. This becomes `useProjectsQuery()`.

7. **`selectedWorkspaceData` → `selectedLayoutData`.** The `useWorkspaceQuery(selectedWorkspace)` call becomes `useLayoutQuery(selectedProject, selectedLayout)`.

8. **Remove workspace auto-select `useEffect`.** The sidebar replaces the need for this — all projects are visible, no auto-selection needed.

9. **`Cmd+N` shortcut.** Currently "New workspace" → becomes "New project" or "New layout in current project" (TBD per UX).

---

## 5. Header (`src-ui/src/components/Header.tsx`)

### What it does today

The top toolbar. Contains:
- Brand logo + app name (links to workspace view)
- **Workspace indicator button** — shows current workspace icon + name. Click opens a modal autocomplete to switch workspaces. Disabled if only one workspace or none selected.
- Spacer
- Right-side actions: Schedule button, Manage button, Connection status, Notifications, Profile, Settings

**Workspace switching modal** (inline in Header, not a separate component):
- Full-screen overlay with search input
- Filtered list of workspaces with icon, name, description, plugin badge
- Keyboard navigation (arrow keys, Enter, Escape)

**Props:**
```ts
{
  workspaces: any[];
  selectedWorkspace: any | null;
  currentView?: NavigationView;
  onWorkspaceSelect: (slug: string) => void;
  onCreateWorkspace?: () => void;
  onEditWorkspace?: (slug: string) => void;
  onToggleSettings: () => void;
  onNavigate: (view: NavigationView) => void;
}
```

Note: `WorkspaceSelector` component exists (`src-ui/src/components/WorkspaceSelector.tsx`) but is **not used** by `Header.tsx`. The Header has its own inline workspace switching modal. `WorkspaceSelector` appears to be unused/orphaned.

### What needs to change for Projects

1. **Remove the workspace indicator button entirely.** Per the architecture plan, the workspace selector dropdown is replaced by the project sidebar. The Header no longer needs workspace switching.

2. **Remove the workspace autocomplete modal** (the `showWorkspaceAutocomplete` state and the modal JSX at the bottom of Header).

3. **Remove workspace-related props:** `workspaces`, `selectedWorkspace`, `onWorkspaceSelect`, `onCreateWorkspace`, `onEditWorkspace`.

4. **Optionally add a breadcrumb.** The plan mentions "project context breadcrumb" in the header. This would show `[Project Name] / [Layout Name]` as a lightweight context indicator. Read-only — navigation happens via sidebar.

5. **The nav buttons (Schedule, Manage) may move to the sidebar.** Per the architecture diagram, global nav items (Agents, Plugins, Monitoring, Schedule) move to the bottom of the project sidebar. The Header becomes purely a top bar with brand + global actions (notifications, profile, settings, connection status).

6. **Simplified Header props:**
   ```ts
   {
     currentView?: NavigationView;
     breadcrumb?: { project: string; layout?: string };  // new
     onToggleSettings: () => void;
     onNavigate: (view: NavigationView) => void;
   }
   ```

---

## 6. WorkspaceSelector (`src-ui/src/components/WorkspaceSelector.tsx`)

### What it does today

A standalone dropdown component for selecting workspaces. Shows workspace list with icons, names, descriptions, tab counts. Has keyboard navigation, edit button per workspace, "New" button.

**Currently not used anywhere in the app.** Header.tsx has its own inline workspace switching modal. This component appears to be dead code.

### What needs to change for Projects

**Delete it.** It's unused and the concept it represents (workspace dropdown selector) is being replaced by the project sidebar. No migration needed.

---

## 7. ChatDock (`src-ui/src/components/ChatDock.tsx`)

### What it does today

The persistent bottom panel for chat sessions. Renders:
- `ChatDockHeader` — collapse/expand controls, unread count
- `ChatDockTabBar` — tabs for each active session, "+" new chat button
- `ChatDockBody` — the active session's message list + input
- `NewChatModal` — agent picker for new sessions
- `SessionPickerModal` — browse/restore past conversations
- `ChatSettingsPanel` — font size, reasoning display, tool details

**State management:** Delegates to `useChatDockState`, `useChatDockActions`, `useChatDockKeyboardShortcuts`, `useDerivedSessions`, `useChatInput`.

**Key behavior:**
- Sessions are derived from `ActiveChatsContext` + `ConversationsContext`
- `selectedAgent` from `NavigationContext` is used to filter/default sessions
- Dock height is resizable via drag handle
- Keyboard shortcuts: Cmd+K (new chat), Cmd+[ / Cmd+] (switch tabs), etc.

**No project awareness today.** Sessions have no project context.

### What needs to change for Projects

1. **Tab badges for project context.** Each `SessionTab` in `ChatDockTabBar` should show a small project color/icon badge. Requires `projectSlug` in `ChatUIState` (see §3).

2. **"New Chat" modal gains project context.** The `NewChatModal` (agent picker) should default to agents available in the current project. It should also offer "Quick Chat" (no project).

3. **`useDerivedSessions` may filter by project.** Currently it filters by `selectedAgent`. With projects, it might optionally filter to show only sessions from the current project, with a toggle to show all.

4. **No structural changes to ChatDock itself.** The dock stays global. The architecture plan explicitly says "ChatDock remains global." The changes are additive (project badges, project-aware new chat).

5. **`selectedAgent` dependency.** ChatDock reads `selectedAgent` from NavigationContext. With projects, this might become `selectedProject` as the primary context signal. Low-impact change.

---

## 8. SDK — `workspace/index.ts` + `workspace/context.tsx`

### What it does today

**`workspace/index.ts`:** Exports `WorkspaceAPI` class — a plugin-facing API for accessing the plugin's own manifest (capabilities, permissions). Not related to workspace switching. Used by plugins to check their own capabilities.

**`workspace/context.tsx`:** Exports `createWorkspaceContext<T>()` — a factory for creating typed React contexts scoped to a workspace, with optional `sessionStorage` persistence. Used by plugins to store workspace-local state.

Also exports:
- `WorkspaceProvider` — wraps plugins with SDK context + sets workspace context for agent resolution
- `WorkspaceNavigationProvider` — manages URL hash state per tab (tab-level navigation within a workspace)
- `useWorkspaceNavigation()` — hook for tab hash state

### What needs to change for Projects

1. **`createWorkspaceContext` → `createLayoutContext`.** The storage key is `workspace:${workspaceSlug}:context`. This should become `layout:${projectSlug}:${layoutSlug}:context` to properly scope state to a layout within a project. The function signature stays the same — just the key format changes.

2. **`WorkspaceProvider` gains `project` prop.** Currently takes `workspace?: WorkspaceConfig`. Should also accept `project?: ProjectConfig` so plugins can access project-level context (provider, directories, etc.).

3. **`WorkspaceNavigationProvider` is layout-scoped, not workspace-scoped.** The `workspaceSlug` prop becomes `layoutSlug` (or `projectSlug + layoutSlug`). The sessionStorage keys change accordingly.

4. **`WorkspaceAPI` class is fine as-is.** It's about plugin manifests, not workspace data. No changes needed.

5. **`_setWorkspaceContext` in `WorkspaceProvider`.** This sets the workspace context for agent name resolution (short slug → full qualified slug). With projects, this should also set project context so agents can be resolved within project scope.

---

## 9. SDK — `providers.tsx`

### What it does today

**`SDKProvider`** — wraps plugins with the `SDKContext` (injects all core contexts + hooks).

**`WorkspaceProvider`** — convenience wrapper that:
1. Calls `_setWorkspaceContext(workspace)` on mount (for agent resolution)
2. Wraps children in `SDKProvider`

**`SDKContextValue` shape:**
```ts
{
  apiBase: string;
  contexts: {
    agents, workspaces, conversations, activeChats,
    models, config, navigation, toast, stats, auth,
    keyboardShortcuts, workflows
  };
  hooks: {
    slashCommandHandler, slashCommands, toolApproval, keyboardShortcut
  };
}
```

### What needs to change for Projects

1. **Add `projects` to `SDKContextValue.contexts`:**
   ```ts
   contexts: {
     // existing...
     workspaces?: any;   // keep for backwards compat
     projects?: any;     // new — provides useProjects(), useProject()
   }
   ```

2. **`WorkspaceProvider` gains project context:**
   ```ts
   interface WorkspaceProviderProps {
     sdk: SDKContextValue;
     workspace?: WorkspaceConfig;   // keep for compat
     project?: ProjectConfig;       // new
     layout?: LayoutConfig;         // new
     children: ReactNode;
   }
   ```

3. **`_setWorkspaceContext` → `_setLayoutContext`.** The agent resolution function needs both project and layout context to resolve short agent names. The internal API module needs updating.

4. **No breaking changes needed immediately.** The `SDKContextValue` is additive — existing plugins using `contexts.workspaces` continue to work. New plugins use `contexts.projects`.

---

## 10. SDK — `queries.ts` (React Query hooks)

### What it does today

React Query wrappers for all API calls. Workspace-related:
- `useWorkspaceQuery(slug)` — fetches `/workspaces/:slug`
- `useWorkspacesQuery()` — fetches `/workspaces`

Used by `App.tsx` directly (not via SDK hooks — App.tsx imports from `@stallion-ai/sdk`).

### What needs to change for Projects

1. **Add project query hooks:**
   ```ts
   useProjectsQuery(config?)           // GET /api/projects
   useProjectQuery(slug, config?)      // GET /api/projects/:slug
   useProjectLayoutsQuery(slug, config?) // GET /api/projects/:slug/layouts
   useProjectLayoutQuery(projectSlug, layoutId, config?) // GET /api/projects/:slug/layouts/:id
   useProjectKnowledgeQuery(slug, config?) // GET /api/projects/:slug/knowledge
   ```

2. **Keep `useWorkspaceQuery` and `useWorkspacesQuery`** for backwards compat. They can proxy to the Default project's layouts internally, or just remain pointing at `/workspaces` during the migration phase.

3. **Add project mutation hooks:**
   ```ts
   useCreateProjectMutation()
   useUpdateProjectMutation()
   useDeleteProjectMutation()
   useCreateLayoutMutation(projectSlug)
   useUpdateLayoutMutation(projectSlug)
   useDeleteLayoutMutation(projectSlug)
   ```

4. **`App.tsx` migration:** Replace `useWorkspacesQuery()` → `useProjectsQuery()` and `useWorkspaceQuery(selectedWorkspace)` → `useProjectQuery(selectedProject)`.

---

## 11. SDK — `hooks.ts` (SDK context hooks)

### What it does today

Thin wrappers around `SDKContext` that delegate to injected core contexts. Workspace-related:
- `useWorkspaces()` — delegates to `sdk.contexts.workspaces.useWorkspaces()`
- `useWorkspace(slug)` — delegates to `sdk.contexts.workspaces.useWorkspace(slug)`
- `useResolveAgent(agentSlug)` — resolves short agent name using current workspace's `availableAgents`

### What needs to change for Projects

1. **Add project hooks:**
   ```ts
   useProjects()                    // delegates to sdk.contexts.projects.useProjects()
   useProject(slug)                 // delegates to sdk.contexts.projects.useProject(slug)
   useProjectLayouts(projectSlug)   // delegates to sdk.contexts.projects.useLayouts(slug)
   ```

2. **`useResolveAgent` needs project context.** Currently resolves using `currentWorkspace.availableAgents`. With projects, resolution should check project-scoped agents first, then global agents.

3. **Keep `useWorkspaces()` and `useWorkspace(slug)` as aliases** pointing to the Default project's layouts during migration.

4. **`useSendToChat` gains optional `projectSlug`:**
   ```ts
   useSendToChat(agentSlug, projectSlug?)
   ```
   When `projectSlug` is provided, the created session carries project context.

---

## Summary: Change Impact Matrix

| File | Change Type | Effort | Breaking? |
|---|---|---|---|
| `NavigationContext.tsx` | Add `selectedProject`, new URL patterns, new nav methods | Medium | No (additive) |
| `WorkspacesContext.tsx` | Rename to `LayoutsContext`, add `projectSlug` param | Medium | Yes (rename) |
| `ActiveChatsContext.tsx` | Add `projectSlug` to `ChatUIState` + persistence | Small | No (additive) |
| `App.tsx` | Add sidebar, new view types, project-based routing | Large | Yes (layout change) |
| `Header.tsx` | Remove workspace selector, simplify props | Small | Yes (prop removal) |
| `WorkspaceSelector.tsx` | Delete (unused) | Trivial | N/A |
| `ChatDock.tsx` | Add project badges to tabs, project-aware new chat | Small | No (additive) |
| `sdk/workspace/index.ts` | No changes needed | None | No |
| `sdk/workspace/context.tsx` | Update storage key format, add project prop | Small | No (additive) |
| `sdk/providers.tsx` | Add `projects` to SDKContextValue, update WorkspaceProvider | Small | No (additive) |
| `sdk/queries.ts` | Add project query/mutation hooks | Medium | No (additive) |
| `sdk/hooks.ts` | Add project hooks, update useResolveAgent | Small | No (additive) |

### New Components Needed

| Component | Purpose |
|---|---|
| `ProjectSidebar` | Replaces workspace selector. Shows all projects, collapsible, with layouts + recent threads per project. Global nav at bottom. |
| `ProjectSidebarItem` | Single project entry in sidebar (icon, name, expand/collapse, layouts list) |
| `LayoutItem` | Single layout entry within a project in the sidebar |
| `ProjectSettingsView` | Edit project (name, icon, directories, provider override) |
| `ProjectKnowledgeView` | Document upload, embedding status, search (Phase 3) |
| `NewProjectModal` | Create project form |
| `ProjectsContext` | New context for project list + CRUD |

### New SDK Exports Needed

| Export | File |
|---|---|
| `useProjectsQuery` | `sdk/queries.ts` |
| `useProjectQuery` | `sdk/queries.ts` |
| `useProjectLayoutsQuery` | `sdk/queries.ts` |
| `useProjects` | `sdk/hooks.ts` |
| `useProject` | `sdk/hooks.ts` |

### Types to Add/Update

| Type | File | Change |
|---|---|---|
| `NavigationView` | `src-ui/src/types.ts` | Add `project`, `layout`, `project-new`, `project-edit`, `project-knowledge` variants |
| `NavigationState` | `NavigationContext.tsx` | Add `selectedProject`, rename `selectedWorkspace` → `selectedLayout` |
| `ChatUIState` | `ActiveChatsContext.tsx` | Add `projectSlug`, `projectName`, `focusDirectoryId` |
| `SDKContextValue` | `sdk/providers.tsx` | Add `projects` to `contexts` |

---

## Migration Strategy (Phase 1 — Sidebar Transition)

Per the architecture plan's Phase 1, the migration is non-breaking:

1. **Create `ProjectsContext`** alongside `WorkspacesContext` (don't replace yet).
2. **Create `ProjectSidebar`** component. Initially it shows a single "Default" project containing all existing workspaces as layouts.
3. **Add sidebar to `App.tsx` layout** — the workspace selector in Header is hidden (not removed) while sidebar is being built.
4. **`NavigationContext`** gets `selectedProject` added. `selectedWorkspace` remains as an alias for `selectedLayout` within the default project.
5. **Once sidebar is stable**, remove the workspace selector from Header and the `WorkspaceSelector` component.
6. **`WorkspacesContext`** is kept as-is during Phase 1. It becomes `LayoutsContext` in Phase 2 when multi-project is fully supported.

This means Phase 1 has zero breaking changes to existing plugin code or workspace configs.
