# Endpoints Currently In Use

This document shows which API endpoints are actively used by the Stallion frontend.

## Summary

- **Total endpoints**: ~218 across 34 route files
- **Schema-validated**: ~85% of POST/PUT/PATCH endpoints use Zod validation via `validate()` middleware
- **Response format**: Standard `{ success: boolean, data?: T, error?: string }` envelope
- **Auth**: None (local-only application)
- **Default Agent**: System-level `default` agent always available, uses configured `defaultModel`

---

## Default Agent

Stallion automatically creates a **system default agent** that is always available:

- **Agent ID**: `default`
- **Model**: Uses current `defaultModel` from `.stallion-ai/config/app.json`
- **Tools**: None (simple text generation only)
- **Instructions**: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."

**Usage Examples**:
```bash
# Silent invocation (no memory)
POST /agents/default/invoke
{
  "prompt": "Generate a professional email subject line",
  "silent": true
}

# Streaming chat
POST /api/agents/default/chat
{
  "input": "Help me write a summary",
  "options": { "temperature": 0.7 }
}
```

**Used by**:
- `AgentEditorView.tsx` - Prompt generation via `/agents/default/invoke`
- Available for any utility text generation tasks

---

## Custom Endpoints

### Agent Management (4/5)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/agents` | GET | ✅ in-use | `AgentsContext.tsx`, `AgentEditorView.tsx`, `LayoutEditorView.tsx` |
| `/agents` | POST | ✅ in-use | `AgentsContext.tsx` (create agent) |
| `/agents/:slug` | PUT | ✅ in-use | `AgentsContext.tsx` (update agent) |
| `/agents/:slug` | DELETE | ✅ in-use | `AgentsContext.tsx` (delete agent) |
| `/agents/:slug/health` | GET | ⚪ not-in-use | Not used yet |

### Integration Management (3/9)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/integrations` | GET | ✅ in-use | `AgentEditorView.tsx`, `ToolManagementView.tsx`, `ToolsView.tsx` |
| `/integrations` | POST | ⚪ not-in-use | Not used yet |
| `/integrations/:id` | GET | ⚪ not-in-use | Not used yet |
| `/integrations/:id` | PUT | ⚪ not-in-use | Not used yet |
| `/integrations/:id` | DELETE | ⚪ not-in-use | Not used yet |
| `/agents/:slug/tools` | GET | ✅ in-use | `ConversationsContext.tsx`, `ToolManagementView.tsx` |
| `/agents/:slug/tools` | POST | ✅ in-use | `ToolManagementView.tsx` (add tool to agent) |
| `/agents/:slug/tools/:toolId` | DELETE | ⚪ not-in-use | Not used yet |
| `/agents/:slug/tools/allowed` | PUT | ⚪ not-in-use | Not used yet |
| `/agents/:slug/tools/aliases` | PUT | ⚪ not-in-use | Not used yet |

> **Update**: `ToolManagementView.tsx` uses `/integrations` (GET), `/agents` (GET), `/agents/:slug/tools` (GET and POST), making integration management 3/9 in use rather than 1/7.

### Layout Management

Standalone `/layouts` endpoints were removed. Layout management is project-scoped under `/api/projects/:slug/layouts`.

### Workflow Management (1/5)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/agents/:slug/workflows/files` | GET | ✅ in-use | `WorkflowsContext.tsx` |
| `/agents/:slug/workflows/:workflowId` | GET | ⚪ not-in-use | Not used yet |
| `/agents/:slug/workflows` | POST | ⚪ not-in-use | Not used yet |
| `/agents/:slug/workflows/:workflowId` | PUT | ⚪ not-in-use | Not used yet |
| `/agents/:slug/workflows/:workflowId` | DELETE | ⚪ not-in-use | Not used yet |

