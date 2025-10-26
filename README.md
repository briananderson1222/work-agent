# Work Agent System

A **VoltAgent-native**, local-first AI work agent system with dynamic agent switching, file-based memory, and MCP tool integration.

## 🎯 Overview

Work Agent provides a desktop-ready system for managing multiple AI agents powered by Amazon Bedrock. Built on **VoltAgent**, it combines:

- **Agent-centric workspace**: Define agents with system prompts, models, tools, and guardrails in `.work-agent/` files
- **Dynamic agent switching**: Load and switch between agents at runtime without server restarts
- **Local-first storage**: File-based memory and configuration (swappable to cloud adapters later)
- **MCP tool orchestration**: Automatic MCP server lifecycle management with allow-lists
- **VoltAgent debugger**: Full observability via VoltOps Console
- **REST API + CLI**: HTTP endpoints for all agents plus interactive CLI

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- AWS credentials configured for Bedrock access
- Bedrock enabled in your AWS region

### Installation

```bash
# Clone and install
git clone https://github.com/briananderson1222/work-agent.git
cd work-agent
npm install
```

### AWS Credentials Setup

The system needs AWS credentials to access Amazon Bedrock. You have **three options**:

**Option 1: AWS CLI (Recommended)**
```bash
aws configure
# Enter your credentials and set region to us-east-1
```

**Option 2: Environment Variables**
```bash
cp .env.example .env
# Edit .env and add:
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your-key
# AWS_SECRET_ACCESS_KEY=your-secret
```

**Option 3: AWS Credentials File**
```bash
# Create ~/.aws/credentials with:
[default]
aws_access_key_id = your-key
aws_secret_access_key = your-secret
```

The system uses AWS SDK's credential chain, so any standard AWS credential method will work.

### Run the System

```bash
# Option 1: Start the HTTP server (VoltAgent server on port 3141)
npm run dev

# Option 2: Use the interactive CLI
npm run cli

# Option 3: Launch the Tauri desktop app
npm run tauri:dev
```

The server will be available at:
- **HTTP API**: http://localhost:3141
- **Swagger UI**: http://localhost:3141/ui
- **VoltOps Console**: https://console.voltagent.dev
- **Desktop App**: Automatically opens when running `npm run tauri:dev`

## 📁 Directory Structure

```
.work-agent/
  config/
    app.json                          # Global config (region, defaultModel)
  tools/                              # Global tool catalog
    <tool-id>/
      tool.json                       # ToolDef (MCP or built-in)
  agents/
    <agent-slug>/
      agent.json                      # AgentSpec
      memory/
        conversations/                # Conversation metadata
        sessions/                     # Message NDJSON files
        working/                      # Working memory (optional)
      workflows/                      # VoltAgent workflows (future)
  workflows/
    states/                           # Workflow suspension states

src/                                  # Backend (VoltAgent runtime)
  runtime/                            # VoltAgent integration
  adapters/                           # Storage adapters
  domain/                             # Configuration & types

src-ui/                               # Frontend (React + Tauri)
  src/
    App.tsx                           # Main UI component
    main.tsx                          # React entry point
  index.html                          # HTML entry point

src-tauri/                            # Tauri native app
  src/
    main.rs                           # Rust main
  tauri.conf.json                     # Tauri configuration
```

## 🤖 Creating an Agent

Create `.work-agent/agents/my-agent/agent.json`:

```json
{
  "name": "My Agent",
  "prompt": "You are a helpful assistant specialized in coding tasks.",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "guardrails": {
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "tools": {
    "use": ["files"],
    "allowed": ["*"]
  }
}
```

The agent will be automatically loaded when you start the server.

## 🛠️ Adding Tools

### MCP Tools

Create `.work-agent/tools/files/tool.json`:

```json
{
  "id": "files",
  "kind": "mcp",
  "displayName": "File System",
  "description": "Read and write files using MCP",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],
  "permissions": {
    "filesystem": true,
    "allowedPaths": ["./", "~/"]
  }
}
```

Reference the tool in your agent's `tools.use` array.

## 🔄 Agent Switching

Work Agent supports **dynamic agent switching** - no server restart needed:

### Via CLI

```bash
npm run cli

> /switch my-other-agent
Switched to agent: my-other-agent
```

### Via HTTP API

```bash
# Chat with agent "work-agent"
curl -X POST http://localhost:3141/agents/work-agent/text \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# Chat with agent "my-other-agent"
curl -X POST http://localhost:3141/agents/my-other-agent/text \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Help me code"}]}'
```

Each agent runs with isolated:
- Memory (separate conversation history)
- Tools (different MCP servers and permissions)
- Configuration (model, guardrails, prompts)

## 📝 Memory & Conversations

Work Agent uses a custom **VoltAgent StorageAdapter** with file-based NDJSON storage:

- **Conversations**: Metadata in `conversations/<id>.json`
- **Messages**: NDJSON in `sessions/<conversation-id>.ndjson`
- **Scoping**: Per-agent isolation via `userId` format: `agent:<slug>:user:<id>`

Memory is automatically managed by VoltAgent's Memory system.

## 🖥️ Desktop UI (Tauri)

Work Agent includes a **Tauri v2** desktop application with a React frontend:

**Features:**
- **Agent Switcher**: Select from available agents in the sidebar
- **Chat Interface**: Clean, responsive chat UI with message history
- **Real-time Communication**: Connects to VoltAgent HTTP server at localhost:3141
- **Native Feel**: Cross-platform desktop app (macOS, Windows, Linux)

