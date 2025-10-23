# Implementation Tasks

**NOTE**: This implementation uses VoltAgent's built-in features (Agent, Memory, MCPConfiguration) instead of custom ports/plugins architecture. This is a more maintainable and VoltAgent-native approach.

## 1. Foundation

- [x] 1.1 Create project structure (src/, schemas/, .work-agent/)
- [x] 1.2 Initialize TypeScript project with Tauri
- [x] 1.3 Install dependencies (VoltAgent, @ai-sdk/amazon-bedrock, Tauri, React)
- [x] 1.4 Set up Tauri desktop app structure (UI makes HTTP calls to VoltAgent server)

## 2. JSON Schemas & Validation

- [x] 2.1 Write `schemas/agent.schema.json` (name, prompt, model, guardrails, tools)
- [x] 2.2 Write `schemas/tool.schema.json` (id, kind, displayName, transport, permissions, builtinPolicy)
- [x] 2.3 Write `schemas/app.schema.json` (region, defaultModel)
- [x] 2.4 Implement schema validator using JSON Schema library
- [ ] 2.5 Write unit tests for schema validation (valid/invalid cases)

## 3. Configuration Loading

- [x] 3.1 Implement `ConfigLoader` class to read app.json, agent.json, tool.json
- [x] 3.2 Add file watching for config changes (reload on external edits)
- [x] 3.3 Implement agent listing (scan `.work-agent/agents/` subdirectories)
- [x] 3.4 Implement tool catalog loading (scan `.work-agent/tools/`)
- [x] 3.5 Handle missing config files (create defaults on first run)
- [ ] 3.6 Write unit tests for config loading

## 4. Bedrock Provider Setup

- [x] 4.1 Initialize @ai-sdk/amazon-bedrock provider with region from app.json
- [x] 4.2 Configure default model from app.json
- [x] 4.3 Handle per-agent model overrides
- [x] 4.4 Implement credentials check (AWS SDK)
- [ ] 4.5 Write integration test (call Bedrock API)

## 5. File Memory Adapter

- [x] 5.1 Implement VoltAgent memory adapter interface (save, load, clear, list)
- [x] 5.2 Implement NDJSON append for `save(event)`
- [x] 5.3 Implement NDJSON line-by-line read for `load(sessionId, options)`
- [x] 5.4 Implement file truncate for `clear(sessionId)`
- [x] 5.5 Implement directory scan for `list()` (return session metadata)
- [x] 5.6 Ensure agent-scoped isolation (memory paths under `agents/<slug>/memory/`)
- [ ] 5.7 Write unit tests for memory adapter

## 6. VoltAgent Runtime Integration

- [x] 6.1 Implement WorkAgentRuntime class to manage VoltAgent lifecycle
- [x] 6.2 Create VoltAgent Agent instances from file-based configuration
- [x] 6.3 Implement agent switching (load on-demand, cache in memory)
- [x] 6.4 Integrate Bedrock provider with per-agent model configuration
- [x] 6.5 Set up VoltAgent HTTP server (honoServer on port 3141)
- [x] 6.6 Implement CLI interface for interactive agent switching
- [ ] 6.7 Write integration test (switch between two agents, verify isolation)

## 7. Tool Orchestration (VoltAgent MCPConfiguration)

- [x] 7.1 Load tool definitions from catalog (.work-agent/tools/)
- [x] 7.2 Create MCPConfiguration instances per agent
- [x] 7.3 Support stdio MCP transport (npx servers)
- [x] 7.4 Apply agent-level tool allow-lists from config
- [x] 7.5 Automatic MCP server lifecycle management
- [ ] 7.6 Support ws/tcp MCP transports
- [ ] 7.7 Register built-in tools (fs_read, fs_write, shell_exec) as VoltAgent tools
- [ ] 7.8 Implement MCP health checks (optional per tool)
- [ ] 7.9 Write integration test (spawn MCP server, discover tools, invoke via VoltAgent)

## 8. Tauri Desktop UI (Basic Implementation)

- [x] 8.1 Set up React app structure (src-ui/ with Vite)
- [x] 8.2 Configure Tauri v2 (src-tauri/ with Rust)
- [x] 8.3 Implement HTTP-based communication (React → VoltAgent server on localhost:3141)
- [x] 8.4 Create error display in chat interface
- [x] 8.5 Add loading states for message sending

## 9. Agent Picker UI (Basic Implementation)

- [x] 9.1 Implement agent list view in sidebar (fetch from /agents endpoint)
- [x] 9.2 Implement agent selection (click → switch agent, clear messages)
- [x] 9.3 Display agent name and prompt excerpt
- [ ] 9.4 Implement "New Agent" form (name, prompt, model, save to agent.json)
- [x] 9.5 Handle empty state (loading indicator)

## 10. Agent Overview UI (Deferred)