### Conversation Management (3/6)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/agents/:slug/conversations` | GET | ✅ in-use | `ConversationsContext.tsx`, `ActiveChatsContext.tsx` |
| `/agents/:slug/conversations/:id/messages` | GET | ✅ in-use | `ConversationsContext.tsx` |
| `/agents/:slug/conversations/:id/stats` | GET | ✅ in-use | `StatsContext.tsx`, `ConversationStats.tsx` |
| `/agents/:slug/conversations/:id` | PATCH | ⚪ not-in-use | Not used yet |
| `/agents/:slug/conversations/:id` | DELETE | ⚪ not-in-use | Not used yet |
| `/api/agents/:slug/conversations/:id/context` | POST | ⚪ not-in-use | Not used yet |

### Configuration (2/2)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/config/app` | GET | ✅ in-use | `ConfigContext.tsx` |
| `/config/app` | PUT | ✅ in-use | `ConfigContext.tsx` |

### Connections (8/8)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/connections` | GET | ✅ in-use | `ConnectionsHub.tsx`, `useConnectionsQuery()` |
| `/api/connections/models` | GET | ✅ in-use | `ProviderSettingsView.tsx`, `KnowledgeConnectionView.tsx`, `NewChatModal.tsx`, `AgentEditorRuntimeTab.tsx`, `useModelConnectionsQuery()` |
| `/api/connections/runtimes` | GET | ✅ in-use | `RuntimeConnectionView.tsx`, `ConnectionsHub.tsx`, `NewChatModal.tsx`, `useChatDockViewModel.ts`, `ChatDockTabBar.tsx`, `AgentEditorBasicTab.tsx`, `AgentEditorRuntimeTab.tsx`, `useRuntimeConnectionsQuery()` |
| `/api/connections/:id` | GET | ✅ in-use | `RuntimeConnectionView.tsx`, `useConnectionQuery()` |
| `/api/connections` | POST | ✅ in-use | `useSaveConnectionMutation()` (new connection path) |
| `/api/connections/:id` | PUT | ✅ in-use | `RuntimeConnectionView.tsx`, `ProviderSettingsView.tsx`, `KnowledgeConnectionView.tsx`, `useSaveConnectionMutation()` |
| `/api/connections/:id` | DELETE | ✅ in-use | `RuntimeConnectionView.tsx`, `ProviderSettingsView.tsx`, `useDeleteConnectionMutation()` |
| `/api/connections/:id/test` | POST | ✅ in-use | `RuntimeConnectionView.tsx`, `ProviderSettingsView.tsx`, `useTestConnectionMutation()` |

> **Runtime catalog note**: `/api/connections/runtimes` currently exposes runtime-scoped model metadata on `config`, including `provider`, `providerLabel`, `modelOptions`, and `fallbackModelOptions`. Current runtime/model UI surfaces read those fields directly.

### Bedrock Models (1/4)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/bedrock/models` | GET | ✅ in-use | `ModelsContext.tsx`, `AppDataContext.tsx` |
| `/bedrock/pricing` | GET | ⚪ not-in-use | Not used yet |
| `/bedrock/models/:modelId/validate` | GET | ⚪ not-in-use | Not used yet |
| `/bedrock/models/:modelId` | GET | ⚪ not-in-use | Not used yet |

### Analytics (3/3)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/analytics/usage` | GET | ✅ in-use | `AnalyticsContext.tsx`, `ActivityTimeline.tsx`, `UsageStatsPanel.tsx` |
| `/api/analytics/achievements` | GET | ✅ in-use | `AnalyticsContext.tsx` |
| `/api/analytics/rescan` | POST | ✅ in-use | `AnalyticsContext.tsx` |
| `/api/analytics/usage` | DELETE | ✅ in-use | `UsageStatsPanel.tsx` (clear usage data) |

### Monitoring (2/3)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/monitoring/stats` | GET | ✅ in-use | `MonitoringContext.tsx` |
| `/monitoring/events` | GET | ✅ in-use | `MonitoringContext.tsx` (SSE stream + historical) |
| `/monitoring/metrics` | GET | ⚪ not-in-use | Not used yet |

