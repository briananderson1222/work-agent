# Stallion API Summary

## Endpoint Overview

### Stallion Endpoints (96 endpoints total):

#### Agent Management (5)
- `GET /api/agents` - Enriched agent list
- `POST /agents` - Create agent
- `PUT /agents/:slug` - Update agent
- `DELETE /agents/:slug` - Delete agent
- `GET /agents/:slug/health` - Health check

#### Tool Management (7)
- `GET /tools` - List all tools
- `GET /agents/:slug/tools` - Get agent tools with schemas
- `POST /agents/:slug/tools` - Add tool to agent
- `DELETE /agents/:slug/tools/:toolId` - Remove tool
- `PUT /agents/:slug/tools/allowed` - Update allow-list
- `PUT /agents/:slug/tools/aliases` - Update aliases
- `GET /q-agents` - Q Developer agents

#### Workspace Management (5)
- `GET /workspaces` - List workspaces
- `GET /workspaces/:slug` - Get workspace
- `POST /workspaces` - Create workspace
- `PUT /workspaces/:slug` - Update workspace
- `DELETE /workspaces/:slug` - Delete workspace

#### Workflow Management (5)
- `GET /agents/:slug/workflows/files` - List workflows
- `GET /agents/:slug/workflows/:workflowId` - Get workflow
- `POST /agents/:slug/workflows` - Create workflow
- `PUT /agents/:slug/workflows/:workflowId` - Update workflow
- `DELETE /agents/:slug/workflows/:workflowId` - Delete workflow

#### Conversation Management (6)
- `GET /agents/:slug/conversations` - List conversations
- `GET /agents/:slug/conversations/:id/messages` - Get messages
- `PATCH /agents/:slug/conversations/:id` - Update conversation
- `DELETE /agents/:slug/conversations/:id` - Delete conversation
- `POST /api/agents/:slug/conversations/:id/context` - Manage context
- `GET /agents/:slug/conversations/:id/stats` - Get statistics

#### Configuration (2)
- `GET /config/app` - Get app config
- `PUT /config/app` - Update app config

#### Bedrock Models (4)
- `GET /bedrock/models` - List models
- `GET /bedrock/pricing` - Get pricing
- `GET /bedrock/models/:modelId/validate` - Validate model
- `GET /bedrock/models/:modelId` - Get model info

#### Analytics (3)
- `GET /api/analytics/usage` - Usage statistics
- `GET /api/analytics/achievements` - Achievements
- `POST /api/analytics/rescan` - Rescan analytics

#### Monitoring (3)
- `GET /monitoring/stats` - System stats
- `GET /monitoring/metrics` - Historical metrics
- `GET /monitoring/events` - Events (SSE stream)

#### Agent Invocation (5)
- `POST /api/agents/:slug/chat` - Custom chat stream (SSE)
- `POST /agents/:slug/invoke` - Silent invocation (no memory)
- `POST /agents/:slug/tools/:toolName` - Raw tool call
- `POST /agents/:slug/invoke/transform` - Transform invocation
- `POST /agents/:slug/invoke/stream` - Streaming invocation

#### Model Capabilities (Legacy) (2)
- `GET /api/models/capabilities` - Model capabilities (cached 1h)
- `GET /api/models/pricing/:modelId` - Per-model pricing (legacy)

#### Auth & Users (6)
- `GET /auth/status` - Auth status and user identity
- `POST /auth/renew` - Credential renewal
- `POST /auth/terminal` - Terminal-based auth renewal
- `GET /auth/badge-photo/:id` - User badge/profile photo (JPEG)
- `GET /users/search` - Search user directory
- `GET /users/:alias` - Lookup user by alias

#### Branding (1)
- `GET /branding` - Resolved branding config

#### Events (SSE) (1)
- `GET /events` - Real-time SSE event stream (all server events)

#### File System (1)
- `GET /fs/browse` - Browse directories (UI directory picker)

#### Insights (1)
- `GET /insights` - Aggregated usage insights (tool, hourly, agent, model)

#### Plugins (17)
- `GET /plugins` - List installed plugins
- `POST /plugins/preview` - Pre-install validation
- `POST /plugins/install` - Install plugin
- `GET /plugins/check-updates` - Check for updates
- `POST /plugins/:name/update` - Update plugin
- `DELETE /plugins/:name` - Remove plugin
- `GET /plugins/:name/bundle.js` - Serve plugin JS bundle
- `GET /plugins/:name/bundle.css` - Serve plugin CSS bundle
- `GET /plugins/:name/permissions` - Get plugin permissions
- `POST /plugins/:name/grant` - Grant permissions
- `POST /plugins/:name/fetch` - Scoped HTTP proxy
- `POST /plugins/fetch` - Legacy HTTP proxy (no permission check)
- `POST /plugins/reload` - Reload all plugin providers
- `GET /plugins/:name/providers` - Get plugin providers
- `GET /plugins/:name/overrides` - Get provider overrides
- `PUT /plugins/:name/overrides` - Update provider overrides

#### Registry (9)
- `GET /registry/agents` - List available agents
- `GET /registry/agents/installed` - List installed agents
- `POST /registry/agents/install` - Install agent
- `DELETE /registry/agents/:id` - Uninstall agent
- `GET /registry/tools` - List available tools
- `GET /registry/tools/installed` - List installed tools
- `POST /registry/tools/install` - Install tool
- `DELETE /registry/tools/:id` - Uninstall tool
- `POST /registry/tools/sync` - Sync tool registry

