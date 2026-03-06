# Endpoints Currently In Use

This document shows which API endpoints are actively used by the Stallion frontend.

## Summary

- **Framework-provided generation endpoints**: 0 in use (all replaced with custom endpoints)
- **Custom Endpoints**: 40+ of ~97 endpoints in use
- **Default Agent**: System-level `default` agent always available, uses configured `defaultModel`, no tools

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
| `/api/agents` | GET | ✅ in-use | `AgentsContext.tsx`, `AgentEditorView.tsx`, `WorkspaceEditorView.tsx` |
| `/agents` | POST | ✅ in-use | `AgentsContext.tsx` (create agent) |
| `/agents/:slug` | PUT | ✅ in-use | `AgentsContext.tsx` (update agent) |
| `/agents/:slug` | DELETE | ✅ in-use | `AgentsContext.tsx` (delete agent) |
| `/agents/:slug/health` | GET | ⚪ not-in-use | Not used yet |

### Tool Management (3/7)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/tools` | GET | ✅ in-use | `AgentEditorView.tsx`, `ToolManagementView.tsx`, `ToolsView.tsx` |
| `/agents/:slug/tools` | GET | ✅ in-use | `ConversationsContext.tsx`, `ToolManagementView.tsx` |
| `/agents/:slug/tools` | POST | ✅ in-use | `ToolManagementView.tsx` (add tool to agent) |
| `/agents/:slug/tools/:toolId` | DELETE | ⚪ not-in-use | Not used yet |
| `/agents/:slug/tools/allowed` | PUT | ⚪ not-in-use | Not used yet |
| `/agents/:slug/tools/aliases` | PUT | ⚪ not-in-use | Not used yet |
| `/q-agents` | GET | ⚪ not-in-use | Not used yet |

> **Update**: `ToolManagementView.tsx` uses `/tools` (GET), `/agents` (GET), `/agents/:slug/tools` (GET and POST), making tool management 3/7 in use rather than 1/7.

### Workspace Management (5/5)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/workspaces` | GET | ✅ in-use | `WorkspacesContext.tsx`, `WorkspaceView.tsx` |
| `/workspaces/:slug` | GET | ✅ in-use | `WorkspacesContext.tsx`, `WorkspaceEditorView.tsx` |
| `/workspaces` | POST | ✅ in-use | `WorkspacesContext.tsx`, `WorkspaceView.tsx` |
| `/workspaces/:slug` | PUT | ✅ in-use | `WorkspacesContext.tsx` |
| `/workspaces/:slug` | DELETE | ✅ in-use | `WorkspacesContext.tsx` |

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

### Agent Invocation (4/5)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/agents/:slug/chat` | POST | ✅ in-use | `ConversationsContext.tsx` (primary chat SSE stream) |
| `/agents/:slug/invoke` | POST | ✅ in-use | `AgentEditorView.tsx` (prompt generation via `default` agent) |
| `/agents/:slug/tools/:toolName` | POST | ✅ in-use | `stallion-workspace` (direct tool calls) |
| `/agents/:slug/invoke/transform` | POST | ✅ in-use | `stallion-workspace` (tool + transform) |
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

### Registry (3/9)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/registry/agents` | GET | ⚪ not-in-use | Not used yet |
| `/registry/agents/installed` | GET | ⚪ not-in-use | Not used yet |
| `/registry/agents/install` | POST | ⚪ not-in-use | Not used yet |
| `/registry/agents/:id` | DELETE | ⚪ not-in-use | Not used yet |
| `/registry/tools` | GET | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/tools` |
| `/registry/tools/installed` | GET | ⚪ not-in-use | Not used yet |
| `/registry/tools/install` | POST | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/tools/install` |
| `/registry/tools/:id` | DELETE | ✅ in-use | `ToolsView.tsx` — called as `/api/registry/tools/:id` |
| `/registry/tools/sync` | POST | ⚪ not-in-use | Not used yet |

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

### System (6/9)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/system/status` | GET | ✅ in-use | `useSystemStatus` hook, `OnboardingGate.tsx`, `Header.tsx`, `SettingsView.tsx` — called as `/api/system/status` |
| `/system/verify-bedrock` | POST | ✅ in-use | `useSystemStatus.ts` (`verifyBedrock` fn) — called as `/api/system/verify-bedrock` |
| `/system/core-update` | GET | ✅ in-use | `SettingsView.tsx` (check for update) — called as `/api/system/core-update` |
| `/system/core-update` | POST | ✅ in-use | `SettingsView.tsx` (apply update) — called as `/api/system/core-update` |
| `/system/capabilities` | GET | ✅ in-use | `useServerCapabilities.ts` hook — called as `/api/system/capabilities` |
| `/system/discover` | GET | ⚪ not-in-use | LAN discovery — not called by the main frontend |
| `/system/vapid-public-key` | GET | ✅ in-use | `useApprovalNotifications.ts` — called as `/api/system/vapid-public-key` |
| `/system/push-subscribe` | POST | ✅ in-use | `useApprovalNotifications.ts` — called as `/api/system/push-subscribe` |
| `/system/push-unsubscribe` | POST | ✅ in-use | `useApprovalNotifications.ts` — called as `/api/system/push-unsubscribe` |

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
| `/tools/test` | POST | `AgentEditorView.tsx` | Test a tool configuration |

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
2. **Workspace Management** - 5/5 endpoints (100%)
3. **Analytics** - 4/4 endpoints (100%, including DELETE)
4. **Configuration** - 2/2 endpoints (100%)
5. **Events (SSE)** - 1/1 (100%)
6. **Branding** - 1/1 (100%)
7. **File System** - 1/1 (100%)
8. **Insights** - 1/1 (100%)
9. **System** - 8/9 endpoints (89%)
10. **Plugins** - 10/16 endpoints (63%)