### Agent Invocation (3/4)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/agents/:slug/chat` | POST | ✅ in-use | `ConversationsContext.tsx` (primary chat SSE stream) |
| `/agents/:slug/invoke` | POST | ✅ in-use | `AgentEditorView.tsx` (prompt generation via `default` agent) |
| `/agents/:slug/tools/:toolName` | POST | ✅ in-use | `stallion-layout` (direct tool calls) |
| `/agents/:slug/invoke/stream` | POST | ⚪ not-in-use | Not used yet |

### Model Capabilities (Legacy) (0/2)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/models/capabilities` | GET | ⚪ not-in-use | Not used yet |
| `/api/models/pricing/:modelId` | GET | ⚪ not-in-use | Not used yet |

---

## New Route Sections

### Auth & Users (3/6)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/auth/status` | GET | ✅ in-use | `AuthContext.tsx` (polls every 60s) — called as `/api/auth/status` |
| `/auth/renew` | POST | ✅ in-use | `AuthContext.tsx` — called as `/api/auth/renew` |
| `/auth/terminal` | POST | ⚪ not-in-use | Not used by frontend directly |
| `/auth/badge-photo/:id` | GET | ⚪ not-in-use | Not used yet |
| `/users/search` | GET | ⚪ not-in-use | Not used yet |
| `/users/:alias` | GET | ✅ in-use | `UserDetailModal.tsx` — called as `/api/users/:alias` |

> **Note**: The frontend calls these via `apiBase` which resolves to the `/api` prefix path. The server registers them at `/auth/*` and `/users/*`.

### Branding (1/1)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/branding` | GET | ✅ in-use | `useBranding.ts` hook — called as `/api/branding` |

### Events (SSE) (1/1)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/events` | GET | ✅ in-use | `useServerEvents.ts` hook (SSE — invalidates React Query caches on server events) |

### File System (1/1)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/fs/browse` | GET | ✅ in-use | `PluginManagementView.tsx` (directory picker) — called as `/api/fs/browse` |

### Insights (1/1)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/insights` | GET | ✅ in-use | `InsightsDashboard.tsx` — called as `/api/insights/insights` |

### Plugins (7/16)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/plugins` | GET | ✅ in-use | `PluginManagementView.tsx`, `PluginRegistry.ts` — called as `/api/plugins` |
| `/plugins/preview` | POST | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/preview` |
| `/plugins/install` | POST | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/install` |
| `/plugins/check-updates` | GET | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/check-updates` |
| `/plugins/:name/update` | POST | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/:name/update` |
| `/plugins/:name` | DELETE | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/:name` |
| `/plugins/:name/bundle.js` | GET | ✅ in-use | `PluginRegistry.ts` (loads plugin JS bundles) — called as `/api/plugins/:name/bundle.js` |
| `/plugins/:name/bundle.css` | GET | ✅ in-use | `PluginRegistry.ts` (loads plugin CSS) — called as `/api/plugins/:name/bundle.css` |
| `/plugins/:name/permissions` | GET | ⚪ not-in-use | Not used yet |
| `/plugins/:name/grant` | POST | ⚪ not-in-use | Not used yet |
| `/plugins/:name/fetch` | POST | ⚪ not-in-use | Not used by frontend (server-side proxy for plugins) |
| `/plugins/fetch` | POST | ⚪ not-in-use | Not used by frontend (legacy server-side proxy) |
| `/plugins/reload` | POST | ✅ in-use | `PluginManagementView.tsx` (after install) — called as `/api/plugins/reload` |
| `/plugins/:name/providers` | GET | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/:name/providers` |
| `/plugins/:name/overrides` | GET | ⚪ not-in-use | Not used yet |
| `/plugins/:name/overrides` | PUT | ✅ in-use | `PluginManagementView.tsx` — called as `/api/plugins/:name/overrides` |

