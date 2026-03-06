# Stallion API Summary

## Endpoint Overview

### VoltAgent Built-in Endpoints (🔵)
Provided by `@voltagent/server-hono` package:

- **7 Core Agent Endpoints**
  - `GET /agents` - List agents
  - `GET /agents/:id` - Get agent details
  - `POST /agents/:id/text` - Generate text
  - `POST /agents/:id/stream` - Stream text (raw)
  - `POST /agents/:id/chat` - Stream text (AI SDK)
  - `POST /agents/:id/object` - Generate object
  - `POST /agents/:id/stream-object` - Stream object

- **5+ Workflow Endpoints**
  - Workflow listing, execution, and streaming

**Documentation**: `http://localhost:3141/ui` (Swagger UI)

---

### Custom Stallion Endpoints (🟢)
Stallion-specific extensions (54 endpoints):

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

#### Agent Invocation (4)
- `POST /agents/:slug/invoke` - Silent invocation
- `POST /agents/:slug/tools/:toolName` - Raw tool call
- `POST /agents/:slug/invoke/transform` - Transform invocation
- `POST /agents/:slug/invoke/stream` - Streaming invocation

#### Model Capabilities (1)
- `GET /api/models/capabilities` - Model capabilities

---

## Frontend Usage

### React Contexts Using API

| Context | Endpoints |
|---------|-----------|
| `AgentsContext` | `/api/agents`, `/agents/:slug` (CRUD) |
| `WorkspacesContext` | `/workspaces` (CRUD) |
| `ConversationsContext` | `/agents/:slug/conversations/*` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` |
| `ModelsContext` | `/bedrock/models` |
| `AnalyticsContext` | `/api/analytics/*` |
| `MonitoringContext` | `/monitoring/*` |
| `WorkflowsContext` | `/agents/:slug/workflows/files` |

### Components with Direct API Calls

- **ChatDock** - VoltAgent streaming endpoints
- **Stallion Workspace** - Transform/tool invocation
- **Agent Editor** - Tool management
- **Settings View** - Configuration

---

## Key Differences

### `/agents` vs `/api/agents`

- **`GET /agents`** (🔵 VoltAgent) - Basic agent info
- **`GET /api/agents`** (🟢 Custom) - Enriched with config, tools, metadata

### Agent Invocation

- **`POST /agents/:slug/text`** (🔵 VoltAgent) - Standard text generation with memory
- **`POST /agents/:slug/invoke`** (🟢 Custom) - Silent invocation without memory loading
- **`POST /agents/:slug/tools/:toolName`** (🟢 Custom) - Direct tool execution
- **`POST /agents/:slug/invoke/transform`** (🟢 Custom) - Tool + JS transformation

---

## Documentation

- **Complete API Reference**: [API.md](./API.md)
- **VoltAgent Docs**: https://voltagent.dev/docs/api/endpoints/agents
- **Swagger UI**: http://localhost:3141/ui