### Least Used Endpoint Categories

1. **Model Capabilities (Legacy)** - 0/2 endpoints (0%)
2. **Registry** - 3/9 endpoints (33%) — only tool registry used
3. **Workflow Management** - 1/5 endpoints (20%)
4. **Bedrock Models** - 1/4 endpoints (25%)
5. **Auth & Users** - 3/6 endpoints (50%)

---

## Frontend Context → Endpoint Mapping

| React Context | Endpoints Used |
|---------------|----------------|
| `AgentsContext` | `/api/agents`, `/agents` (POST/PUT/DELETE) |
| `WorkspacesContext` | `/workspaces` (GET/POST/PUT/DELETE), `/workspaces/:slug` |
| `ConversationsContext` | `/agents/:slug/conversations`, `/agents/:slug/conversations/:id/messages`, `/agents/:slug/tools`, `/api/agents/:slug/chat` |
| `ActiveChatsContext` | `/agents/:slug/conversations` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` (GET/PUT) |
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
| `useSystemStatus.ts` | `/api/system/status`, `/api/system/verify-bedrock` |
| `useServerCapabilities.ts` | `/api/system/capabilities` |
| `useScheduler*.ts` | `/scheduler/jobs`, `/scheduler/stats`, `/scheduler/status`, `/scheduler/providers`, `/scheduler/events`, `/scheduler/jobs/:target/*`, `/scheduler/runs/output`, `/scheduler/open` |
| `useApprovalNotifications.ts` | `/api/system/vapid-public-key`, `/api/system/push-subscribe`, `/api/system/push-unsubscribe` |
| `useACPConnections.ts` | `/acp/connections` |
| `useToolApproval.ts` | `/tool-approval/:approvalId` |
| `useSlashCommands.ts` | `/acp/commands/:agentSlug` |
| `PluginManagementView.tsx` | `/api/plugins` (GET/DELETE), `/api/plugins/preview`, `/api/plugins/install`, `/api/plugins/check-updates`, `/api/plugins/:name/update`, `/api/plugins/:name/providers`, `/api/plugins/:name/overrides` (PUT), `/api/plugins/reload`, `/api/fs/browse` |
| `PluginRegistry.ts` | `/api/plugins`, `/api/plugins/:name/bundle.js`, `/api/plugins/:name/bundle.css` |
| `ToolsView.tsx` | `/tools`, `/api/registry/tools`, `/api/registry/tools/install`, `/api/registry/tools/:id` |
| `ToolManagementView.tsx` | `/tools`, `/agents`, `/agents/:slug/tools` (GET/POST) |
| `SettingsView.tsx` | `/api/system/status`, `/api/system/core-update` (GET/POST) |
| `AgentEditorView.tsx` | `/api/agents`, `/tools`, `/agents/default/invoke`, `/tools/test` |
| `InsightsDashboard.tsx` | `/api/insights/insights` |
| `ActivityTimeline.tsx` | `/api/analytics/usage` |
| `UsageStatsPanel.tsx` | `/api/analytics/usage` (DELETE) |
| `ACPConnectionsSection.tsx` | `/acp/connections` (GET/POST/PUT/DELETE) |
| `UserDetailModal.tsx` | `/api/users/:alias` |
| `OnboardingGate.tsx` / `Header.tsx` | `/api/system/status` |
| `WorkspaceView.tsx` | `/workspaces` (POST) |
| `WorkspaceEditorView.tsx` | `/api/agents`, `/workspaces/:slug` |

---

## Recommendations

### High Priority
1. ✅ Keep all "in-use" endpoints — they're actively serving the frontend
2. 📝 Document ACP endpoints (`/acp/*`) and tool-approval (`/tool-approval/*`) in `api.md` — they're used but undocumented
3. 📝 Document push notification endpoints (`/system/vapid-public-key`, `/system/push-subscribe`, `/system/push-unsubscribe`) in `api.md`

### Medium Priority
4. 📊 Implement UI for historical metrics (`/monitoring/metrics`)
5. 🗑️ Add conversation delete functionality to UI
6. 🔧 Expose tool management CRUD in agent editor UI (allow-list, aliases)

### Low Priority
7. 💰 Add pricing display using `/bedrock/pricing`
8. ✅ Add model validation in forms using `/bedrock/models/:modelId/validate`
9. 📋 Add conversation context management UI
10. 🔍 Add user search UI using `/users/search`