**Development:**
```bash
# Start backend server in one terminal
npm run dev

# Start Tauri desktop app in another terminal
npm run tauri:dev
```

**Building:**
```bash
# Build standalone desktop app
npm run tauri:build
```

The Tauri app is a thin client that communicates with the VoltAgent server via REST API. All agent logic, memory, and tools run in the backend.

## 🏗️ Architecture

```
VoltAgent Runtime (Built-In)
├─ Agent instances (dynamically loaded)
├─ Memory system (custom file adapter)
├─ Tool registry (MCP + built-in)
├─ Workflow engine (VoltAgent)
└─ Hono HTTP server

Custom Layer (Work Agent)
├─ ConfigLoader (load agents/tools from files)
├─ WorkAgentRuntime (manages VoltAgent)
├─ FileVoltAgentMemoryAdapter (StorageAdapter impl)
└─ MCP lifecycle management
```

## 🔧 Configuration

### App Config (`.work-agent/config/app.json`)

```json
{
  "region": "us-east-1",
  "defaultModel": "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
```

### Agent Spec (`.work-agent/agents/<slug>/agent.json`)

```typescript
{
  name: string;              // Display name
  prompt: string;            // System instructions
  model?: string;            // Override defaultModel
  region?: string;           // Override region
  guardrails?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  };
  tools?: {
    use: string[];           // Tool IDs from catalog
    allowed?: string[];      // Allow-list (or ["*"] for all)
    aliases?: Record<string, string>;
  };
  ui?: {
    component?: string;      // React workspace component ID
    quickPrompts?: Array<{
      id: string;            // Internal identifier
      label: string;         // Button label
      prompt: string;        // Plain-text prompt content
    }>;
    workflowShortcuts?: string[]; // Workflow IDs to surface as quick actions
  };
}
```

Example `ui` block with quick prompts and curated workflow shortcuts:

```json
"ui": {
  "component": "work-agent-dashboard",
  "quickPrompts": [
    { "id": "triage", "label": "Daily Triage", "prompt": "Review open tickets and summarize blockers." },
    { "id": "standup", "label": "Standup Prep", "prompt": "Draft today's standup update from yesterday's notes." }
  ],
  "workflowShortcuts": ["example-simple.ts"]
}
```

### Tool Definition (`.work-agent/tools/<id>/tool.json`)

```typescript
{
  id: string;
  kind: "mcp" | "builtin";
  displayName?: string;
  description?: string;

  // MCP-specific
  transport?: "stdio" | "ws" | "tcp";
  command?: string;
  args?: string[];
  endpoint?: string;

  // Permissions
  permissions?: {
    filesystem?: boolean;
    network?: boolean;
    allowedPaths?: string[];
  };
}
```

## 🚦 Usage Examples

### Desktop Workspace Overview

The desktop UI now dedicates the main canvas to agent-specific workspaces while the chat experience lives in a collapsible bottom dock. Use the global agent selector to switch agents, launch quick prompts, or open curated workflows. Each conversation appears as a tab inside the dock so you can keep multiple agents or workflows active side-by-side.

Key elements:

- **Agent selector**: Dropdown in the top toolbar that exposes management shortcuts and quick actions defined in `agent.json`.
- **Workspace panel**: Renders the React component referenced by `ui.component`; the default `work-agent-dashboard` shows a mock calendar + detail view you can extend later.
- **Chat dock**: Collapsible bottom surface with tabbed sessions, unread badges, and toast notifications when activity arrives while collapsed.

Quick prompts and workflow shortcuts are configured directly in `agent.json` and surfaced in the toolbar for rapid execution.

### CLI Interactive Mode

```bash
npm run cli

[work-agent] > What files are in my current directory?
[Agent uses @files/list_directory MCP tool]

[work-agent] > /switch code-reviewer
Switched to agent: code-reviewer

[code-reviewer] > Review the code in src/index.ts
[Agent reads file and provides review]
```

### HTTP API

```bash
# Generate text
curl -X POST http://localhost:3141/agents/work-agent/text \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "userId": "user-123",
    "conversationId": "conv-1"
  }'

# Stream response (SSE)
curl -N http://localhost:3141/agents/work-agent/stream \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Tell me a story"}]}'
```

## 📊 Observability

Work Agent integrates with **VoltOps Console** for full observability:

1. Start your server: `npm run dev`
2. Open https://console.voltagent.dev
3. Find your agents and view:
   - Conversation history
   - Tool invocations
   - Token usage
   - Execution traces

## 🧪 Development

```bash
# Install dependencies
npm install

# Run in watch mode
npm run dev

# Run CLI
npm run cli

# Build for production
npm run build
npm start

# Run tests
npm test
```

## 🏢 Production Deployment

For production, you can:

1. **Keep file-based** storage (simple, local)
2. **Swap to cloud adapters**: Implement VoltAgent's StorageAdapter with PostgreSQL, Supabase, or DynamoDB
3. **Deploy as serverless**: Use VoltAgent's serverless adapters for Cloudflare Workers or Netlify

The architecture supports clean adapter swaps without changing agent logic.

## 📚 Learn More

- **VoltAgent Docs**: https://voltagent.dev/docs/
- **Amazon Bedrock**: https://aws.amazon.com/bedrock/
- **Model Context Protocol**: https://modelcontextprotocol.io/

## 🤝 Contributing

Contributions welcome! This is a VoltAgent-first implementation demonstrating:
- Custom StorageAdapter (file-based NDJSON)
- Dynamic agent loading from configuration files
- MCP lifecycle management
- Agent switching without server restarts

## 📄 License

MIT
