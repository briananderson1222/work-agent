# Endpoints Currently In Use

This document shows which API endpoints are actively used by the Work Agent frontend.

## Summary

- **VoltAgent Built-in**: 0 of 7+ endpoints in use (all replaced with custom endpoints)
- **Custom Endpoints**: 24 of 54 endpoints in use (includes all `/agents/*` management endpoints)
- **Default Agent**: System-level `default` agent always available, uses configured `defaultModel`, no tools

---

## Default Agent

Work Agent automatically creates a **system default agent** that is always available:

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
- `AgentEditorView.tsx` - Prompt generation
- Available for any utility text generation tasks

---

## VoltAgent Built-in Endpoints (0 in use)

**Note**: VoltAgent only provides the core **generation endpoints** (`/agents/:id/text`, `/agents/:id/stream`, `/agents/:id/chat`, `/agents/:id/object`, etc.). All other `/agents/*` endpoints for CRUD operations, health checks, tools, conversations, etc. are **custom Work Agent extensions**.

We've replaced all VoltAgent generation endpoints with custom alternatives that better fit our needs.

### ⚪ Available but Not Used

| Endpoint | Method | Why Not Used |
|----------|--------|--------------|
| `/agents` | GET | Using custom `/api/agents` for enriched data |
| `/agents/:id` | GET | Not needed - using `/api/agents` for list |
| `/agents/:slug/text` | POST | Using custom `/agents/:slug/invoke` instead (no memory overhead) |
| `/agents/:slug/stream` | POST | Using custom `/api/agents/:slug/chat` instead |
| `/agents/:slug/chat` | POST | Using custom `/api/agents/:slug/chat` instead |
| `/agents/:slug/object` | POST | Not needed yet |
| `/agents/:slug/stream-object` | POST | Not needed yet |
| Workflow endpoints | Various | Using custom workflow file management |

---

## Custom Endpoints (24 in use)

