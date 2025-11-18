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
npm run dev:server

# Option 2: Start the React UI (development server on port 5173)
npm run dev:ui

# Option 3: Use the interactive CLI
npm run cli

# Option 4: Launch the Tauri desktop app
npm run dev:desktop
```

**Running Multiple Instances Side-by-Side:**

To test changes by running multiple instances simultaneously, use environment variables:

```bash
# Terminal 1: Original instance (default ports)
npm run dev:server
npm run dev:ui

# Terminal 2: Test instance (custom ports)
PORT=3142 npm run dev:server
VITE_API_BASE=http://localhost:3142 npm run dev:ui -- --port 5174
```

You can also override the backend URL at runtime through **Settings > Advanced > Backend API Base URL** in the UI.

The server will be available at:
- **HTTP API**: http://localhost:3141
- **Swagger UI**: http://localhost:3141/ui
- **VoltOps Console**: https://console.voltagent.dev
- **Desktop App**: Automatically opens when running `npm run dev:desktop`

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
  workspaces/
    <workspace-slug>/
      workspace.json                  # WorkspaceConfig
  workflows/
    states/                           # Workflow suspension states

src-server/                           # Backend (VoltAgent runtime)
  runtime/                            # VoltAgent integration
  adapters/                           # Storage adapters
  domain/                             # Configuration & types

src-ui/                               # Frontend (React + Tauri)
  src/
    App.tsx                           # Main UI component
    main.tsx                          # React entry point
  index.html                          # HTML entry point

src-desktop/                          # Tauri native app
  src/
    main.rs                           # Rust main
  tauri.conf.json                     # Tauri configuration

dist-server/                          # Built backend
dist-ui/                              # Built frontend
dist-desktop/                         # Built desktop app
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
    "mcpServers": ["files"],
    "available": ["*"]
  }
}
```

The agent will be automatically loaded when you start the server.

## 🖼️ Creating a Workspace

Workspaces define the UI experience and are separate from agents. Create `.work-agent/workspaces/my-workspace/workspace.json`:

```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "icon": "💼",
  "description": "Custom workspace for my tasks",
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
          "agent": "my-agent"
        }
      ]
    }
  ],
  "globalPrompts": [
    {
      "id": "summarize",
      "label": "Summarize",
      "prompt": "Summarize the current context",
      "agent": "my-agent"
    }
  ]
}
```

**Key Concepts:**
- **Agents** define AI behavior (prompts, models, tools)
- **Workspaces** define UI layout (tabs, components, quick prompts)
- Multiple workspaces can use the same agent
- Each prompt can specify which agent to use
- Workspaces support multiple tabs with different components

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
  -d '{"input": "Hello", "options": {}}'

# Chat with agent "my-other-agent"
curl -X POST http://localhost:3141/agents/my-other-agent/text \
  -H "Content-Type: application/json" \
  -d '{"input": "Help me code", "options": {}}'
```

## 🛠️ Management API

Work Agent provides REST APIs for managing agents, tools, workflows, and application settings programmatically.

### Agent Management

```bash
# List all agents
curl http://localhost:3141/agents

# Create a new agent
curl -X POST http://localhost:3141/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Agent",
    "prompt": "You are a helpful assistant specialized in documentation."
  }'

# Update an agent
curl -X PUT http://localhost:3141/agents/my-new-agent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Updated system instructions.",
    "model": "anthropic.claude-3-opus-20240229-v1:0"
  }'

# Delete an agent
curl -X DELETE http://localhost:3141/agents/my-new-agent
```

### Tool Configuration

```bash
# List available tools
curl http://localhost:3141/tools

# Add a tool to an agent
curl -X POST http://localhost:3141/agents/work-agent/tools \
  -H "Content-Type: application/json" \
  -d '{"toolId": "filesystem"}'

# Remove a tool from an agent
curl -X DELETE http://localhost:3141/agents/work-agent/tools/filesystem

# Update tool allow-list
curl -X PUT http://localhost:3141/agents/work-agent/tools/allowed \
  -H "Content-Type: application/json" \
  -d '{"allowed": ["read_file", "write_file"]}'