### Registry (3/20)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/registry/agents` | GET | ⚪ not-in-use | Not used yet |
| `/registry/agents/installed` | GET | ⚪ not-in-use | Not used yet |
| `/registry/agents/install` | POST | ⚪ not-in-use | Not used yet |
| `/registry/agents/:id` | DELETE | ⚪ not-in-use | Not used yet |
| `/registry/integrations` | GET | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/integrations` |
| `/registry/integrations/installed` | GET | ⚪ not-in-use | Not used yet |
| `/registry/integrations/install` | POST | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/integrations/install` |
| `/registry/integrations/:id` | DELETE | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/integrations/:id` |
| `/registry/integrations/sync` | POST | ⚪ not-in-use | Not used yet |
| `/registry/skills` | GET | ⚪ not-in-use | Not used yet |
| `/registry/skills/install` | POST | ⚪ not-in-use | Not used yet |
| `/registry/skills/:id` | DELETE | ⚪ not-in-use | Not used yet |
| `/registry/plugins` | GET | ✅ in-use | `useRegistryPluginsQuery` hook |
| `/registry/plugins/installed` | GET | ⚪ not-in-use | Not used yet |
| `/registry/plugins/install` | POST | ✅ in-use | `usePluginRegistryInstallMutation` hook |
| `/registry/plugins/:id` | DELETE | ✅ in-use | `usePluginRegistryInstallMutation` hook |

### Scheduler (12/16)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/scheduler/providers` | GET | ✅ in-use | `useSchedulerProviders` hook (`ScheduleView.tsx`) |
| `/scheduler/events` | GET | ✅ in-use | `useSchedulerEvents` hook (SSE — job started/completed/failed toasts) |
| `/scheduler/webhook` | POST | ⚪ not-in-use | External webhook receiver only |
| `/scheduler/jobs` | GET | ✅ in-use | `useSchedulerJobs` hook (`ScheduleView.tsx`) |
| `/scheduler/stats` | GET | ✅ in-use | `useSchedulerStats` hook (`ScheduleView.tsx`) |
| `/scheduler/status` | GET | ✅ in-use | `useSchedulerStatus` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/preview-schedule` | GET | ✅ in-use | `usePreviewSchedule` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target/logs` | GET | ✅ in-use | `useJobLogs` hook (`ScheduleView.tsx`) |
| `/scheduler/runs/output` | POST | ✅ in-use | `useFetchRunOutput` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs` | POST | ✅ in-use | `useAddJob` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target` | PUT | ✅ in-use | `useEditJob` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target/run` | POST | ✅ in-use | `useRunJob` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target/enable` | PUT | ✅ in-use | `useToggleJob` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target/disable` | PUT | ✅ in-use | `useToggleJob` hook (`ScheduleView.tsx`) |
| `/scheduler/jobs/:target` | DELETE | ✅ in-use | `useDeleteJob` hook (`ScheduleView.tsx`) |
| `/scheduler/open` | POST | ✅ in-use | `useOpenArtifact` hook (`ScheduleView.tsx`) |

### System (6/10)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/system/status` | GET | ✅ in-use | `useSystemStatus` hook, `OnboardingGate.tsx`, `Header.tsx`, `SettingsView.tsx` — called as `/api/system/status` |
| `/system/verify-bedrock` | POST | ✅ in-use | `useSystemStatus.ts` (`verifyBedrock` fn) — called as `/api/system/verify-bedrock` |
| `/system/core-update` | GET | ✅ in-use | `SettingsView.tsx` (check for update) — called as `/api/system/core-update` |
| `/system/core-update` | POST | ✅ in-use | `SettingsView.tsx` (apply update) — called as `/api/system/core-update` |
| `/system/capabilities` | GET | ✅ in-use | `useServerCapabilities.ts` hook — called as `/api/system/capabilities` |
| `/system/discover` | GET | ⚪ not-in-use | LAN discovery — not called by the main frontend |
| `/system/runtime` | GET | ✅ in-use | Runtime info — called as `/api/system/runtime` |
| `/system/skills` | GET | ⚪ not-in-use | List skills |
| `/system/terminal-port` | GET | ⚪ not-in-use | Terminal port info |