#### Scheduler (17)
- `GET /scheduler/providers` - List scheduler providers
- `GET /scheduler/events` - Scheduler SSE event stream
- `POST /scheduler/webhook` - Webhook receiver
- `GET /scheduler/jobs` - List scheduled jobs
- `GET /scheduler/stats` - Scheduler stats
- `GET /scheduler/status` - Scheduler status
- `GET /scheduler/jobs/preview-schedule` - Preview cron schedule
- `GET /scheduler/jobs/:target/logs` - Get job logs
- `POST /scheduler/runs/output` - Read run output
- `POST /scheduler/jobs` - Create job
- `PUT /scheduler/jobs/:target` - Update job
- `POST /scheduler/jobs/:target/run` - Run job now
- `PUT /scheduler/jobs/:target/enable` - Enable job
- `PUT /scheduler/jobs/:target/disable` - Disable job
- `DELETE /scheduler/jobs/:target` - Delete job
- `POST /scheduler/open` - Open file with OS handler

#### System (7)
- `GET /system/status` - System readiness status
- `POST /system/verify-bedrock` - Verify Bedrock credentials
- `GET /system/core-update` - Check for core app update
- `POST /system/core-update` - Apply core app update
- `GET /system/capabilities` - Server runtime capabilities
- `GET /system/discover` - LAN discovery beacon
- `GET /system/vapid-public-key` - VAPID key for Web Push
- `POST /system/push-subscribe` - Subscribe to Web Push
- `POST /system/push-unsubscribe` - Unsubscribe from Web Push

---

## Category Breakdown

| Category | Count |
|----------|-------|
| Agent Management | 5 |
| Tool Management | 7 |
| Workspace Management | 5 |
| Workflow Management | 5 |
| Conversation Management | 6 |
| Configuration | 2 |
| Bedrock Models | 4 |
| Analytics | 3 |
| Monitoring | 3 |
| Agent Invocation | 5 |
| Model Capabilities (Legacy) | 2 |
| Auth & Users | 6 |
| Branding | 1 |
| Events (SSE) | 1 |
| File System | 1 |
| Insights | 1 |
| Plugins | 16 |
| Registry | 9 |
| Scheduler | 16 |
| System | 9 |
| **Total** | **97** |

> Note: System has 9 endpoints (3 documented in api.md + 3 push notification endpoints used by frontend but not yet in api.md). Plugins has 16 (api.md documents 16 distinct routes). Scheduler has 16 routes.

---

## Frontend Usage

### React Contexts Using API

| Context | Endpoints |
|---------|-----------|
| `AgentsContext` | `/api/agents`, `/agents/:slug` (CRUD) |
| `WorkspacesContext` | `/workspaces` (CRUD) |
| `ConversationsContext` | `/agents/:slug/conversations/*`, `/api/agents/:slug/chat` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` |
| `ModelsContext` | `/bedrock/models` |
| `AppDataContext` | `/bedrock/models` |
| `AnalyticsContext` | `/api/analytics/*` |
| `MonitoringContext` | `/monitoring/stats`, `/monitoring/events` |
| `WorkflowsContext` | `/agents/:slug/workflows/files` |
| `AuthContext` | `/api/auth/status`, `/api/auth/renew` |

### Hooks Using API

| Hook | Endpoints |
|------|-----------|
| `useSystemStatus` | `/api/system/status`, `/api/system/verify-bedrock` |
| `useServerCapabilities` | `/api/system/capabilities` |
| `useServerEvents` | `/events` (SSE) |
| `useBranding` | `/api/branding` |
| `useScheduler*` | `/scheduler/*` (jobs, stats, status, providers, events, logs) |
| `useApprovalNotifications` | `/api/system/vapid-public-key`, `/api/system/push-subscribe`, `/api/system/push-unsubscribe` |
| `useACPConnections` | `/acp/connections` |
| `useToolApproval` | `/tool-approval/:approvalId` |
| `useSlashCommands` | `/acp/commands/:agentSlug` |

### Components with Direct API Calls

| Component/View | Endpoints |
|----------------|-----------|
| `PluginManagementView` | `/api/plugins/*`, `/api/fs/browse` |
| `ToolsView` | `/api/registry/tools`, `/tools` |
| `SettingsView` | `/api/system/status`, `/api/system/core-update` |
| `AgentEditorView` | `/api/agents`, `/tools`, `/agents/default/invoke` |
| `ToolManagementView` | `/tools`, `/agents`, `/agents/:slug/tools` |
| `InsightsDashboard` | `/api/insights/insights` |
| `ActivityTimeline` | `/api/analytics/usage` |
| `UsageStatsPanel` | `/api/analytics/usage` (DELETE) |
| `ACPConnectionsSection` | `/acp/connections` (CRUD) |
| `UserDetailModal` | `/api/users/:alias` |
| `OnboardingGate` / `Header` | `/api/system/status` |

---

## Key Differences

### `/agents` vs `/api/agents`

- **`GET /agents`** - Basic agent info (not used by frontend)
- **`GET /api/agents`** (🟢 Custom) - Enriched with config, tools, metadata

### Agent Invocation

- **`POST /agents/:slug/invoke`** (🟢 Custom) - Silent invocation without memory loading
- **`POST /agents/:slug/tools/:toolName`** (🟢 Custom) - Direct tool execution
- **`POST /agents/:slug/invoke/transform`** (🟢 Custom) - Tool + JS transformation

### Auth Endpoints

The frontend uses `/api/auth/*` and `/api/users/*` prefixes (via `apiBase`), while the server registers routes at `/auth/*` and `/users/*`. The `apiBase` value already includes any prefix, so these resolve correctly.

---

## Documentation

- **Complete API Reference**: [API.md](./API.md)
- **Frontend Endpoint Audit**: [endpoints.md](./endpoints.md)