# Update tool aliases
curl -X PUT http://localhost:3141/agents/work-agent/tools/aliases \
  -H "Content-Type: application/json" \
  -d '{"aliases": {"read": "filesystem_read_file"}}'
```

### Workflow Management

```bash
# List workflow files for an agent
curl http://localhost:3141/agents/work-agent/workflows/files

# Get workflow file content
curl http://localhost:3141/agents/work-agent/workflows/daily-summary.ts

# Create a new workflow
curl -X POST http://localhost:3141/agents/work-agent/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "new-workflow.ts",
    "content": "import { andThen } from \"@voltagent/core\";\n\nexport default andThen(() => \"Hello\");"
  }'

# Update workflow content
curl -X PUT http://localhost:3141/agents/work-agent/workflows/new-workflow.ts \
  -H "Content-Type: application/json" \
  -d '{"content": "// Updated workflow code"}'

# Delete a workflow
curl -X DELETE http://localhost:3141/agents/work-agent/workflows/new-workflow.ts
```

### Application Settings

```bash
# Get current app configuration
curl http://localhost:3141/config/app

# Update app configuration
curl -X PUT http://localhost:3141/config/app \
  -H "Content-Type: application/json" \
  -d '{
    "region": "us-west-2",
    "defaultModel": "anthropic.claude-3-haiku-20240307-v1:0"
  }'
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
npm run dev:server

