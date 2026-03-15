# ACP Integration

## Priority: 🔴 High

## What KiRoom Built

KiRoom has the most complete ACP integration I've seen. It's not just "connect to kiro-cli" — it's a full session lifecycle manager with recovery, culling, sub-agents, and tool approval UX.

### ACP Session Manager (`acp-session-manager.ts`)

Each Chat v2 thread gets one `AcpSessionManager` instance that:

- **Spawns kiro-cli acp** as a subprocess with JSON-RPC 2.0 over stdin/stdout
- **Manages session lifecycle**: `session/new` → `prompt/send` → `session/load` (resume)
- **Handles MCP readiness**: Count-based resolution (waits for all MCP servers to initialize before first prompt)
- **Emits typed events**: `agent_message_chunk`, `tool_call`, `tool_call_update`, `request_permission`, `turn_end`, `metadata`, `mcp_server_ready`, `mcp_all_ready`, `error`, `close`
- **Supports model fallback**: For older kiro-cli versions that don't support `--model`, applies model via `setModel` JSON-RPC after init

### Session Persistence & Resume

- Sessions persist across messages — the kiro-cli process stays alive
- On reply, `session/load` resumes the existing session (no re-init)
- Session IDs stored in the thread record (`acpSessionId`)
- If resume fails, retries up to 3 times, then falls back to fresh session
- Session IDs survive server restarts

### Session Culling (`acp-session-cull.ts`)

Idle kiro-cli processes are automatically destroyed to save resources:
- **60 seconds** for unviewed threads (user never opened it)
- **5 minutes** for viewed threads (user saw it but moved on)
- Sessions resume transparently on next message via `session/load`

### Tool Approvals

Interactive approval UI for each tool call:
- **Allow Once** — approve this specific call
- **Allow for Session** — approve this tool for the rest of the session
- **Deny** — reject the call
- Session approvals tracked and displayed in a Session Bar
- `pending_approval` status wired into HUD, sidebar badges, search filters
- Queue pauses when approval is needed (replies queued, not sent directly)
- Pending approvals cancelled on crash/force-stop

### Tool Call Cards

Each tool call renders as a card showing:
- MCP server name, tool name, reason, arguments, elapsed time, output
- `strReplace` args render as side-by-side diff with word-level highlighting
- Shell commands show terminal-like output (stdout → stderr → exit status)
- Non-zero exit codes show "Failed" status in red
- In-progress calls marked as failed on error/crash

### Sub-Agent Manager (`sub-agent-manager.ts`)

When the parent agent calls `spawn_sub_agents`:
1. Creates sub-agent records in DB
2. Spawns a child ACP session per sub-agent (parallel)
3. Streams events to client via WebSocket
4. Writes result files when each sub-agent completes
5. Appends sub-agent output to parent session's Full Output

UI: Tabbed interface showing all sub-agents with status icons, live text streaming, inline tool call cards.

### Context Compaction

When kiro-cli compacts context to stay within token limits:
- Renders as a `SessionEventCard` in the UI
- System prompt is re-injected after compaction
- Context usage percentage shown in Session Bar (color-coded: green/orange/red)

### Interleaved Streaming

ACP messages stream as interleaved segments:
- `{ type: 'text', content: string }` — agent text
- `{ type: 'tool', toolCallId: string }` — tool call reference

These render inline — text and tool cards appear in the order the agent produces them, not in separate sections.

### Waiting Detection (`waiting-detector.ts`)

Detects when a kiro-cli process stops producing output (stale for 60+ seconds):
- Server-side polling checks output file mtime every 5 seconds
- Red "Waiting for m:ss" badge on the active message group
- HUD indicator: "Waiting: N" count in the top bar
- Sidebar badges per room
- Auto-clears when output resumes

### Session Event Cards

Visual indicators for session lifecycle events:
- Init/resume progress with MCP server checklist
- Status badges and elapsed timer
- Prompt retries recorded inline
- Context compaction events

## What Stallion Has Today

Stallion has an `ACPConnection` class in `acp-bridge.ts` that:

- Spawns kiro-cli acp as a subprocess
- Uses the `@agentclientprotocol/sdk` for the connection
- Handles `session/new`, `prompt/send`, `session/load`
- Translates ACP events to SSE streaming format
- Manages terminals, file operations
- Has an `ApprovalRegistry` for tool approvals
- Supports modes and slash commands

**Gaps compared to KiRoom:**

1. **No session culling** — idle processes stay alive indefinitely
2. **No sub-agent management** — no `spawn_sub_agents` support
3. **No interleaved streaming** — text and tool calls in separate sections
4. **No waiting detection** — no stale output monitoring
5. **No session event cards** — no visual lifecycle indicators
6. **No context compaction handling** — no re-injection after compaction
7. **No tool call persistence** — tool calls may not survive page reload
8. **No session history tracking** — no audit trail of sessions per thread
9. **Less robust error recovery** — KiRoom has 3-retry resume, automatic retry on transient errors

## Recommendation

### Phase 1: Session Lifecycle Hardening

1. **Session culling** — Add tiered timeouts (60s unviewed, 5m viewed). Destroy idle processes, resume on next message. Prevents resource leaks.

2. **Session resume retries** — Retry `session/load` up to 3 times before falling back to fresh session. Record retries for debugging.

3. **Waiting detection** — Poll output file mtime every 5 seconds. Broadcast waiting state to UI. Show "Waiting" badge in chat dock header.

### Phase 2: Tool Approval UX

1. **Persist tool calls** — Store tool calls so they survive page reload. KiRoom stores them in a `tool_calls` SQLite table.

2. **Session approvals tracking** — Track "Allow for Session" decisions. Display in a session info panel. Clear on new session.

3. **Pending approval status** — Wire `pending_approval` into conversation status. Queue replies when approval is pending.

### Phase 3: Sub-Agents & Interleaved Streaming

1. **Sub-agent support** — Implement `spawn_sub_agents` MCP tool. Spawn child ACP sessions. Stream events to UI with tabbed interface.

2. **Interleaved segments** — Store and render text + tool call segments in order. Significant UI change but makes the agent's work much more transparent.

3. **Context compaction** — Handle compaction events. Re-inject system prompt. Show context usage percentage.

### Stallion Mapping

| KiRoom Component | Stallion Equivalent | Gap |
|-----------------|-------------------|-----|
| `AcpSessionManager` | `ACPConnection` | Stallion's exists but less robust |
| `acp-session-cull.ts` | Nothing | Need to add session culling |
| `sub-agent-manager.ts` | Nothing | Need to add sub-agent support |
| `waiting-detector.ts` | Nothing | Need to add waiting detection |
| Tool call persistence | In-memory only? | Need persistent storage |
| Session approvals | `ApprovalRegistry` | Exists but may need enhancement |
| Interleaved segments | SSE streaming | Need segment-based rendering |
| Session event cards | Nothing | Need lifecycle visualization |

### Key Architecture Decision

KiRoom manages ACP sessions per-thread with one `AcpSessionManager` per thread. Stallion has one `ACPConnection` that appears more centralized. For multi-thread support, Stallion will need per-conversation session management — each conversation thread gets its own ACP session.

### Effort Estimate

- **Phase 1 (Lifecycle)**: Medium — 3-5 days. Session culling, resume retries, waiting detection.
- **Phase 2 (Tool Approvals)**: Medium — 3-5 days. Persistence, tracking, status integration.
- **Phase 3 (Sub-agents + Streaming)**: Large — 5-10 days. Sub-agent spawning, interleaved rendering, compaction.
