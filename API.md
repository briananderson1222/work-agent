# Work Agent API Documentation

This document describes all REST API endpoints available in Work Agent, including both VoltAgent-provided and custom endpoints.

**Base URL**: `http://localhost:3141`  
**Swagger UI**: `http://localhost:3141/ui` (VoltAgent built-in endpoints)  
**In-Use Endpoints**: See [ENDPOINTS_IN_USE.md](./ENDPOINTS_IN_USE.md) for which endpoints are actively used by the frontend

## Endpoint Legend

- 🔵 **VoltAgent Built-in** - Provided by `@voltagent/server-hono`
- 🟢 **Custom** - Work Agent-specific extensions
- ✅ **In Use** - Currently used by frontend
- ⚪ **Available** - Implemented but not currently used

## Table of Contents

- [VoltAgent Core Endpoints](#voltagent-core-endpoints)
- [Agent Management](#agent-management)
- [Tool Management](#tool-management)
- [Workspace Management](#workspace-management)
- [Workflow Management](#workflow-management)
- [Conversation Management](#conversation-management)
- [Configuration](#configuration)
- [Bedrock Models](#bedrock-models)
- [Analytics](#analytics)
- [Monitoring](#monitoring)
- [Agent Invocation](#agent-invocation)

---

## VoltAgent Core Endpoints

These endpoints are provided by VoltAgent's `@voltagent/server-hono` package. See the [VoltAgent API documentation](https://voltagent.dev/docs/api/endpoints/agents) for complete details.

**Note**: Work Agent does not currently use any VoltAgent built-in endpoints. All functionality is provided through custom endpoints.

### 🔵 ⚪ List All Agents (VoltAgent)
```http
GET /agents
```

Returns basic agent information from VoltAgent core.

**Status**: Available but not used  
**Note**: Use `/api/agents` (custom endpoint below) for enriched agent data with configuration details.

---

### 🔵 ⚪ Generate Text
```http
POST /agents/:slug/text
```

Generate a text response from an agent synchronously.

**Request Body**:
```json
{
  "input": "What is the weather like today?",
  "options": {
    "userId": "user-123",
    "conversationId": "conv-456",
    "temperature": 0.7,
    "maxOutputTokens": 1000
  }
}
```

**Status**: Available but not used  
**Note**: We use custom `/agents/:slug/invoke` endpoint instead (no memory overhead)

---

### 🔵 ⚪ Stream Text (Raw)
```http
POST /agents/:slug/stream
```

Generate a text response and stream raw fullStream data via Server-Sent Events (SSE).

**Status**: Available but not used  
**Note**: We use custom `/api/agents/:slug/chat` endpoint instead

---

### 🔵 ⚪ Chat Stream (AI SDK Compatible)
```http
POST /agents/:slug/chat
```

Generate a text response and stream it as UI messages via SSE. Compatible with AI SDK's `useChat` hook.

**Status**: Available but not used  
**Note**: We use custom `/api/agents/:slug/chat` endpoint instead (see below)

---

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

### 🔵 ⚪ Generate Object
```http
POST /agents/:slug/object
```

Generate a structured object that conforms to a JSON schema.

**Status**: Available but not used

**Request Body**:
```json
{
  "input": "Extract user info: John Doe, 30 years old, john@example.com",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "number" },
      "email": { "type": "string", "format": "email" }
    },
    "required": ["name", "age", "email"]
  }
}
```

---

### 🔵 ⚪ Stream Object
```http
POST /agents/:slug/stream-object
```

Generate a structured object and stream partial updates via SSE.

**Status**: Available but not used

---

### 🔵 ⚪ Workflow Endpoints

VoltAgent also provides workflow execution endpoints. See [VoltAgent Workflow API](https://voltagent.dev/docs/api/endpoints/workflows) for details.

**Status**: Available but not used  
**Note**: We use custom workflow file management endpoints instead

---

---

## Agent Management

### 🟢 ✅ Default Agent

Work Agent automatically creates a **system default agent** that is always available:

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
**Used by**: `AgentsContext.tsx`, agent selector, workspace views

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "agent-id",
      "slug": "work-agent",
      "name": "Work Agent",
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

**Used by**: `AgentsContext.tsx`, agent selector, workspace views

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

**Error** (if agent is referenced by workspaces):
```json
{
  "success": false,
  "error": "Cannot delete agent 'work-agent' - it is referenced by workspaces: my-workspace"
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

## Tool Management

### List All Tools
```http
GET /tools
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

**Used by**: Tool management view

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

**Used by**: Agent editor, tool management

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

**Used by**: Agent editor, tool management

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

### Get Q Developer Agents
```http
GET /q-agents
```

Returns Q Developer CLI agents from `~/.aws/amazonq/cli-agents.json`.

**Response**:
```json
{
  "success": true,
  "agents": [
    {
      "name": "Q Agent",
      "description": "...",
      ...
    }
  ]
}
```

**Used by**: Q Developer integration features

---

## Workspace Management

### List All Workspaces
```http
GET /workspaces
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "My Workspace",
      "slug": "my-workspace",
      "icon": "💼",
      "description": "Workspace description",
      "tabs": [
        {
          "id": "main",
          "label": "Main",
          "component": "work-agent-dashboard"
        }
      ],
      "globalPrompts": []
    }
  ]
}
```

**Used by**: `WorkspacesContext.tsx`, workspace selector

---

### Get Workspace
```http
GET /workspaces/:slug
```

**Response**:
```json
{
  "success": true,
  "data": { /* workspace config */ }
}
```

**Used by**: `WorkspacesContext.tsx`, workspace view

---

### Create Workspace
```http
POST /workspaces
```

**Request Body**:
```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "icon": "💼",
  "description": "Workspace description",
  "tabs": [
    {
      "id": "main",
      "label": "Main",
      "component": "work-agent-dashboard",
      "prompts": [
        {
          "id": "daily-standup",
          "label": "Daily Standup",
          "prompt": "Generate my daily standup update",
          "agent": "work-agent"
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
  "data": { /* created workspace */ }
}
```

**Used by**: `WorkspacesContext.tsx`, workspace editor

---

### Update Workspace
```http
PUT /workspaces/:slug
```

**Request Body**: Partial workspace configuration

**Response**:
```json
{
  "success": true,
  "data": { /* updated workspace */ }
}
```

**Used by**: `WorkspacesContext.tsx`, workspace editor

---

### Delete Workspace
```http
DELETE /workspaces/:slug
```

**Response**:
```json
{
  "success": true
}
```

**Used by**: `WorkspacesContext.tsx`, workspace management

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
      "path": ".work-agent/agents/work-agent/workflows/example-simple.ts"
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
    "content": "import { andThen } from '@voltagent/core';\n\nexport default andThen(() => 'Hello');"
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
  "content": "import { andThen } from '@voltagent/core';\n\nexport default andThen(() => 'Hello');"
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
      "userId": "agent:work-agent:user:default",
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
      "work-agent": {
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
        "slug": "work-agent",
        "name": "Work Agent",
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
        "agentSlug": "work-agent",
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
      "agentSlug": "work-agent",
      "conversationId": "conv-123",
      "messageCount": 1
    }
  ]
}
```

**Response** (streaming SSE):
```
data: {"type":"connected","timestamp":"2025-12-08T12:00:00Z"}

data: {"type":"message","agentSlug":"work-agent","conversationId":"conv-123"}

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
- `stallion-workspace/CRM.tsx` (activity description generation)
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

### Transform Invocation (Tool + Transform)
```http
POST /agents/:slug/invoke/transform
```

Execute a tool and apply a JavaScript transformation function.

**Request Body**:
```json
{
  "toolName": "files_list_directory",
  "toolArgs": {
    "path": "/home/user/documents"
  },
  "transform": "(data) => data.files.map(f => ({ name: f.name, size: f.size }))"
}
```

**Response**:
```json
{
  "success": true,
  "response": [
    { "title": "Meeting", "start": "2025-12-08T10:00:00Z" }
  ],
  "debug": {
    "toolDuration": 150.5,
    "transformDuration": 2.1,
    "totalDuration": 155.8
  }
}
```

**Used by**: Stallion workspace, custom data transformations

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
| `WorkspacesContext` | `/workspaces`, `/workspaces/:slug` (GET/POST/PUT/DELETE) |
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

- **ChatDock**: Uses VoltAgent's built-in streaming endpoints
- **Stallion Workspace**: `/agents/:slug/invoke/transform`, `/agents/:slug/tools/:toolName`
- **Agent Editor**: Tool management endpoints
- **Settings View**: Configuration endpoints

---

## VoltAgent Built-in Endpoints

The following endpoints are provided by `@voltagent/server-hono` and documented in Swagger UI at `http://localhost:3141/ui`:

### 🔵 Core Agent Endpoints
- `GET /agents` - List all agents (basic info)
- `GET /agents/:id` - Get agent by ID
- `POST /agents/:id/text` - Generate text response
- `POST /agents/:id/stream` - Stream text response (raw SSE)
- `POST /agents/:id/chat` - Stream text response (AI SDK format)
- `POST /agents/:id/object` - Generate structured object
- `POST /agents/:id/stream-object` - Stream structured object

### 🔵 Workflow Endpoints
- `GET /workflows` - List all workflows
- `GET /workflows/:id` - Get workflow by ID
- `POST /workflows/:id/execute` - Execute workflow
- `POST /workflows/:id/stream` - Stream workflow execution
- Additional workflow management endpoints

### 🔵 Request Options

All VoltAgent generation endpoints support these options:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `userId` | string | - | User ID for tracking |
| `conversationId` | string | - | Conversation ID for context |
| `contextLimit` | number | 10 | Message history limit |
| `maxSteps` | number | - | Max iteration steps (for tool use) |
| `temperature` | number | 0.7 | Randomness (0-1) |
| `maxOutputTokens` | number | 4000 | Max tokens to generate |
| `topP` | number | 1.0 | Nucleus sampling (0-1) |
| `frequencyPenalty` | number | 0.0 | Repeat penalty (0-2) |
| `presencePenalty` | number | 0.0 | New topic penalty (0-2) |
| `seed` | number | - | For reproducible results |
| `stopSequences` | string[] | - | Stop generation sequences |
| `providerOptions` | object | - | Provider-specific options |
| `context` | object | - | Dynamic agent context |
| `experimental_output` | object | - | Structured output with tool calling |

See [VoltAgent API Documentation](https://voltagent.dev/docs/api/endpoints/agents) for complete details.

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

When authentication is configured, custom routes inherit the same authentication behavior as VoltAgent's built-in routes. See [VoltAgent Authentication](https://voltagent.dev/docs/api/authentication) for details.

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
