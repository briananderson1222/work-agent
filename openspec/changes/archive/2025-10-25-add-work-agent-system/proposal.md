# Work Agent System Proposal

## Why

Teams need a local-first, transparent way to manage AI agents for work tasks with full control over tools, memory, and observability. Current solutions either lock users into cloud services or lack the pluggable architecture needed for future scaling. This system provides a VoltAgent-native desktop app that runs entirely locally with file storage while maintaining clean adapter boundaries for future cloud integration.

## What Changes

This introduces a complete desktop application built on Tauri, VoltAgent, and Amazon Bedrock that enables:

- **Agent-centric workspace**: Define agents with system prompts, model configs, and tool access controls in `.work-agent/` directory structure
- **Local-first storage**: All configuration, memory, runs, and artifacts stored in files with adapters ready for DynamoDB/S3/AgentCore swaps
- **Tool orchestration**: MCP server lifecycle management with allow-lists, aliases, and permission enforcement
- **Session-based memory**: NDJSON append-only memory with per-agent sessions supporting clear/archive/delete operations
- **Run artifacts**: Every chat/workflow execution produces prompt, transcript, and VoltAgent debugger snapshot
- **Pluggable architecture**: Port-driven design with file adapters initially, clean seams for cloud adapters later
- **Agent switching**: Full context isolation with DRAIN → TEARDOWN → BUILD → READY lifecycle preventing tool leaks
- **VoltAgent debugger**: Primary observability showing prompts, tool I/O, timings, and execution flow
- **Workflow engine**: Minimal graph-based workflows (Prompt → Tool → Prompt) with same debugger visibility
- **Security defaults**: File system sandboxing, network permissions, allow-lists, and redaction patterns

New capabilities:
- agent-config (agents, tools, workflows)
- memory-management (sessions with NDJSON)
- run-execution (chat/workflow runs with artifacts)
- tool-orchestration (MCP + built-in lifecycle)
- observability (debugger integration)
- desktop-ui (Tauri-based interface)

## Impact

**Affected specs**: None (all new capabilities)

**Affected code**:
- New: `src/domain/types.ts` (AgentSpec, ToolDef, MemoryEvent, RunMeta)
- New: `src/ports/*` (ConfigPort, MemoryPort, RunsPort, ObservabilityPort)
- New: `src/adapters/file/*` (all file-based adapters)
- New: `src/plugins/*` (VoltAgent plugins for each concern)
- New: `src/mcp/*` (MCP server launcher and clients)
- New: `src/providers/bedrock.ts` (Bedrock via Vercel AI SDK)
- New: `src/ui/*` (React components for all screens)
- New: `schemas/*.schema.json` (JSON schemas for validation)
- New: `.work-agent/` directory structure (config, agents, tools, workflows)
- New: Tauri configuration and build scripts

**Dependencies**:
- Amazon Bedrock (external, inference only)
- @ai-sdk/amazon-bedrock (model provider)
- VoltAgent (runtime and debugger)
- Tauri (desktop shell)
- React (UI framework)

**Breaking changes**: None (new system)

**Migration**: None required (greenfield)