# Start Tauri desktop app in another terminal
npm run dev:desktop
```

**Building:**
```bash
# Build standalone desktop app
npm run build:desktop
```

The build process uses **esbuild** to bundle the Node.js server into a single executable file, eliminating the need to ship `node_modules`. The bundled server is automatically included in the Tauri application and spawned on startup.

**Creating Releases:**

The project uses GitHub Actions for automated cross-platform releases:

```bash
# Create and push a version tag to trigger release workflow
git tag v1.0.0
git push origin v1.0.0
```

This builds installers for:
- **macOS** (Apple Silicon + Intel)
- **Linux** (Ubuntu 22.04+, .deb and .AppImage)
- **Windows** (64-bit installer)

The workflow creates a draft release in GitHub with all platform binaries attached. Review and publish the draft to make it available.

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
    mcpServers: string[];        // MCP server IDs to load
    available?: string[];        // Tools agent can invoke (supports wildcards, defaults to ["*"])
    autoApprove?: string[];      // Tools that execute without user confirmation in chat mode
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

**Tool Configuration:**

- **`mcpServers`**: List of MCP server IDs to load from the tool catalog (`.work-agent/tools/`)
- **`available`**: Filters which tools the agent can invoke. Supports wildcards (e.g., `["sat-outlook_*", "sat-sfdc_query"]`). Defaults to `["*"]` (all tools).
- **`autoApprove`**: Tools that execute automatically without user confirmation in chat mode. Supports wildcards. Tools not in this list will require user approval before execution. Silent invocations (via `/agents/:slug/invoke`) bypass approval checks.
- **`aliases`**: Map custom names to tool IDs for easier invocation

Example `tools` block:

```json
"tools": {
  "mcpServers": ["sat-outlook", "sat-sfdc", "aws-knowledge-mcp-server"],
  "available": ["sat-outlook_*", "sat-sfdc_query", "sat-sfdc_get_*"],
  "autoApprove": ["sat-outlook_calendar_view", "sat-outlook_email_read", "sat-sfdc_query"]
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

[code-reviewer] > Review the code in src-server/index.ts
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

# Development (with auto-reload)
npm run dev:server    # Start backend server
npm run dev:ui        # Start React UI
npm run dev:desktop   # Start Tauri desktop app

# Building
npm run build:server  # Build backend only
npm run build:ui      # Build frontend only
npm run build:desktop # Build desktop app
npm run build         # Build server + UI

# Production
npm run start:server  # Run built backend
npm run start:ui      # Serve built frontend

# Utilities
npm run cli           # Interactive CLI
npm run test          # Run tests
npm run clean         # Remove build artifacts
```

## 🔄 Migrating from Agent UI Metadata to Workspaces

If you have existing agents with UI metadata (the old `ui` field in `agent.json`), you can migrate them to the new workspace model:

```bash
# Run the migration script
npx tsx scripts/migrate-agents-to-workspaces.ts
```

The script will:
1. Create a backup of all modified files in `.work-agent/backup-<timestamp>/`
2. Scan all agents for UI metadata (`ui.component`, `ui.quickPrompts`, `ui.workflowShortcuts`)
3. Generate a workspace configuration for each agent with UI metadata
4. Remove the `ui` field from agent.json files

**Manual Migration:**

If you prefer to migrate manually:

1. Create a workspace directory: `.work-agent/workspaces/my-workspace/`
2. Create `workspace.json` with tabs and prompts
3. Reference your agent in prompt definitions: `"agent": "my-agent"`
4. Remove the `ui` field from your `agent.json`

**Rollback:**

If you need to rollback, restore files from the backup directory created by the migration script.

## 🔌 Plugin Development

Work Agent uses a plugin architecture that separates custom workspaces from the core application. Plugins are distributed as npm packages and automatically discovered at runtime.

### Quick Start

```bash
# Install a plugin from local directory
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace

# Or install from examples directory
npx tsx scripts/cli-plugin.ts install ./examples/minimal-workspace

# List installed plugins
npx tsx scripts/cli-plugin.ts list

# Remove a plugin
npx tsx scripts/cli-plugin.ts remove stallion-workspace
```

### Creating a Plugin

1. **Create plugin structure:**

```bash
mkdir my-workspace
cd my-workspace
npm init -y
```

2. **Add plugin manifest (`plugin.json`):**

```json
{
  "name": "my-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "My Workspace",
  "entrypoint": "./index.tsx",
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"]
}
```

3. **Create component (`src/index.tsx`):**

```typescript
import { useAgents, useNavigation, useToast } from '@stallion-ai/sdk';
import type { WorkspaceComponentProps } from '@stallion-ai/sdk';

export default function MyWorkspace({ workspace }: WorkspaceComponentProps) {
  const agents = useAgents();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

  return (
    <div>
      <h1>{workspace?.name}</h1>
      <button onClick={() => setDockState(true)}>Open Chat</button>
    </div>
  );
}
```

4. **Build and install:**

```bash
npm run build
npm link
cd ../work-agent
npm link my-workspace
```

### SDK API

Plugins access core functionality via `@stallion-ai/sdk`:

```typescript
import {
  // Contexts
  useAgents,           // List all agents
  useWorkspaces,       // List all workspaces
  useConversations,    // Get conversation history
  useModels,           // Available models
  
  // Chat operations
  useCreateChatSession,  // Create new chat
  useSendMessage,        // Send message to agent
  
  // Navigation
  useNavigation,       // Control dock, navigate views
  useToast,            // Show notifications
  
  // Slash commands
  useSlashCommandHandler,  // Handle slash commands
  
  // Types
  WorkspaceComponentProps,
  AgentSummary,
  Message,
} from '@stallion-ai/sdk';
```

### Plugin Installation

Plugins are installed using the CLI tool:

```bash
# Install from local directory
npx tsx scripts/cli-plugin.ts install ./examples/stallion-workspace

# The CLI automatically:
# - Copies plugin files to .work-agent/plugins/
# - Installs agent definitions to .work-agent/agents/
# - Installs workspace configs to .work-agent/workspaces/
# - Copies UI components to src-ui/src/workspaces/
```

### Documentation

- **[Plugin Architecture](./PLUGIN_ARCHITECTURE.md)** - Complete plugin system documentation
- **[Example Plugins](./examples/)** - Stallion workspace and minimal workspace examples
- **[Agent Development Guide](./AGENTS.md)** - Component patterns and best practices

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
- **Plugin Architecture**: [PLUGIN_ARCHITECTURE.md](./PLUGIN_ARCHITECTURE.md)

## 🤝 Contributing

Contributions welcome! This is a VoltAgent-first implementation demonstrating:
- Custom StorageAdapter (file-based NDJSON)
- Dynamic agent loading from configuration files
- MCP lifecycle management
- Agent switching without server restarts
- Plugin architecture with npm-based distribution

## 📄 License

MIT