---

## Additional Endpoints In Use (Not in api.md)

These endpoints are called by the frontend but not yet documented in `api.md`:

| Endpoint | Method | Used By | Notes |
|----------|--------|---------|-------|
| `/acp/connections` | GET | `useACPConnections.ts` | ACP connection list |
| `/acp/connections/:id` | PUT | `ACPConnectionsSection.tsx` | Update ACP connection |
| `/acp/connections/:id` | DELETE | `ACPConnectionsSection.tsx` | Remove ACP connection |
| `/acp/connections` | POST | `ACPConnectionsSection.tsx` | Add ACP connection |
| `/acp/commands/:agentSlug` | GET | `useSlashCommands.ts` | ACP slash commands |
| `/tool-approval/:approvalId` | POST | `useToolApproval.ts`, `ToolApprovalHandler.ts` | Approve/reject tool calls |

### Voice (4/4)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/voice/sessions` | POST | ✅ in-use | `useVoiceSession.ts` (create voice session) |
| `/voice/sessions/:id` | DELETE | ✅ in-use | `useVoiceSession.ts` (destroy voice session) |
| `/voice/status` | GET | ✅ in-use | `VoicePill.tsx` (active session count) |
| `/voice/agent` | GET | ✅ in-use | `VoicePill.tsx` (voice agent info) |

> **Note**: Voice also uses a WebSocket connection on port+2 for real-time audio streaming. The WS URL is constructed client-side from the API base URL.

### Knowledge (7+)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/agents/:slug/knowledge` | GET | ✅ in-use | `KnowledgeView.tsx` (list documents) |
| `/agents/:slug/knowledge/status` | GET | ✅ in-use | `KnowledgeView.tsx` (index status) |
| `/agents/:slug/knowledge/upload` | POST | ✅ in-use | `KnowledgeView.tsx` (upload document) |
| `/agents/:slug/knowledge/scan` | POST | ✅ in-use | `KnowledgeView.tsx` (scan directories) |
| `/agents/:slug/knowledge/search` | POST | ✅ in-use | `KnowledgeView.tsx` (semantic search) |
| `/agents/:slug/knowledge/bulk-delete` | POST | ✅ in-use | `KnowledgeView.tsx` (bulk delete) |
| `/agents/:slug/knowledge/:id` | DELETE | ✅ in-use | `KnowledgeView.tsx` (delete document) |
| `/agents/:slug/knowledge/namespaces` | GET | ✅ in-use | `KnowledgeView.tsx` (list namespaces) |
| `/agents/:slug/knowledge/namespaces/:ns/*` | * | ✅ in-use | Namespaced variants of above |

### Projects (12/12)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/projects` | GET | ✅ in-use | `useProjectsQuery` hook |
| `/projects` | POST | ✅ in-use | `ProjectsView.tsx` (create project) |
| `/projects/:slug` | GET | ✅ in-use | `useProjectsQuery` hook |
| `/projects/:slug` | PUT | ✅ in-use | `ProjectSettingsView.tsx` (update project) |
| `/projects/:slug` | DELETE | ✅ in-use | `ProjectsView.tsx` (delete project) |
| `/projects/:slug/layouts` | GET | ✅ in-use | `useProjectLayoutsQuery` hook |
| `/projects/:slug/layouts` | POST | ✅ in-use | `ProjectsView.tsx` (add layout to project) |
| `/projects/:slug/layouts/:layoutSlug` | GET | ✅ in-use | `LayoutView.tsx` |
| `/projects/:slug/layouts/:layoutSlug` | PUT | ✅ in-use | `Project-scoped layout editor flows` |
| `/projects/:slug/layouts/:layoutSlug` | DELETE | ✅ in-use | `ProjectsView.tsx` (remove layout) |
| `/projects/layouts/available` | GET | ✅ in-use | `ProjectsView.tsx` (available layout sources) |
| `/projects/:slug/layouts/from-plugin` | POST | ✅ in-use | `ProjectsView.tsx` (add layout from plugin) |