- [ ] 10.1 Display agent details (name, prompt excerpt, model, region, guardrails, tools)
- [ ] 10.2 Implement "Run Chat" button (navigate to Chat interface)
- [ ] 10.3 Implement "Edit Spec" form (update agent.json fields, save)
- [ ] 10.4 Display configured tools list with status indicators

## 11. Chat Interface (Basic Implementation)

- [x] 11.1 Implement chat panel (message list, input field)
- [x] 11.2 Implement message sending (HTTP POST to /agents/<slug>/text)
- [ ] 11.3 Display streaming response (currently using non-streaming endpoint)
- [ ] 11.4 Display tool call indicators (name, status: pending/success/error)
- [ ] 11.5 Integrate VoltAgent debugger drawer (VoltOps Console available externally)
- [ ] 11.6 Display debugger traces (prompts, tool I/O, timings, execution flow)
- [ ] 11.7 Implement prompt inspection (click trace → show full prompt)

## 12. Sessions UI (Deferred)

- [ ] 12.1 Implement sessions table (sessionId, last activity, file size)
- [ ] 12.2 Implement "Clear" button with confirmation (truncate NDJSON)
- [ ] 12.3 Implement "Delete" button with confirmation (remove file)
- [ ] 12.4 Implement bulk selection and "Delete Selected"
- [ ] 12.5 Update UI after clear/delete operations

## 13. Tools Configuration UI (Deferred)

- [ ] 13.1 Display global tool catalog (checkbox list)
- [ ] 13.2 Implement tool selection (check → add to agent's tools.use)
- [ ] 13.3 Implement allow-list editor (text input, save to tools.allowed)
- [ ] 13.4 Implement aliases editor (key-value pairs, save to tools.aliases)
- [ ] 13.5 Display MCP server status indicators (green/yellow/red)
- [ ] 13.6 Implement reconnect button for failed MCP servers
- [ ] 13.7 Save changes to agent.json on edit

## 14. Workflows UI (Deferred)

- [ ] 14.1 List workflows (scan agents/<slug>/workflows/, display name/timestamp)
- [ ] 14.2 Implement "New Workflow" editor (code or visual for VoltAgent workflow definitions)
- [ ] 14.3 Support VoltAgent workflow syntax (andThen, andAgent, andWhen, andAll, andRace)
- [ ] 14.4 Implement "Run Workflow" button (execute via VoltAgent runtime)
- [ ] 14.5 Display workflow results in chat interface with debugger traces
- [ ] 14.6 Save workflow to `.ts` or YAML file

## 15. Example Agent & Tools

- [x] 15.1 Create example agent: `.work-agent/agents/work-agent/agent.json`
- [x] 15.2 Create example tool: `.work-agent/tools/files/tool.json` (MCP files server)
- [ ] 15.3 Create example workflow: simple 3-step workflow using andThen
- [x] 15.4 Write README with setup instructions

## 16. Testing (Deferred)

- [ ] 16.1 Unit tests for config loading, schema validation
- [ ] 16.2 Unit tests for file memory adapter
- [ ] 16.3 Integration test: load agent → run chat → verify artifacts
- [ ] 16.4 Integration test: agent switch → verify isolation
- [ ] 16.5 Integration test: MCP tool invocation → verify allow-list enforcement
- [ ] 16.6 Integration test: workflow execution → verify VoltAgent traces
- [ ] 16.7 Manual test: full user flow (create agent, configure tools, chat, switch agents)

## 17. Packaging & Distribution (Deferred)

- [ ] 17.1 Configure Tauri for macOS build (.dmg)
- [ ] 17.2 Configure Tauri for Windows build (.exe)
- [ ] 17.3 Configure Tauri for Linux build (.AppImage)
- [ ] 17.4 Create app icon and branding assets
- [ ] 17.5 Test installers on each platform
- [ ] 17.6 Write installation and quick start guide

---

## Summary of Implementation Status

### ✅ Core Backend Complete (VoltAgent-First)
- VoltAgent runtime with Agent instances
- File-based memory (StorageAdapter implementation)
- MCP tool orchestration (MCPConfiguration)
- Bedrock provider integration
- Dynamic agent loading and switching
- HTTP server (honoServer) with REST API
- CLI interface

### ✅ Basic Desktop UI Complete
- Tauri v2 structure
- React frontend with agent picker
- Chat interface with message history
- HTTP communication with VoltAgent server

### ⏸️ Advanced Features Deferred
- Comprehensive testing suite
- Advanced UI screens (sessions, tools config, workflows editor)
- Streaming responses in UI
- Built-in tools (fs_read, fs_write, shell_exec)
- Packaging for distribution

### 📝 Architecture Note
The implementation successfully uses **VoltAgent's built-in capabilities** instead of reimplementing agent management, memory, and tool orchestration. This results in:
- Less custom code to maintain
- Better alignment with VoltAgent best practices
- Built-in debugger integration (VoltOps Console)
- Clean adapter pattern for future cloud storage swaps
