# Executive Summary

## What KiRoom Is

KiRoom is a local workspace where multiple AI agents (via kiro-cli) work alongside you simultaneously, organized into **rooms** and **threads**. It exposes MCP tools that let agents interact with the server and collaborate with you. The entire thing runs locally — SQLite database, file-based storage, Express server, React client.

The key insight: KiRoom treats agent conversations as a **first-class collaborative workspace**, not just a chat interface. Rooms are projects, threads are workstreams, and the system learns from your feedback to improve over time.

## Architecture Comparison

| Concept | KiRoom | Stallion |
|---------|--------|----------|
| Organization | Rooms → Threads → Messages | Projects → Layouts → Conversations |
| Agent Sessions | ACP with persistent sessions, resume, sub-agents | ACP bridge (less mature) |
| Storage | SQLite + filesystem (notes, files, output) | JSON files + filesystem |
| Real-time | WebSocket (granular event types) | SSE streaming |
| Analytics | Rating-driven feedback loop + template proposals | Monitoring-based metrics |
| File Management | Room files + thread files + versioned docs | Knowledge/embedding focused |
| Search | Cross-room regex with URL filters | Basic |
| Plugin System | MCP tools (agents extend via MCP) | SDK plugin system (layouts, providers) |

## Priority Matrix

### 🔴 High Priority — Adopt These

| Feature | Why | Effort | Doc |
|---------|-----|--------|-----|
| **Insights & Feedback Loop** | KiRoom's rating → analysis → prompt injection cycle is genuinely novel. Stallion's insights are just monitoring metrics. This is the biggest UX differentiator. | Medium | [02](./02-insights-feedback.md) |
| **ACP Session Management** | KiRoom's ACP is battle-tested: persistent sessions, tool approvals, sub-agents, context compaction, session culling. Stallion's bridge exists but has gaps. | Large | [03](./03-acp-integration.md) |
| **Threading Model** | Multiple threads per project with forking, family trees, and per-message agent/model switching. Transforms the conversation experience. | Large | [01](./01-threading-model.md) |

### 🟡 Medium Priority — Strong Enhancements

| Feature | Why | Effort | Doc |
|---------|-----|--------|-----|
| **Search & Filtering** | Cross-project search with regex, URL-based filters, locked filters. Makes finding past work trivial. | Medium | [04](./04-search-navigation.md) |
| **Queue & Dispatch** | Queue messages while agent is working. Countdown, pause, retry. Eliminates "wait for agent to finish" friction. | Medium | [06](./06-queue-dispatch.md) |
| **Notes System** | Per-project and per-conversation scratchpads, auto-injected into agent context. Simple but high-value. | Small | [05](./05-files-notes.md) |
| **File Management** | Thread-scoped files, room-scoped files, versioned doc collaboration with inline comments. | Medium | [05](./05-files-notes.md) |

### 🟢 Lower Priority — Polish & Refinement

| Feature | Why | Effort | Doc |
|---------|-----|--------|-----|
| **Settings Depth** | Per-room/thread sticky settings, trusted tools management, auto-configure agents. Lots of good UX ideas. | Small-Medium | [07](./07-settings-preferences.md) |
| **Unread Tracking** | Server-authoritative badge counts, HUD indicators, waiting detection. | Small | [04](./04-search-navigation.md) |
| **Deep Links** | Full URL-based navigation with browser history, dynamic page titles, favicon state. | Small | [04](./04-search-navigation.md) |

## Recommended Adoption Order

### Phase 1: The Learning Loop (Insights + Feedback)
Start here because it's the most differentiated feature and doesn't require restructuring Stallion's core data model. Add message ratings, automated analysis, and prompt injection. This alone makes Stallion meaningfully smarter over time.

### Phase 2: Threading & Conversations
Evolve Stallion's flat conversation model into a threaded one. This is the biggest architectural change but unlocks forking, family trees, and per-message settings. Consider whether Stallion's project/layout model maps to KiRoom's room/thread model or if a hybrid is better.

### Phase 3: ACP Hardening
Take KiRoom's battle-tested patterns and apply them to Stallion's ACP bridge: persistent sessions with resume, tool approval UI, sub-agent management, context compaction handling, session culling.

### Phase 4: Search, Queue, Notes
Layer on the productivity features: cross-project search with URL filters, message queuing, and the notes system. These are relatively independent and can be built in parallel.

## Key Design Decisions to Make

1. **Room ↔ Project mapping**: KiRoom rooms ≈ Stallion projects, but Stallion has layouts within projects. Do threads live at the project level or layout level?

2. **SQLite vs JSON**: KiRoom uses SQLite for everything (fast queries, transactions, search). Stallion uses JSON files. The threading/search features strongly benefit from a database. Consider migrating.

3. **WebSocket vs SSE**: KiRoom uses WebSocket for bidirectional real-time updates (40+ event types). Stallion uses SSE (server → client only). The queue system and tool approvals need bidirectional communication.

4. **MCP tools vs SDK hooks**: KiRoom extends via MCP tools (agents call into KiRoom). Stallion extends via SDK hooks (plugins render UI). These are complementary — Stallion could have both.

5. **Single-agent vs multi-agent**: KiRoom is built for multiple agents running simultaneously across threads. Stallion is currently more single-agent focused. The threading model enables multi-agent naturally.