### Agent Management (4/5)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/api/agents`](./API.md#-list-all-agents-enriched) | GET | `AgentsContext.tsx`, agent selector, workspace views |
| ✅ [`/agents`](./API.md#-create-agent) | POST | `AgentsContext.tsx` (create agent) |
| ✅ [`/agents/:slug`](./API.md#-update-agent) | PUT | `AgentsContext.tsx` (update agent) |
| ✅ [`/agents/:slug`](./API.md#-delete-agent) | DELETE | `AgentsContext.tsx` (delete agent) |
| ⚪ [`/agents/:slug/health`](./API.md#-get-agent-health) | GET | Not used yet |

### Tool Management (1/7)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/agents/:slug/tools`](./API.md#-get-agent-tools) | GET | `ConversationsContext.tsx` (tool schemas) |
| ⚪ [`/tools`](./API.md#-list-all-tools) | GET | Not used yet |
| ⚪ [`/agents/:slug/tools`](./API.md#-add-tool-to-agent) | POST | Not used yet |
| ⚪ [`/agents/:slug/tools/:toolId`](./API.md#-remove-tool-from-agent) | DELETE | Not used yet |
| ⚪ [`/agents/:slug/tools/allowed`](./API.md#-update-tool-allow-list) | PUT | Not used yet |
| ⚪ [`/agents/:slug/tools/aliases`](./API.md#-update-tool-aliases) | PUT | Not used yet |
| ⚪ [`/q-agents`](./API.md#-get-q-developer-agents) | GET | Not used yet |

### Workspace Management (5/5)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/workspaces`](./API.md#-list-all-workspaces) | GET | `WorkspacesContext.tsx` |
| ✅ [`/workspaces/:slug`](./API.md#-get-workspace) | GET | `WorkspacesContext.tsx` |
| ✅ [`/workspaces`](./API.md#-create-workspace) | POST | `WorkspacesContext.tsx` |
| ✅ [`/workspaces/:slug`](./API.md#-update-workspace) | PUT | `WorkspacesContext.tsx` |
| ✅ [`/workspaces/:slug`](./API.md#-delete-workspace) | DELETE | `WorkspacesContext.tsx` |

### Workflow Management (1/5)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/agents/:slug/workflows/files`](./API.md#-list-agent-workflows) | GET | `WorkflowsContext.tsx` |
| ⚪ [`/agents/:slug/workflows/:workflowId`](./API.md#-get-workflow-content) | GET | Not used yet |
| ⚪ [`/agents/:slug/workflows`](./API.md#-create-workflow) | POST | Not used yet |
| ⚪ [`/agents/:slug/workflows/:workflowId`](./API.md#-update-workflow) | PUT | Not used yet |
| ⚪ [`/agents/:slug/workflows/:workflowId`](./API.md#-delete-workflow) | DELETE | Not used yet |

### Conversation Management (3/6)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/agents/:slug/conversations`](./API.md#-list-agent-conversations) | GET | `ConversationsContext.tsx` |
| ✅ [`/agents/:slug/conversations/:id/messages`](./API.md#-get-conversation-messages) | GET | `ConversationsContext.tsx` |
| ✅ [`/agents/:slug/conversations/:id/stats`](./API.md#-get-conversation-statistics) | GET | `StatsContext.tsx`, `ConversationStats.tsx` |
| ⚪ [`/agents/:slug/conversations/:id`](./API.md#-update-conversation) | PATCH | Not used yet |
| ⚪ [`/agents/:slug/conversations/:id`](./API.md#-delete-conversation) | DELETE | Not used yet |
| ⚪ [`/api/agents/:slug/conversations/:id/context`](./API.md#-manage-conversation-context) | POST | Not used yet |

### Configuration (2/2)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/config/app`](./API.md#-get-app-configuration) | GET | `ConfigContext.tsx` |
| ✅ [`/config/app`](./API.md#-update-app-configuration) | PUT | `ConfigContext.tsx` |

### Bedrock Models (1/4)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/bedrock/models`](./API.md#-list-available-models) | GET | `ModelsContext.tsx`, `AppDataContext.tsx` |
| ⚪ [`/bedrock/pricing`](./API.md#-get-model-pricing) | GET | Not used yet |
| ⚪ [`/bedrock/models/:modelId/validate`](./API.md#-validate-model-id) | GET | Not used yet |
| ⚪ [`/bedrock/models/:modelId`](./API.md#-get-model-info) | GET | Not used yet |

### Analytics (3/3)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/api/analytics/usage`](./API.md#-get-usage-statistics) | GET | `AnalyticsContext.tsx` |
| ✅ [`/api/analytics/achievements`](./API.md#-get-achievements) | GET | `AnalyticsContext.tsx` |
| ✅ [`/api/analytics/rescan`](./API.md#-rescan-analytics) | POST | `AnalyticsContext.tsx` |

### Monitoring (2/3)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/monitoring/stats`](./API.md#-get-system-stats) | GET | `MonitoringContext.tsx` |
| ✅ [`/monitoring/events`](./API.md#-getstream-events-sse) | GET | `MonitoringContext.tsx` (SSE stream) |
| ⚪ [`/monitoring/metrics`](./API.md#-get-historical-metrics) | GET | Not used yet |

### Agent Invocation (4/4)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/agents/:slug/invoke`](./API.md#-silent-invocation-no-memory) | POST | Dashboard widgets, background data fetching |
| ✅ [`/agents/:slug/tools/:toolName`](./API.md#-raw-tool-call-no-llm) | POST | `stallion-workspace` (direct tool calls) |
| ✅ [`/agents/:slug/invoke/transform`](./API.md#-transform-invocation-tool--transform) | POST | `stallion-workspace` (tool + transform) |
| ✅ [`/agents/:slug/invoke/stream`](./API.md#-streaming-invocation) | POST | Streaming with structured output |

### Chat (1/1)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ✅ [`/api/agents/:slug/chat`](./API.md#-custom-chat-stream) | POST | `ConversationsContext.tsx`, `ChatDock.tsx` (primary chat) |

### Model Capabilities (0/1)

| Endpoint | Method | Used By |
|----------|--------|---------|
| ⚪ [`/api/models/capabilities`](./API.md#-get-model-capabilities) | GET | Not used yet |

---

## Key Insights

### Why We Don't Use VoltAgent's Chat Endpoints

We implemented a custom `/api/agents/:slug/chat` endpoint instead of using VoltAgent's built-in `/agents/:slug/chat` because we need:

1. **Elicitation Support** - Gathering user information during conversations
2. **Tool Approval Workflow** - User confirmation before executing tools
3. **Custom Streaming Format** - Tailored SSE events for our UI
4. **Model Override** - Runtime model switching per request

### Most Used Endpoint Categories

1. **Workspace Management** - 5/5 endpoints (100%)
2. **Analytics** - 3/3 endpoints (100%)
3. **Configuration** - 2/2 endpoints (100%)
4. **Agent Invocation** - 4/4 endpoints (100%)
5. **Agent Management** - 4/5 endpoints (80%)

### Least Used Endpoint Categories

1. **Tool Management** - 1/7 endpoints (14%)
2. **Workflow Management** - 1/5 endpoints (20%)
3. **Bedrock Models** - 1/4 endpoints (25%)
4. **Conversation Management** - 3/6 endpoints (50%)

### Opportunities for Cleanup

Consider removing or documenting as "future use":
- Tool management CRUD endpoints (not used in UI)
- Workflow file CRUD endpoints (not used in UI)
- Model validation/info endpoints (not needed yet)
- Conversation update/delete endpoints (not exposed in UI)
- Historical metrics endpoint (not visualized yet)

---

## Frontend Context → Endpoint Mapping

| React Context | Endpoints Used |
|---------------|----------------|
| `AgentsContext` | `/api/agents`, `/agents` (POST/PUT/DELETE) |
| `WorkspacesContext` | `/workspaces` (GET/POST/PUT/DELETE), `/workspaces/:slug` |
| `ConversationsContext` | `/agents/:slug/conversations`, `/agents/:slug/conversations/:id/messages`, `/agents/:slug/tools`, `/api/agents/:slug/chat` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` (GET/PUT) |
| `ModelsContext` | `/bedrock/models` |
| `AppDataContext` | `/bedrock/models` |
| `AnalyticsContext` | `/api/analytics/usage`, `/api/analytics/achievements`, `/api/analytics/rescan` |
| `MonitoringContext` | `/monitoring/stats`, `/monitoring/events` |
| `WorkflowsContext` | `/agents/:slug/workflows/files` |

---

## Component → Endpoint Mapping

| Component | Endpoints Used |
|-----------|----------------|
| `ChatDock.tsx` | `/api/agents/:slug/chat` (SSE stream) |
| `stallion-workspace/CRM.tsx` | `/agents/:slug/text`, `/agents/:slug/tools/:toolName`, `/agents/:slug/invoke/transform` |
| `stallion-workspace/Calendar.tsx` | `/agents/:slug/invoke/transform` |
| `AgentEditorView.tsx` | `/agents/my-agent/text` (test endpoint) |
| Agent selector | `/api/agents` |
| Workspace views | `/api/agents`, `/workspaces` |
| Settings view | `/config/app` |
| Analytics dashboard | `/api/analytics/*` |
| Monitoring dashboard | `/monitoring/*` |

---

## Recommendations

### High Priority
1. ✅ Keep all "In Use" endpoints - they're actively serving the frontend
2. 📝 Document unused tool/workflow CRUD endpoints as "Admin API" for future use
3. 🧹 Consider removing model validation endpoints if not needed

### Medium Priority
4. 📊 Implement UI for historical metrics (`/monitoring/metrics`)
5. 🗑️ Add conversation delete functionality to UI
6. 🔧 Expose tool management in agent editor UI

### Low Priority
7. 💰 Add pricing display using `/bedrock/pricing`
8. ✅ Add model validation in forms using `/bedrock/models/:modelId/validate`
9. 📋 Add conversation context management UI
