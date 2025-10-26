# Work Agent System Design

## Context

Building a desktop application that adds configuration management and dynamic agent switching on top of VoltAgent's existing runtime. VoltAgent provides workflows, memory, debugger, and tool registry; we provide file-based config loading and agent context switching.

**Constraints**:
- Use VoltAgent's built-in features (workflows, memory, debugger, tool registry, MCP)
- Only Bedrock for inference
- Everything runs locally with file storage in `.work-agent/`
- Agent switching must rebuild VoltAgent context cleanly

## Goals / Non-Goals

**Goals**:
- Load agents/tools from `.work-agent/` files
- Dynamic agent switching at runtime
- File-based memory adapter for VoltAgent
- Bedrock as default provider
- Tauri desktop UI for agent/tool management

**Non-Goals**:
- Custom workflow engine (use VoltAgent's)
- Custom observability (use VoltAgent debugger)
- Custom tool registry (use VoltAgent's)
- Agent export/import (defer to later)
- Multi-user collaboration
- Cloud storage (file-only for now)

## Decisions

### 1. VoltAgent as Core Runtime

**Decision**: Leverage VoltAgent's built-in workflow engine, memory system, debugger, tool registry, and MCP support.

**Rationale**:
- Production-ready workflow orchestration
- Built-in observability with traces
- Memory adapters (we implement file-based)
- MCP connectivity already working
- Type-safe tool registry

**Custom layer**:
- Config loader (read agents/tools from files)
- Agent switching logic
- File memory adapter
- Bedrock provider setup
- UI

### 2. Agent-Centric File Structure

**Decision**: `.work-agent/agents/<slug>/agent.json` with VoltAgent writing to `memory/` and `workflows/` subdirectories.

**Rationale**:
- Simple, readable file structure
- Agent is primary organizing unit
- VoltAgent memory adapter writes to agent-specific paths
- Tools catalog is global with agent overrides

### 3. Dynamic Agent Switching

**Decision**: When switching agents, rebuild VoltAgent context (new agent instance, tools, memory, MCP connections).

**Rationale**:
- VoltAgent doesn't handle runtime agent swapping
- Need isolation between agent contexts
- Tool registry rebuilt per agent
- MCP servers are agent-specific

**Implementation**:
- Load new `agent.json`
- Create VoltAgent agent instance
- Register tools + MCP servers
- Point memory adapter to new agent directory
- UI updates

### 4. File Memory Adapter

**Decision**: Implement VoltAgent memory adapter interface with NDJSON backend.

**Rationale**:
- VoltAgent provides adapter interface
- NDJSON files in `agents/<slug>/memory/sessions/<id>.ndjson`
- Local-first, simple
- Can swap to VoltAgent's PostgreSQL/Supabase adapters later

### 5. Bedrock Provider

**Decision**: Configure VoltAgent with @ai-sdk/amazon-bedrock as default provider.

**Rationale**:
- VoltAgent supports Vercel AI SDK providers
- Region and model from `config/app.json`
- Agents can override model per agent

## Architecture

```
Tauri Desktop (React UI)
   │
   ├─ Agent Picker / Chat / Tools / Workflows UI
   │
   └─ VoltAgent Runtime
       ├─ Workflow Engine (built-in)
       ├─ Tool Registry (built-in)
       ├─ Memory System (built-in, file adapter)
       ├─ Debugger (built-in)
       └─ Custom Layer
           ├─ Config Loader (.work-agent/ → VoltAgent)
           ├─ Agent Switcher (rebuild context)
           ├─ File Memory Adapter (NDJSON)
           └─ Bedrock Setup (@ai-sdk/amazon-bedrock)
```

## Directory Layout

```
.work-agent/
  config/
    app.json              # region, defaultModel
  tools/                  # global tool catalog
    <tool-id>/
      tool.json           # ToolDef (MCP or built-in)
  agents/
    <agent-slug>/
      agent.json          # AgentSpec
      memory/
        sessions/
          <id>.ndjson     # VoltAgent memory adapter writes
      workflows/
        <id>.ts           # VoltAgent workflow definitions
```

## Core Data Models

**AgentSpec (agent.json)**:
```typescript
{
  name: string;
  prompt: string;               // system instructions
  model?: string;               // falls back to app.defaultModel
  region?: string;
  guardrails?: {
    maxTokens?: number;
    temperature?: number;
  };
  tools?: {
    use: string[];              // from catalog
    allowed?: string[];         // allow-list
    aliases?: Record<string,string>;
  };
}
```

**ToolDef (tools/<id>/tool.json)**:
```typescript
{
  id: string;
  kind: "mcp" | "builtin";
  displayName?: string;
  description?: string;
  // MCP: transport, command, args, endpoint, env
  // Built-in: builtinPolicy (fs_read, fs_write, shell_exec)
  permissions?: {
    filesystem?: boolean;
    network?: boolean;
    allowedPaths?: string[];
  };
}
```

**App Config (config/app.json)**:
```json
{
  "region": "us-east-1",
  "defaultModel": "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
```

## Implementation Scope

**Use VoltAgent Built-In**:
- Workflow orchestration (andThen, andAgent, andWhen, etc.)
- Memory system (implement file adapter)
- Tool registry & MCP lifecycle
- Debugger & observability
- Multi-agent coordination

**Implement Custom**:
- Config loader: Read `.work-agent/` files, validate with JSON schemas
- Agent switcher: Teardown/rebuild VoltAgent context on agent change
- File memory adapter: NDJSON backend for VoltAgent memory interface
- Bedrock setup: Initialize VoltAgent runtime with Bedrock provider
- Tauri UI: React app for agent/tool/workflow management

## Risks / Mitigations

**VoltAgent version changes**: Pin version, monitor releases, thin adapter layer

**File memory performance**: NDJSON append efficient, stream reads, swap to PostgreSQL later if needed

**Agent switch interruption**: UI shows "Switching..." status, wait for in-flight operations

## Open Questions

1. **Default timeout for agent switching**: 5 seconds (wait for in-flight operations)