---

## Key Insights

### Why We Use a Custom Chat Endpoint

We implemented a custom `/api/agents/:slug/chat` endpoint instead of using the framework's built-in generation endpoints because we need:

1. **Elicitation Support** - Gathering user information during conversations
2. **Tool Approval Workflow** - User confirmation before executing tools
3. **Custom Streaming Format** - Tailored SSE events for our UI
4. **Model Override** - Runtime model switching per request

### Most Used Endpoint Categories

1. **Scheduler** - 15/16 endpoints (94%) — `ScheduleView.tsx` + `useScheduler.ts` hooks
2. **Layout Management** - 5/5 endpoints (100%)
3. **Analytics** - 4/4 endpoints (100%, including DELETE)
4. **Configuration** - 2/2 endpoints (100%)
5. **Events (SSE)** - 1/1 (100%)
6. **Branding** - 1/1 (100%)
7. **File System** - 1/1 (100%)
8. **Insights** - 1/1 (100%)
9. **System** - 8/9 endpoints (89%)
10. **Plugins** - 10/16 endpoints (63%)
11. **Voice** - 4/4 endpoints (100%)
12. **Knowledge** - 9/9 endpoints (100%)
13. **Projects** - 12/12 endpoints (100%)

### Least Used Endpoint Categories

1. **Model Capabilities (Legacy)** - 0/2 endpoints (0%)
2. **Registry** - 3/9 endpoints (33%) — only integration registry used
3. **Workflow Management** - 1/5 endpoints (20%)
4. **Bedrock Models** - 1/4 endpoints (25%)
5. **Auth & Users** - 3/6 endpoints (50%)

---

## Frontend Context → Endpoint Mapping

