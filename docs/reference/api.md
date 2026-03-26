# Stallion API Documentation

This document describes all REST API endpoints available in Stallion.

**Base URL**: `http://localhost:3141`  
**In-Use Endpoints**: See [endpoints.md](./endpoints.md) for which endpoints are actively used by the frontend

## Endpoint Legend

- 🟢 **Custom** - Stallion-specific extensions
- ✅ **In Use** - Currently used by frontend
- ⚪ **Available** - Implemented but not currently used

## Table of Contents

- [Agent Management](#agent-management)
- [Integration Management](#integration-management)
- [Layout Management](#layout-management)
- [Workflow Management](#workflow-management)
- [Conversation Management](#conversation-management)
- [Configuration](#configuration)
- [Bedrock Models](#bedrock-models)
- [Analytics](#analytics)
- [Monitoring](#monitoring)
- [Agent Invocation](#agent-invocation)
- [Auth & Users](#auth--users) *(new)*
- [Branding](#branding) *(new)*
- [Events (SSE)](#events-sse) *(new)*
- [File System](#file-system) *(new)*
- [Insights](#insights) *(new)*
- [Model Capabilities (Legacy)](#model-capabilities-legacy) *(new)*
- [Plugins](#plugins) *(new)*
- [Registry](#registry) *(new)*
- [Scheduler](#scheduler) *(new)*
- [System](#system) *(new)*

---

## Agent Management

### 🟢 ✅ Custom Chat Stream
```http
POST /api/agents/:slug/chat
```

**Custom endpoint** that provides streaming chat with elicitation support and tool approval handling.

**Request Body**:
```json
{
  "input": "Hello, how can you help?",
  "options": {
    "userId": "user-123",
    "conversationId": "conv-456",
    "temperature": 0.7,
    "maxOutputTokens": 1000,
    "model": "anthropic.claude-3-5-sonnet-20240620-v1:0"
  }
}
```

**Response**: Server-Sent Events stream

**Status**: In use  
**Used by**: `ConversationsContext.tsx`, `ChatDock.tsx` (primary chat interface)

**Features**:
- Elicitation support for gathering user information
- Tool approval workflow integration
- Model override capability
- Conversation history management

---

## Agent Management

### 🟢 ✅ Default Agent

Stallion automatically creates a **system default agent** that is always available:

**Agent ID**: `default`  
**Model**: Uses current `defaultModel` from `app.json`  
**Tools**: None (simple text generation only)  
**Instructions**: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."

**Usage**:
```bash
# Use with any agent endpoint
POST /agents/default/invoke
POST /agents/default/text
POST /api/agents/default/chat
```

**Benefits**:
- Always available without configuration
- Automatically uses the configured default model
- No tools = fast, simple text generation
- Perfect for utility tasks (prompt generation, text formatting, etc.)

**Used by**: `AgentEditorView.tsx` (prompt generation)

---

### 🟢 ✅ List All Agents (Enriched)
```http
GET /api/agents
```

**Custom endpoint** that returns enriched agent data including configuration, tools, and metadata.

**Status**: In use  
**Used by**: `AgentsContext.tsx`, agent selector, layout views

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "agent-id",
      "slug": "my-agent",
      "name": "Stallion Agent",
      "prompt": "System instructions...",
      "description": "Agent description",
      "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "region": "us-east-1",
      "guardrails": {
        "maxTokens": 4096,
        "temperature": 0.7
      },
      "maxTurns": 10,
      "icon": "🤖",
      "commands": {},
      "toolsConfig": {
        "mcpServers": ["files"],
        "available": ["*"],
        "autoApprove": []
      },
      "updatedAt": "2025-12-08T12:00:00Z"
    }
  ]
}
```

**Used by**: `AgentsContext.tsx`, agent selector, layout views

---

### 🟢 ✅ Create Agent
```http
POST /agents
```

**Custom endpoint** for creating new agents.

**Request Body**:
```json
{
  "name": "My Agent",
  "prompt": "You are a helpful assistant...",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "description": "Optional description",
  "guardrails": {
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "tools": {
    "mcpServers": ["files"],
    "available": ["*"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "slug": "my-agent",
    "name": "My Agent",
    ...
  }
}
```

**Used by**: `AgentsContext.tsx`, agent editor

---

### Update Agent
```http
PUT /agents/:slug
```

**Request Body**: Partial agent configuration (same structure as create)

**Response**:
```json
{
  "success": true,
  "data": { /* updated agent */ }
}
```

**Used by**: `AgentsContext.tsx`, agent editor

---

### Delete Agent
```http
DELETE /agents/:slug
```

**Response**:
```json
{
  "success": true
}
```

**Error** (if agent is referenced by layouts):
```json
{
  "success": false,
  "error": "Cannot delete agent 'my-agent' - it is referenced by layouts: my-layout"
}
```

**Used by**: `AgentsContext.tsx`, agent management view

---

### Get Agent Health
```http
GET /agents/:slug/health
```

**Response**:
```json
{
  "success": true,
  "healthy": true,
  "checks": {
    "loaded": true,
    "hasModel": true,
    "hasMemory": true,
    "integrationsConfigured": true,
    "integrationsConnected": true
  },
  "integrations": [
    {
      "id": "files",
      "type": "mcp",
      "connected": true,
      "metadata": {
        "transport": "stdio",
        "toolCount": 5,
        "tools": [
          {
            "name": "files_readFile",
            "originalName": "files_read_file",
            "server": "files",
            "toolName": "read_file",
            "description": "Read file contents"
          }
        ]
      }
    }
  ],
  "status": "idle"
}
```

**Used by**: Monitoring view, health checks

---

## Integration Management

### List All Integrations
```http
GET /integrations
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "files",
      "kind": "mcp",
      "displayName": "File System",
      "description": "Read and write files",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    }
  ]
}
```

**Used by**: Integration management view

---

### Create Integration
```http
POST /integrations
```

**Request Body**: Integration definition (same shape as `integration.json`).

**Response**:
```json
{
  "success": true,
  "data": { /* created integration */ }
}
```

---

### Get Integration
```http
GET /integrations/:id
```

**Response**:
```json
{
  "success": true,
  "data": { /* integration definition */ }
}
```

---

### Update Integration
```http
PUT /integrations/:id
```

**Request Body**: Partial integration definition.

**Response**:
```json
{
  "success": true,
  "data": { /* updated integration */ }
}
```

---

### Delete Integration
```http
DELETE /integrations/:id
```

**Response**:
```json
{
  "success": true
}
```

---

### Get Agent Tools
```http
GET /agents/:slug/tools
```

Returns tools available to a specific agent with full schemas.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "files_readFile",
      "name": "files_readFile",
      "originalName": "files_read_file",
      "server": "files",
      "toolName": "read_file",
      "description": "Read file contents",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        }
      }
    }
  ]
}
```

**Used by**: `ConversationsContext.tsx`, tool displays, agent editor

---

### Add Tool to Agent
```http
POST /agents/:slug/tools
```

**Request Body**:
```json
{
  "toolId": "files"
}
```

**Response**:
```json
{
  "success": true,
  "data": ["files", "other-tool"]
}
```

**Used by**: Agent editor, integration management

---

### Remove Tool from Agent
```http
DELETE /agents/:slug/tools/:toolId
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: Agent editor, integration management

---

### Update Tool Allow-List
```http
PUT /agents/:slug/tools/allowed
```

**Request Body**:
```json
{
  "allowed": ["files_*", "fetch_get"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "mcpServers": ["files", "fetch"],
    "available": ["files_*", "fetch_get"],
    "autoApprove": []
  }
}
```

**Used by**: Agent editor

---

### Update Tool Aliases
```http
PUT /agents/:slug/tools/aliases
```

**Request Body**:
```json
{
  "aliases": {
    "read": "filesystem_read_file"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": { /* updated tools config */ }
}
```

**Used by**: Agent editor

---

## Layout Management

### List All Layouts
```http
GET /layouts
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "My Workspace",
      "slug": "my-layout",
      "icon": "💼",
      "description": "Workspace description",
      "tabs": [
        {
          "id": "main",
          "label": "Main",
          "component": "my-agent-dashboard"
        }
      ],
      "globalPrompts": []
    }
  ]
}
```

**Used by**: `LayoutsContext.tsx`, layout selector

---

### Get Layout
```http
GET /layouts/:slug
```

**Response**:
```json
{
  "success": true,
  "data": { /* layout config */ }
}
```

**Used by**: `LayoutsContext.tsx`, layout view

---

### Create Layout
```http
POST /layouts
```

**Request Body**:
```json
{
  "name": "My Workspace",
  "slug": "my-layout",
  "icon": "💼",
  "description": "Workspace description",
  "tabs": [
    {
      "id": "main",
      "label": "Main",
      "component": "my-agent-dashboard",
      "prompts": [
        {
          "id": "daily-standup",
          "label": "Daily Standup",
          "prompt": "Generate my daily standup update",
          "agent": "my-agent"
        }
      ]
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": { /* created layout */ }
}
```

**Used by**: `LayoutsContext.tsx`, layout editor

---

### Update Layout
```http
PUT /layouts/:slug
```

**Request Body**: Partial layout configuration

**Response**:
```json
{
  "success": true,
  "data": { /* updated layout */ }
}
```

**Used by**: `LayoutsContext.tsx`, layout editor

---

### Delete Layout
```http
DELETE /layouts/:slug
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: `LayoutsContext.tsx`, layout management

---

## Workflow Management

### List Agent Workflows
```http
GET /agents/:slug/workflows/files
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "filename": "example-simple.ts",
      "path": ".stallion-ai/agents/my-agent/workflows/example-simple.ts"
    }
  ]
}
```

**Used by**: `WorkflowsContext.tsx`, workflow management

---

### Get Workflow Content
```http
GET /agents/:slug/workflows/:workflowId
```

**Response**:
```json
{
  "success": true,
  "data": {
    "content": "import { Agent } from '@strands-agents/sdk';\n\nexport default andThen(() => 'Hello');"
  }
}
```

**Used by**: Workflow editor

---

### Create Workflow
```http
POST /agents/:slug/workflows
```

**Request Body**:
```json
{
  "filename": "new-workflow.ts",
  "content": "import { Agent } from '@strands-agents/sdk';\n\nexport default andThen(() => 'Hello');"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "filename": "new-workflow.ts"
  }
}
```

**Used by**: Workflow editor

---

### Update Workflow
```http
PUT /agents/:slug/workflows/:workflowId
```

**Request Body**:
```json
{
  "content": "// Updated workflow code"
}
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: Workflow editor

---

### Delete Workflow
```http
DELETE /agents/:slug/workflows/:workflowId
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: Workflow management

---

## Conversation Management

### List Agent Conversations
```http
GET /agents/:slug/conversations
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "conv-123",
      "userId": "agent:my-agent:user:default",
      "title": "Conversation Title",
      "createdAt": "2025-12-08T12:00:00Z",
      "updatedAt": "2025-12-08T12:30:00Z",
      "metadata": {
        "stats": {
          "inputTokens": 1000,
          "outputTokens": 500,
          "totalTokens": 1500,
          "turns": 5,
          "toolCalls": 2,
          "estimatedCost": 0.05
        }
      }
    }
  ]
}
```

**Used by**: `ConversationsContext.tsx`, conversation list

---

### Get Conversation Messages
```http
GET /agents/:slug/conversations/:conversationId/messages
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "Hello",
      "timestamp": "2025-12-08T12:00:00Z"
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "Hi! How can I help?",
      "timestamp": "2025-12-08T12:00:05Z"
    }
  ]
}
```

**Used by**: `ConversationsContext.tsx`, chat view

---

### Update Conversation
```http
PATCH /agents/:slug/conversations/:conversationId
```

**Request Body**:
```json
{
  "title": "New Title"
}
```

**Response**:
```json
{
  "success": true,
  "data": { /* updated conversation */ }
}
```

**Used by**: Conversation management, title editing

---

### Delete Conversation
```http
DELETE /agents/:slug/conversations/:conversationId
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: Conversation management

---

### Manage Conversation Context
```http
POST /api/agents/:slug/conversations/:conversationId/context
```

**Request Body** (add system message):
```json
{
  "action": "add-system-message",
  "content": "User switched to dark mode"
}
```

**Request Body** (clear history):
```json
{
  "action": "clear-history"
}
```

**Response**:
```json
{
  "success": true,
  "message": "System event added"
}
```

**Used by**: Context management features

---

### Get Conversation Statistics
```http
GET /agents/:slug/conversations/:conversationId/stats
```

**Response**:
```json
{
  "success": true,
  "data": {
    "inputTokens": 1000,
    "outputTokens": 500,
    "totalTokens": 1500,
    "contextTokens": 1500,
    "turns": 5,
    "toolCalls": 2,
    "estimatedCost": 0.05,
    "contextWindowPercentage": 0.75,
    "conversationId": "conv-123",
    "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "modelStats": {},
    "systemPromptTokens": 200,
    "mcpServerTokens": 300,
    "userMessageTokens": 500,
    "assistantMessageTokens": 500,
    "contextFilesTokens": 0
  }
}
```

**Used by**: `StatsContext.tsx`, `ConversationStats.tsx`

---

## Configuration

### Get App Configuration
```http
GET /config/app
```

**Response**:
```json
{
  "success": true,
  "data": {
    "region": "us-east-1",
    "defaultModel": "anthropic.claude-3-5-sonnet-20240620-v1:0"
  }
}
```

**Used by**: `ConfigContext.tsx`, settings view

---

### Update App Configuration
```http
PUT /config/app
```

**Request Body**:
```json
{
  "region": "us-west-2",
  "defaultModel": "anthropic.claude-3-haiku-20240307-v1:0"
}
```

**Response**:
```json
{
  "success": true,
  "data": { /* updated config */ }
}
```

**Used by**: `ConfigContext.tsx`, settings view

---

## Bedrock Models

### List Available Models
```http
GET /bedrock/models
```

Returns all available Bedrock models and inference profiles with ON_DEMAND support.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "modelArn": "arn:aws:bedrock:...",
      "modelName": "Claude 3.5 Sonnet",
      "providerName": "Anthropic",
      "inputModalities": ["TEXT", "IMAGE"],
      "outputModalities": ["TEXT"],
      "responseStreamingSupported": true,
      "customizationsSupported": [],
      "inferenceTypesSupported": ["ON_DEMAND"]
    }
  ]
}
```

**Used by**: `ModelsContext.tsx`, `AppDataContext.tsx`, model selector

---

### Get Model Pricing
```http
GET /bedrock/pricing?region=us-east-1
```

**Response**:
```json
{
  "success": true,
  "data": {
    "anthropic.claude-3-5-sonnet-20240620-v1:0": {
      "inputTokenPrice": 0.003,
      "outputTokenPrice": 0.015
    }
  }
}
```

**Used by**: Cost calculations, analytics

---

### Validate Model ID
```http
GET /bedrock/models/:modelId/validate
```

**Response**:
```json
{
  "success": true,
  "data": {
    "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "isValid": true
  }
}
```

**Used by**: Model validation in forms

---

### Get Model Info
```http
GET /bedrock/models/:modelId
```

**Response**:
```json
{
  "success": true,
  "data": {
    "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "modelName": "Claude 3.5 Sonnet",
    "providerName": "Anthropic",
    ...
  }
}
```

**Used by**: Model details, capabilities checking

---

## Analytics

### Get Usage Statistics
```http
GET /api/analytics/usage
```

**Response**:
```json
{
  "data": {
    "totalMessages": 1000,
    "totalTokens": 50000,
    "totalCost": 2.50,
    "byAgent": {
      "my-agent": {
        "messages": 500,
        "tokens": 25000,
        "cost": 1.25
      }
    },
    "byDay": [
      {
        "date": "2025-12-08",
        "messages": 100,
        "tokens": 5000,
        "cost": 0.25
      }
    ]
  }
}
```

**Used by**: `AnalyticsContext.tsx`, analytics dashboard

---

### Get Achievements
```http
GET /api/analytics/achievements
```

**Response**:
```json
{
  "data": [
    {
      "id": "first-message",
      "title": "First Message",
      "description": "Sent your first message",
      "unlocked": true,
      "unlockedAt": "2025-12-08T12:00:00Z"
    }
  ]
}
```

**Used by**: `AnalyticsContext.tsx`, achievements display

---

### Rescan Analytics
```http
POST /api/analytics/rescan
```

Triggers a full rescan of all conversation data to rebuild analytics.

**Response**:
```json
{
  "data": { /* updated stats */ },
  "message": "Full rescan completed"
}
```

**Used by**: `AnalyticsContext.tsx`, analytics management

---

## Monitoring

### Get System Stats
```http
GET /monitoring/stats
```

**Response**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "slug": "my-agent",
        "name": "Stallion Agent",
        "status": "idle",
        "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
        "conversationCount": 10,
        "messageCount": 100,
        "cost": 5.00,
        "healthy": true
      }
    ],
    "summary": {
      "totalAgents": 1,
      "activeAgents": 0,
      "runningAgents": 0,
      "totalMessages": 100,
      "totalCost": 5.00
    }
  }
}
```

**Used by**: `MonitoringContext.tsx`, monitoring dashboard

---

### Get Historical Metrics
```http
GET /monitoring/metrics?range=today
```

**Query Parameters**:
- `range`: `today` | `week` | `month` | `all`

**Response**:
```json
{
  "success": true,
  "data": {
    "range": "today",
    "metrics": [
      {
        "agentSlug": "my-agent",
        "messageCount": 50,
        "conversationCount": 5,
        "totalCost": 2.50
      }
    ]
  }
}
```

**Used by**: `MonitoringContext.tsx`, metrics visualization

---

### Get/Stream Events (SSE)
```http
GET /monitoring/events?start=2025-12-08T00:00:00Z&end=2025-12-08T23:59:59Z&userId=default-user
```

**Query Parameters**:
- `start`: ISO timestamp (optional, for historical)
- `end`: ISO timestamp (optional, for historical)
- `userId`: User ID filter (default: `default-user`)

**Response** (historical):
```json
{
  "success": true,
  "data": [
    {
      "type": "message",
      "timestamp": "2025-12-08T12:00:00Z",
      "agentSlug": "my-agent",
      "conversationId": "conv-123",
      "messageCount": 1
    }
  ]
}
```

**Response** (streaming SSE):
```
data: {"type":"connected","timestamp":"2025-12-08T12:00:00Z"}

data: {"type":"message","agentSlug":"my-agent","conversationId":"conv-123"}

data: {"type":"heartbeat","timestamp":"2025-12-08T12:00:30Z"}
```

**Used by**: `MonitoringContext.tsx`, real-time monitoring

---

## Agent Invocation

### 🟢 ✅ Silent Invocation (No Memory)
```http
POST /agents/:slug/invoke
```

Invoke agent without loading conversation history. Used for dashboard data fetching and utility tasks.

**Request Body**:
```json
{
  "prompt": "What's the weather today?",
  "silent": true,
  "model": "anthropic.claude-3-haiku-20240307-v1:0",
  "tools": ["files_read_file"]
}
```

**Response**:
```json
{
  "success": true,
  "response": "The weather is sunny...",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50
  }
}
```

**Error** (authentication):
```json
{
  "success": false,
  "error": "authentication failed"
}
```
Status: `401`

**Status**: In use  
**Used by**: 
- Dashboard widgets, background data fetching
- `stallion-layout/CRM.tsx` (activity description generation)
- `AgentEditorView.tsx` (prompt generation with `default` agent)

**Tip**: Use the `default` agent for simple text generation without tools:
```bash
POST /agents/default/invoke
{
  "prompt": "Generate a professional email subject line",
  "silent": true
}
```

---

### Raw Tool Call (No LLM)
```http
POST /agents/:slug/tools/:toolName
```

Execute a tool directly without LLM processing.

**Request Body**: Tool arguments
```json
{
  "startDate": "2025-12-08",
  "endDate": "2025-12-15"
}
```

**Response**:
```json
{
  "success": true,
  "response": { /* tool result */ },
  "debug": {
    "toolDuration": 150.5,
    "totalDuration": 152.3
  }
}
```

**Used by**: Direct tool invocations, testing

---

### Streaming Invocation
```http
POST /agents/:slug/invoke/stream
```

Invoke agent with streaming response and optional structured output.

**Request Body**:
```json
{
  "prompt": "List files in the documents folder",
  "silent": true,
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "tools": ["files_list_directory"],
  "maxSteps": 10,
  "schema": {
    "type": "object",
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "size": { "type": "number" }
          }
        }
      }
    }
  }
}
```

**Response** (SSE stream):
```
data: {"type":"text-delta","text":"Looking"}

data: {"type":"tool-call","toolName":"files_list_directory"}

data: {"type":"tool-result","result":{...}}

data: {"type":"finish","text":"Here are your files..."}
```

**Used by**: Streaming responses with structured output

---

## Model Capabilities

### Get Model Capabilities
```http
GET /api/models/capabilities
```

**Response**:
```json
{
  "success": true,
  "data": {
    "anthropic.claude-3-5-sonnet-20240620-v1:0": {
      "supportsAttachments": true,
      "supportsStreaming": true,
      "supportsTools": true,
      "contextWindow": 200000
    }
  }
}
```

**Used by**: `ModelCapabilitiesContext.tsx`, feature detection

---

## Error Handling

All endpoints follow a consistent error response format:

**Success**:
```json
{
  "success": true,
  "data": { /* response data */ }
}
```

**Error**:
```json
{
  "success": false,
  "error": "Error message"
}
```

**HTTP Status Codes**:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized (authentication error)
- `404`: Not Found
- `500`: Internal Server Error

**Authentication Errors** (Status `401`):
Triggered when error message contains:
- `authentication failed`
- `status code 403`
- `Form action URL not found`

---

## Frontend Usage Summary

### Contexts Using API Endpoints

| Context | Endpoints Used |
|---------|---------------|
| `AgentsContext` | `/api/agents`, `/agents/:slug`, `/agents` (POST/PUT/DELETE) |
| `LayoutsContext` | `/layouts`, `/layouts/:slug` (GET/POST/PUT/DELETE) |
| `ConversationsContext` | `/agents/:slug/conversations`, `/agents/:slug/conversations/:id/messages`, `/agents/:slug/tools` |
| `StatsContext` | `/agents/:slug/conversations/:id/stats` |
| `ConfigContext` | `/config/app` (GET/PUT) |
| `ModelsContext` | `/bedrock/models` |
| `AppDataContext` | `/bedrock/models` |
| `AnalyticsContext` | `/api/analytics/usage`, `/api/analytics/achievements`, `/api/analytics/rescan` |
| `MonitoringContext` | `/monitoring/stats`, `/monitoring/events` |
| `ModelCapabilitiesContext` | `/api/models/capabilities` |
| `WorkflowsContext` | `/agents/:slug/workflows/files` |

### Components Using Direct API Calls

- **ChatDock**: Uses the custom `/api/agents/:slug/chat` streaming endpoint
- **Stallion Layout**: `/agents/:slug/tools/:toolName`
- **Agent Editor**: Integration management endpoints
- **Settings View**: Configuration endpoints

---

## Auth & Users

> **New section** — routes from `src-server/routes/auth.ts`

### Get Auth Status
```http
GET /auth/status
```

Returns current authentication status and resolved user identity.

**Response**:
```json
{
  "authenticated": true,
  "user": {
    "alias": "jdoe",
    "name": "Jane Doe",
    "email": "jdoe@example.com"
  }
}
```

---

### Renew Credentials
```http
POST /auth/renew
```

Triggers credential renewal via the configured auth provider.

**Response**:
```json
{
  "success": true,
  "message": "Credentials renewed"
}
```

---

### Terminal Auth Renew
```http
POST /auth/terminal
```

Alias for `/auth/renew` — triggers credential renewal (used for terminal-based auth flows).

**Response**: Same as `/auth/renew`

---

### Get Badge Photo
```http
GET /auth/badge-photo/:id
```

Returns a JPEG badge/profile photo for the given user ID. Requires the configured auth provider to support `getBadgePhoto`.

**Response**: `image/jpeg` binary  
**Cache-Control**: `public, max-age=86400`  
**Error**: `404` if not found or provider does not support photos

---

### Search Users
```http
GET /users/search?q=<query>
```

Search the user directory by name or alias.

**Query Parameters**:
- `q`: Search string (required; returns `[]` if empty)

**Response**:
```json
[
  { "alias": "jdoe", "name": "Jane Doe", "email": "jdoe@example.com" }
]
```

---

### Lookup User by Alias
```http
GET /users/:alias
```

Look up a specific user by their alias.

**Response**:
```json
{ "alias": "jdoe", "name": "Jane Doe", "email": "jdoe@example.com" }
```

**Error** (`404`):
```json
{ "alias": "jdoe", "name": "jdoe", "error": "User not found" }
```

---

## Branding

> **New section** — routes from `src-server/routes/branding.ts`

### Get Branding Config
```http
GET /branding
```

Returns resolved branding configuration from the active branding provider.

**Response**:
```json
{
  "name": "Stallion AI",
  "logo": null,
  "theme": null,
  "welcomeMessage": null
}
```

Fields are `null` when the provider does not implement the optional method.

---

## Events (SSE)

> **New section** — routes from `src-server/routes/events.ts`

### Subscribe to Real-Time Events
```http
GET /events
```

Opens a Server-Sent Events stream for all real-time server events. On connect, replays the current ACP connection state so clients don't miss events that fired before they subscribed.

**Response** (SSE stream):
```
event: acp:status
data: {"connected":true,"connections":[{"id":"acp-1","status":"connected"}]}

event: system:status-changed
data: {"source":"config"}

event: ping
data: 
```

A `ping` keepalive is sent every 30 seconds.

---

## File System

> **New section** — routes from `src-server/routes/fs.ts`

### Browse Directories
```http
GET /fs/browse?path=<path>
```

Lists directories (not files) at the given path. Used by the UI directory picker.

**Query Parameters**:
- `path`: Absolute path or `~` for home directory (default: `~`)

**Response**:
```json
{
  "path": "/Users/jdoe",
  "entries": [
    { "name": "Documents", "isDirectory": true },
    { "name": "Downloads", "isDirectory": true }
  ]
}
```

Entries are sorted: non-dotfiles first, then dotfiles, each group alphabetically.

**Error** (`404`):
```json
{ "error": "Path not found or permission denied" }
```

---

## Insights

> **New section** — routes from `src-server/routes/insights.ts`

### Get Usage Insights
```http
GET /insights?days=14
```

Aggregates monitoring event logs to produce tool usage, hourly activity, agent usage, and model usage statistics.

**Query Parameters**:
- `days`: Number of days to look back (default: `14`)

**Response**:
```json
{
  "data": {
    "toolUsage": {
      "files_read_file": { "calls": 42, "errors": 1 }
    },
    "hourlyActivity": [0, 0, 0, 0, 0, 0, 2, 5, 12, 18, 20, 15, 10, 8, 14, 16, 12, 9, 6, 4, 2, 1, 0, 0],
    "agentUsage": {
      "my-agent": { "chats": 30, "tokens": 45000 }
    },
    "modelUsage": {
      "anthropic.claude-3-5-sonnet-20240620-v1:0": 28
    },
    "totalChats": 30,
    "totalToolCalls": 42,
    "totalErrors": 1,
    "days": 14
  }
}
```

---

## Model Capabilities (Legacy)

> **New section** — routes from `src-server/routes/models.ts`
>
> **Note**: This is a legacy standalone route module. Prefer `/bedrock/models` and `/bedrock/pricing` (from `bedrock.ts`) for new integrations.

### Get Model Capabilities
```http
GET /api/models/capabilities
```

Lists all ACTIVE and LEGACY Bedrock foundation models with capability flags. Results are cached for 1 hour.

**Response**:
```json
{
  "data": [
    {
      "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "modelName": "Claude 3.5 Sonnet",
      "provider": "Anthropic",
      "inputModalities": ["TEXT", "IMAGE"],
      "outputModalities": ["TEXT"],
      "supportsStreaming": true,
      "supportsImages": true,
      "supportsVideo": false,
      "supportsAudio": false,
      "lifecycleStatus": "ACTIVE"
    }
  ]
}
```

**Error** (`401`): AWS credentials not configured.

---

### Get Model Pricing (Legacy)
```http
GET /api/models/pricing/:modelId?region=us-east-1
```

Fetches per-token pricing for a specific model from the AWS Pricing API.

**Path Parameters**:
- `modelId`: Bedrock model ID

**Query Parameters**:
- `region`: AWS region (default: `AWS_REGION` env or `us-east-1`)

**Response**:
```json
{
  "data": {
    "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "region": "us-east-1",
    "inputTokenPrice": 0.003,
    "outputTokenPrice": 0.015,
    "currency": "USD"
  }
}
```

---

## Plugins

> **New section** — routes from `src-server/routes/plugins.ts`

### List Installed Plugins
```http
GET /plugins
```

Returns all installed plugins with manifest info, bundle status, git metadata, and permission state.

**Response**:
```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "displayName": "My Plugin",
      "version": "1.0.0",
      "description": "A plugin",
      "hasBundle": true,
      "layout": { "slug": "my-layout" },
      "agents": [{ "slug": "assistant" }],
      "providers": [],
      "links": [],
      "git": { "hash": "abc1234", "branch": "main", "remote": "https://github.com/org/my-plugin.git" },
      "permissions": {
        "declared": ["network.fetch"],
        "granted": ["network.fetch"],
        "missing": []
      }
    }
  ]
}
```

---

### Preview Plugin (Pre-install Validation)
```http
POST /plugins/preview
```

Fetches a plugin from a git URL or local path, validates it, and returns manifest, components, conflicts, and dependencies — without installing.

**Request Body**:
```json
{
  "source": "https://github.com/org/my-plugin.git"
}
```

**Response**:
```json
{
  "valid": true,
  "manifest": { "name": "my-plugin", "version": "1.0.0", "agents": [], "providers": [] },
  "components": [
    { "type": "agent", "id": "my-plugin:assistant" },
    { "type": "layout", "id": "my-layout" }
  ],
  "conflicts": [],
  "dependencies": [],
  "git": { "hash": "abc1234", "branch": "main" }
}
```

**Error** (`400`/`500`):
```json
{ "valid": false, "error": "Not a valid plugin: plugin.json not found", "components": [], "conflicts": [] }
```

---

### Install Plugin
```http
POST /plugins/install
```

Installs a plugin from a git URL or local path, including agents, layout config, providers, tools, and dependencies.

**Request Body**:
```json
{
  "source": "https://github.com/org/my-plugin.git",
  "skip": ["agent:my-plugin:assistant"]
}
```

- `source`: Git URL (supports `#branch` suffix) or local path
- `skip`: Optional array of component IDs to exclude (e.g. `"agent:<slug>"`, `"layout:<slug>"`, `"provider:<type>"`, `"tool:<id>"`)

**Response**:
```json
{
  "success": true,
  "plugin": { "name": "my-plugin", "displayName": "My Plugin", "version": "1.0.0", "hasBundle": true },
  "tools": [{ "id": "my-tool", "status": "installed" }],
  "dependencies": [{ "id": "dep-plugin", "status": "installed" }],
  "permissions": {
    "autoGranted": ["network.fetch"],
    "pendingConsent": []
  }
}
```

---

### Check for Plugin Updates
```http
GET /plugins/check-updates
```

Checks all installed plugins for available updates via git fetch (git-installed) or registry version comparison.

**Response**:
```json
{
  "updates": [
    {
      "name": "my-plugin",
      "currentVersion": "1.0.0",
      "latestVersion": "newer commit available",
      "source": "git"
    }
  ]
}
```

---

### Update Plugin
```http
POST /plugins/:name/update
```

Updates a plugin via `git pull` (git-installed) or registry reinstall.

**Response**:
```json
{
  "success": true,
  "plugin": { "name": "my-plugin", "version": "1.1.0" }
}
```

---

### Remove Plugin
```http
DELETE /plugins/:name
```

Removes a plugin, its agents, layout config, and permission grants. Conversation memory is preserved.

**Response**:
```json
{ "success": true }
```

---

### Serve Plugin Bundle (JS)
```http
GET /plugins/:name/bundle.js
```

Serves the compiled JavaScript bundle for a plugin. Returns `404` if no bundle exists.

**Response**: `application/javascript`

---

### Serve Plugin Bundle (CSS)
```http
GET /plugins/:name/bundle.css
```

Serves the compiled CSS bundle for a plugin. Returns empty `200` if no CSS exists.

**Response**: `text/css`

---

### Get Plugin Permissions
```http
GET /plugins/:name/permissions
```

Returns declared and granted permissions for a plugin.

**Response**:
```json
{
  "declared": ["network.fetch", "fs.read"],
  "granted": ["network.fetch"]
}
```

---

### Grant Plugin Permissions
```http
POST /plugins/:name/grant
```

Grants one or more permissions to a plugin.

**Request Body**:
```json
{ "permissions": ["fs.read"] }
```

**Response**:
```json
{ "success": true, "granted": ["fs.read"] }
```

---

### Plugin Fetch Proxy (Scoped)
```http
POST /plugins/:name/fetch
```

Server-side HTTP proxy for a plugin. Requires the plugin to have the `network.fetch` permission grant.

**Request Body**:
```json
{
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": { "Authorization": "Bearer <token>" },
  "body": null
}
```

**Response**:
```json
{
  "success": true,
  "status": 200,
  "contentType": "application/json",
  "body": "{\"key\":\"value\"}"
}
```

**Error** (`403`): Plugin does not have `network.fetch` permission.

---

### Plugin Fetch Proxy (Legacy/Unscoped)
```http
POST /plugins/fetch
```

Legacy server-side HTTP proxy with no permission check. Same request/response shape as the scoped variant above.

---

### Reload Plugin Providers
```http
POST /plugins/reload
```

Clears and reloads all plugin providers from disk. Useful after manual plugin changes.

**Response**:
```json
{ "success": true, "loaded": 3 }
```

---

### Get Plugin Providers
```http
GET /plugins/:name/providers
```

Returns provider declarations for a plugin with their enabled/disabled state.

**Response**:
```json
{
  "providers": [
    { "type": "auth", "module": "dist/auth-provider.js", "layout": null, "enabled": true }
  ]
}
```

---

### Get Plugin Overrides
```http
GET /plugins/:name/overrides
```

Returns the current provider override config for a plugin (e.g. which providers are disabled).

**Response**:
```json
{ "disabled": ["auth"] }
```

---

### Update Plugin Overrides
```http
PUT /plugins/:name/overrides
```

Updates provider override config for a plugin.

**Request Body**:
```json
{ "disabled": ["auth"] }
```

**Response**:
```json
{ "success": true }
```

---

## Registry

> **New section** — routes from `src-server/routes/registry.ts`

### List Available Agents (Registry)
```http
GET /registry/agents
```

Lists agents available in the configured agent registry provider.

**Response**:
```json
{ "success": true, "data": [{ "id": "my-agent", "version": "1.0.0", "description": "..." }] }
```

---

### List Installed Agents (Registry)
```http
GET /registry/agents/installed
```

Lists agents currently installed via the registry.

**Response**:
```json
{ "success": true, "data": [{ "id": "my-agent", "version": "1.0.0" }] }
```

---

### Install Agent from Registry
```http
POST /registry/agents/install
```

**Request Body**:
```json
{ "id": "my-agent" }
```

**Response**:
```json
{ "success": true, "message": "Installed" }
```

---

### Uninstall Agent from Registry
```http
DELETE /registry/agents/:id
```

**Response**:
```json
{ "success": true }
```

---

### List Available Integrations (Registry)
```http
GET /registry/integrations
```

**Response**:
```json
{ "success": true, "data": [{ "id": "my-tool", "version": "1.0.0", "description": "..." }] }
```

---

### List Installed Integrations (Registry)
```http
GET /registry/integrations/installed
```

**Response**:
```json
{ "success": true, "data": [{ "id": "my-tool", "version": "1.0.0" }] }
```

---

### Install Integration from Registry
```http
POST /registry/integrations/install
```

Installs an integration and auto-generates its `integration.json` from provider metadata.

**Request Body**:
```json
{ "id": "my-tool" }
```

**Response**:
```json
{ "success": true }
```

---

### Uninstall Integration from Registry
```http
DELETE /registry/integrations/:id
```

**Response**:
```json
{ "success": true }
```

---

### Sync Integration Registry
```http
POST /registry/integrations/sync
```

Triggers a sync of the integration registry provider.

**Response**:
```json
{ "success": true }
```

---

### List Available Skills (Registry)
```http
GET /registry/skills
```

Lists skills available in the configured registry provider.

**Response**:
```json
{ "success": true, "data": [{ "id": "my-skill", "description": "..." }] }
```

---

### Install Skill from Registry
```http
POST /registry/skills/install
```

**Request Body**:
```json
{ "id": "my-skill" }
```

**Response**:
```json
{ "success": true }
```

---

### Uninstall Skill from Registry
```http
DELETE /registry/skills/:id
```

**Response**:
```json
{ "success": true }
```

---

### List Available Plugins (Registry)
```http
GET /registry/plugins
```

Lists plugins available in the configured registry provider.

**Response**:
```json
{ "success": true, "data": [{ "id": "my-plugin", "version": "1.0.0", "description": "..." }] }
```

---

### List Installed Plugins (Registry)
```http
GET /registry/plugins/installed
```

**Response**:
```json
{ "success": true, "data": [{ "id": "my-plugin", "version": "1.0.0" }] }
```

---

### Install Plugin from Registry
```http
POST /registry/plugins/install
```

**Request Body**:
```json
{ "id": "my-plugin" }
```

**Response**:
```json
{ "success": true }
```

---

### Uninstall Plugin from Registry
```http
DELETE /registry/plugins/:id
```

**Response**:
```json
{ "success": true }
```

---

## Scheduler

> **New section** — routes from `src-server/routes/scheduler.ts`

### List Scheduler Providers
```http
GET /scheduler/providers
```

Returns registered scheduler provider names (used to populate UI dropdowns).

**Response**:
```json
{ "success": true, "data": ["cron", "eventbridge"] }
```

---

### Subscribe to Scheduler Events (SSE)
```http
GET /scheduler/events
```

Opens a Server-Sent Events stream for real-time scheduler job events. Sends a `ping` keepalive every 30 seconds.

**Response** (SSE stream):
```
data: {"type":"job-started","target":"my-job","timestamp":"..."}

event: ping
data: 
```

---

### Scheduler Webhook Receiver
```http
POST /scheduler/webhook
```

Receives webhook events from external scheduler providers and broadcasts them to SSE subscribers.

**Request Body**: Any JSON event payload from the scheduler provider.

**Response**:
```json
{ "success": true }
```

---

### List Scheduled Jobs
```http
GET /scheduler/jobs
```

**Response**:
```json
{
  "success": true,
  "data": [
    { "target": "my-job", "schedule": "0 9 * * 1-5", "enabled": true, "lastRun": "..." }
  ]
}
```

---

### Get Scheduler Stats
```http
GET /scheduler/stats
```

**Response**:
```json
{
  "success": true,
  "data": { "totalJobs": 5, "enabledJobs": 4, "lastRunAt": "..." }
}
```

---

### Get Scheduler Status
```http
GET /scheduler/status
```

**Response**:
```json
{
  "success": true,
  "data": { "running": true, "provider": "cron" }
}
```

---

### Preview Cron Schedule
```http
GET /scheduler/jobs/preview-schedule?cron=<expr>&count=5
```

Returns the next N scheduled run times for a cron expression.

**Query Parameters**:
- `cron`: Cron expression (required)
- `count`: Number of upcoming runs to return (default: `5`)

**Response**:
```json
{
  "success": true,
  "data": ["2025-07-15T09:00:00Z", "2025-07-16T09:00:00Z"]
}
```

---

### Get Job Logs
```http
GET /scheduler/jobs/:target/logs?count=20
```

Returns recent run logs for a specific job.

**Query Parameters**:
- `count`: Number of log entries to return (default: `20`)

**Response**:
```json
{
  "success": true,
  "data": [
    { "runAt": "2025-07-14T09:00:00Z", "status": "success", "outputPath": "/path/to/output.log" }
  ]
}
```

---

### Read Run Output
```http
POST /scheduler/runs/output
```

Reads the content of a run output file by its log path.

**Request Body**:
```json
{ "path": "/path/to/output.log" }
```

**Response**:
```json
{ "success": true, "data": { "content": "Job output text..." } }
```

---

### Create Job
```http
POST /scheduler/jobs
```

**Request Body**: Job configuration (provider-specific).

**Response**:
```json
{ "success": true, "data": { "output": "Job created" } }
```

---

### Update Job
```http
PUT /scheduler/jobs/:target
```

**Request Body**: Updated job options (provider-specific).

**Response**:
```json
{ "success": true, "data": { "output": "Job updated" } }
```

---

### Run Job Now
```http
POST /scheduler/jobs/:target/run
```

Triggers an immediate run of a scheduled job.

**Response**:
```json
{ "success": true, "data": { "output": "Job triggered" } }
```

---

### Enable Job
```http
PUT /scheduler/jobs/:target/enable
```

**Response**:
```json
{ "success": true }
```

---

### Disable Job
```http
PUT /scheduler/jobs/:target/disable
```

**Response**:
```json
{ "success": true }
```

---

### Delete Job
```http
DELETE /scheduler/jobs/:target
```

**Response**:
```json
{ "success": true }
```

---

### Open File with System Handler
```http
POST /scheduler/open
```

Opens a file using the OS default application (`open` on macOS, `xdg-open` on Linux, `start` on Windows).

**Request Body**:
```json
{ "path": "/path/to/file.log" }
```

**Response**:
```json
{ "success": true }
```

---

## System

> **New section** — routes from `src-server/routes/system.ts`

### Get System Status
```http
GET /system/status
```

Fast readiness check: resolves AWS credentials, checks ACP connections, detects installed CLIs, and aggregates onboarding prerequisites from all registered providers.

**Response**:
```json
{
  "prerequisites": [
    { "id": "aws-sso", "label": "AWS SSO Login", "met": true, "source": "my-plugin" }
  ],
  "bedrock": {
    "credentialsFound": true,
    "verified": null,
    "region": "us-east-1"
  },
  "acp": {
    "connected": true,
    "connections": [{ "id": "acp-1", "status": "connected" }]
  },
  "clis": {
    "kiro-cli": true,
    "claude": false
  },
  "ready": true
}
```

---

### Verify Bedrock Credentials
```http
POST /system/verify-bedrock
```

Heavier check — actually calls `ListFoundationModels` to confirm credentials work.

**Request Body** (optional):
```json
{ "region": "us-west-2" }
```

**Response**:
```json
{ "verified": true, "region": "us-east-1" }
```

**Error**:
```json
{ "verified": false, "error": "UnrecognizedClientException: ..." }
```

---

### Check for Core App Update
```http
GET /system/core-update
```

Checks the app's git repository for upstream commits.

**Response**:
```json
{
  "currentHash": "abc1234",
  "remoteHash": "def5678",
  "branch": "main",
  "behind": 3,
  "ahead": 0,
  "updateAvailable": true
}
```

When no upstream is configured:
```json
{ "currentHash": "abc1234", "branch": "main", "behind": 0, "ahead": 0, "updateAvailable": false, "noUpstream": true }
```

---

### Apply Core App Update
```http
POST /system/core-update
```

Runs `git pull --ff-only` on the app repository and emits a `core:updated` event.

**Response**:
```json
{ "success": true, "hash": "def5678", "message": "Updated to def5678. Restart to apply." }
```

---

### Get Server Capabilities
```http
GET /system/capabilities
```

Returns the server's runtime and available voice/context provider capabilities.

**Response**:
```json
{
  "runtime": "voltagent",
  "voice": {
    "stt": [
      { "id": "webspeech", "name": "WebSpeech (Browser)", "clientOnly": true, "visibleOn": ["all"], "configured": true }
    ],
    "tts": [
      { "id": "webspeech", "name": "WebSpeech (Browser)", "clientOnly": true, "visibleOn": ["all"], "configured": true }
    ]
  },
  "context": {
    "providers": [
      { "id": "geolocation", "name": "Geolocation", "visibleOn": ["mobile"] },
      { "id": "timezone", "name": "Timezone", "visibleOn": ["all"] }
    ]
  },
  "scheduler": true
}
```

---

### Discovery Beacon
```http
GET /system/discover
```

Open-CORS endpoint that LAN clients can probe to detect a Stallion server without credentials.

**Response** (CORS: `*`):
```json
{
  "stallion": true,
  "name": "Project Stallion",
  "port": 3141
}
```

---

## Global Routes

### Global Invoke (No Agent Context)
```http
POST /invoke
```

Lightweight multi-turn invocation without a named agent. Supports tool calling and structured output.

**Request Body**:
```json
{
  "prompt": "What is 2+2?",
  "schema": { "type": "object", "properties": { "answer": { "type": "number" } } },
  "tools": ["calculator"],
  "maxSteps": 5,
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
```

**Response**:
```json
{
  "success": true,
  "response": "4"
}
```

---

### Tool Approval Response
```http
POST /tool-approval/:approvalId
```

Approve or reject a pending tool call.

**Request Body**:
```json
{
  "approved": true
}
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: `useToolApproval.ts`, `ToolApprovalHandler.ts`

---

### Global Conversation Lookup
```http
GET /api/conversations/:id
```

Looks up a conversation by ID across all agents and projects.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "conv-123",
    "agentSlug": "my-agent",
    "title": "Conversation Title"
  }
}
```

---

## Additional System Routes

### Get Runtime Info
```http
GET /api/system/runtime
```

Returns the current runtime type.

**Response**:
```json
{ "runtime": "voltagent" }
```

---

### List Skills
```http
GET /api/system/skills
```

Returns available skills.

---

### Get Terminal Port
```http
GET /api/system/terminal-port
```

Returns the terminal WebSocket port.

---

## UI Commands

### Dispatch UI Command
```http
POST /api/ui
```

Dispatches a command to the frontend via the event bus.

**Request Body**:
```json
{
  "command": "navigate",
  "args": { "path": "/settings" }
}
```

**Response**:
```json
{ "success": true }
```

---

## Additional Analytics

### Clear Usage Data
```http
DELETE /api/analytics/usage
```

Clears all usage analytics data.

**Response**:
```json
{
  "data": {},
  "message": "Usage data cleared"
}
```

**Used by**: `UsageStatsPanel.tsx`

---

## Architecture Notes

### Custom Endpoint Registration

Custom endpoints are registered via `configureApp` callback in `honoServer()`:

```typescript
server: honoServer({
  port: this.port,
  configureApp: (app) => {
    // Custom routes registered here
    app.get('/api/agents', async (c) => { /* ... */ });
    app.post('/agents', async (c) => { /* ... */ });
  }
})
```

### Authentication

When authentication is configured, custom routes inherit the same authentication behavior as the core runtime. See your auth provider documentation for details.

### CORS

CORS is configured to allow localhost origins and any origins specified in `ALLOWED_ORIGINS` environment variable:

```typescript
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      return origin;
    }
    const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
    return allowed.includes(origin) ? origin : null;
  },
  credentials: true,
}));
```

---