| React Context | Endpoints Used |
|---------------|----------------|
| `AgentsContext` | `/api/agents`, `/agents` (POST/PUT/DELETE) |
| `LayoutsContext` | removed during project-layout convergence |
| `ConversationsContext` | `/agents/:slug/conversations`, `/agents/:slug/conversations/:id/messages`, `/agents/:slug/tools`, `/api/agents/:slug/chat` |
| `ActiveChatsContext` | `/agents/:slug/conversations` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` (GET/PUT) |
| `Connections` views + query hooks | `/api/connections`, `/api/connections/models`, `/api/connections/runtimes`, `/api/connections/:id`, `/api/connections/:id/test` |
| `ModelsContext` | `/bedrock/models` |
| `AppDataContext` | `/bedrock/models` |
| `AnalyticsContext` | `/api/analytics/usage`, `/api/analytics/achievements`, `/api/analytics/rescan` |
| `MonitoringContext` | `/monitoring/stats`, `/monitoring/events` |
| `WorkflowsContext` | `/agents/:slug/workflows/files` |
| `AuthContext` | `/api/auth/status`, `/api/auth/renew` |

---

## Component → Endpoint Mapping

| Component / Hook | Endpoints Used |
|------------------|----------------|
| `useServerEvents.ts` | `/events` (SSE) |
| `useBranding.ts` | `/api/branding` |
| `useConnectionsQuery()` / `useConnectionQuery()` | `/api/connections`, `/api/connections/:id` |
| `useModelConnectionsQuery()` | `/api/connections/models` |
| `useRuntimeConnectionsQuery()` | `/api/connections/runtimes` |
| `useSaveConnectionMutation()` / `useDeleteConnectionMutation()` / `useTestConnectionMutation()` | `/api/connections`, `/api/connections/:id`, `/api/connections/:id/test` |
| `useSystemStatus.ts` | `/api/system/status`, `/api/system/verify-bedrock` |
| `useServerCapabilities.ts` | `/api/system/capabilities` |
| `useScheduler*.ts` | `/scheduler/jobs`, `/scheduler/stats`, `/scheduler/status`, `/scheduler/providers`, `/scheduler/events`, `/scheduler/jobs/:target/*`, `/scheduler/runs/output`, `/scheduler/open` |
| `useACPConnections.ts` | `/acp/connections` |
| `useToolApproval.ts` | `/tool-approval/:approvalId` |
| `useSlashCommands.ts` | `/acp/commands/:agentSlug` |
| `PluginManagementView.tsx` | `/api/plugins` (GET/DELETE), `/api/plugins/preview`, `/api/plugins/install`, `/api/plugins/check-updates`, `/api/plugins/:name/update`, `/api/plugins/:name/providers`, `/api/plugins/:name/overrides` (PUT), `/api/plugins/reload`, `/api/fs/browse` |
| `PluginRegistry.ts` | `/api/plugins`, `/api/plugins/:name/bundle.js`, `/api/plugins/:name/bundle.css` |
| `ConnectionsHub.tsx` | `/api/connections` |
| `RuntimeConnectionView.tsx` | `/api/connections/runtimes`, `/api/connections/:id`, `/api/connections/:id/test` |
| `ProviderSettingsView.tsx` / `KnowledgeConnectionView.tsx` | `/api/connections/models`, `/api/connections/:id`, `/api/connections/:id/test` |
| `NewChatModal.tsx`, `ChatDockTabBar.tsx`, `useChatDockViewModel.ts`, `AgentEditorBasicTab.tsx`, `AgentEditorRuntimeTab.tsx` | `/api/connections/models`, `/api/connections/runtimes` |
| `ToolsView.tsx` | `/integrations`, `/api/registry/integrations`, `/api/registry/integrations/install`, `/api/registry/integrations/:id` |
| `ToolManagementView.tsx` | `/integrations`, `/agents`, `/agents/:slug/tools` (GET/POST) |
| `SettingsView.tsx` | `/api/system/status`, `/api/system/core-update` (GET/POST) |
| `AgentEditorView.tsx` | `/api/agents`, `/integrations`, `/agents/default/invoke` |
| `InsightsDashboard.tsx` | `/api/insights/insights` |
| `ActivityTimeline.tsx` | `/api/analytics/usage` |
| `UsageStatsPanel.tsx` | `/api/analytics/usage` (DELETE) |
| `ACPConnectionsSection.tsx` | `/acp/connections` (GET/POST/PUT/DELETE) |
| `UserDetailModal.tsx` | `/api/users/:alias` |
| `OnboardingGate.tsx` / `Header.tsx` | `/api/system/status` |
| `LayoutView.tsx` | `/api/projects/:slug/layouts/:layoutSlug` |

---

## Recommendations

### High Priority
1. ✅ Keep all "in-use" endpoints — they're actively serving the frontend
2. 📝 Document ACP endpoints (`/acp/*`) and tool-approval (`/tool-approval/*`) in `api.md` — they're used but undocumented

### Medium Priority
4. 📊 Implement UI for historical metrics (`/monitoring/metrics`)
5. 🗑️ Add conversation delete functionality to UI
6. 🔧 Expose tool management CRUD in agent editor UI (allow-list, aliases)

### Low Priority
7. 💰 Add pricing display using `/bedrock/pricing`
8. ✅ Add model validation in forms using `/bedrock/models/:modelId/validate`
9. 📋 Add conversation context management UI
10. 🔍 Add user search UI using `/users/search`

---

## Endpoints Added Since Last Audit

The following endpoint groups were missing from this document and are now documented.

### Voice (`/api/voice`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/voice/sessions` | POST | `voiceSessionCreateSchema` | Create voice session |
| `/api/voice/sessions/:id` | DELETE | — | Destroy voice session |
| `/api/voice/status` | GET | — | Active session count |
| `/api/voice/agent` | GET | — | Voice agent info |

### Feedback (`/api/feedback`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/feedback/rate` | POST | `rateSchema` | Rate a message |
| `/api/feedback/rate` | DELETE | `feedbackDeleteSchema` | Remove a rating |
| `/api/feedback/ratings` | GET | — | List all ratings |
| `/api/feedback/guidelines` | GET | — | Get behavior guidelines |
| `/api/feedback/analyze` | POST | — (optional body) | Trigger analysis pipeline |
| `/api/feedback/clear-analysis` | POST | — | Clear all analysis |
| `/api/feedback/status` | GET | — | Pipeline status |
| `/api/feedback/test` | POST | — | Diagnostic test |

### Prompts (`/api/prompts`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/prompts/providers` | GET | — | List prompt providers |
| `/api/prompts/` | GET | — | List all prompts |
| `/api/prompts/:id` | GET | — | Get prompt by ID |
| `/api/prompts/` | POST | `promptCreateSchema` | Create prompt |
| `/api/prompts/:id` | PUT | `promptUpdateSchema` | Update prompt |
| `/api/prompts/:id` | DELETE | — | Delete prompt |

### Registry (`/api/registry`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/registry/agents` | GET | — | List available agents |
| `/api/registry/agents/installed` | GET | — | List installed agents |
| `/api/registry/agents/install` | POST | `registryInstallSchema` | Install agent |
| `/api/registry/agents/:id` | DELETE | — | Uninstall agent |
| `/api/registry/integrations` | GET | — | List available integrations |
| `/api/registry/integrations/installed` | GET | — | List installed integrations |
| `/api/registry/integrations/install` | POST | `registryInstallSchema` | Install integration |
| `/api/registry/integrations/:id` | DELETE | — | Uninstall integration |
| `/api/registry/integrations/sync` | POST | — | Sync integrations |
| `/api/registry/skills` | GET | — | List available skills |
| `/api/registry/skills/install` | POST | `skillInstallSchema` | Install skill |
| `/api/registry/skills/:id` | DELETE | — | Uninstall skill |
| `/api/registry/skills/:id/content` | GET | — | Get skill content |
| `/api/registry/plugins` | GET | — | List available plugins |
| `/api/registry/plugins/installed` | GET | — | List installed plugins |
| `/api/registry/plugins/install` | POST | `registryInstallSchema` | Install plugin |
| `/api/registry/plugins/:id` | DELETE | — | Uninstall plugin |

### Notifications (`/notifications`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/notifications/` | GET | — | List notifications (filterable) |
| `/notifications/` | POST | `notificationCreateSchema` | Schedule notification |
| `/notifications/:id` | DELETE | — | Dismiss notification |
| `/notifications/:id/action/:actionId` | POST | — | Execute notification action |
| `/notifications/:id/snooze` | POST | `notificationSnoozeSchema` | Snooze notification |
| `/notifications/` | DELETE | — | Clear all notifications |
| `/notifications/providers` | GET | — | List notification providers |

### Insights (`/api/insights`)

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/insights` | GET | — | Get usage insights (query: `?days=14`) |

> **Note:** Previously at `/api/insights/insights` — path was fixed in Wave 6.

### Response Envelope

All endpoints use a standard response envelope:

```typescript
// Success
{ success: true, data: T }
{ success: true, data: T, message?: string }

// Error
{ success: false, error: string }
{ success: false, error: string, details?: object }  // validation errors
```

### Schema Validation

POST/PUT/PATCH endpoints use Zod schemas defined in `src-server/routes/schemas.ts`. The `validate()` middleware parses the request body, returns 400 on validation failure, and stores the validated body for retrieval via `getBody(c)`. Route params use `param(c, 'name')` for consistent 400 errors on missing params.
