# Threading & Conversations

## Priority: 🔴 High

## What KiRoom Built

### Data Model

KiRoom's threading model is the backbone of the entire system:

```
Room (project/topic)
├── Thread 0 (chat) — flat conversation
├── Thread 1 (chat_v2) — ACP-backed persistent session
├── Thread 2 (collab) — doc collaboration with inline comments
├── Thread 3 (chat_v2) — forked from Thread 1, message 5
│   └── Thread 5 — forked from Thread 3, message 2
└── Thread 4 (chat) — independent conversation
```

Key types from `shared/types.ts`:

- **Thread** — Has `threadType` (chat | collab | chat_v2), `threadName`, `labels`, `drawer`, `threadFamilyId`, parent references for forks, `acpSessionId`, `isWaiting`, `hasQueued`
- **Message** — Has `groupId` (groups user msg + agent responses), `rating`, `metadata` (agent, model, trustedTools per message), `forkedToThreads`
- **MessageGroup** — Groups consecutive messages from same sender with `startedAt`/`endedAt` timing

### Thread Types

1. **Chat (Legacy)** — One-shot kiro-cli spawns per message. No persistent session.
2. **Chat v2 (ACP)** — Persistent ACP session. Tool approvals, sub-agents, context compaction.
3. **Collab** — Split view: document preview + chat. Versioned markdown with inline comments.

### Forking

Any message (except the first) can be forked into a new thread:
- Fork dialog lets you choose target room, agent, model, thread type
- Forked threads inherit parent conversation context via MCP
- `threadFamilyId` links all related threads
- Family tree visualization shows the full fork graph with SVG connectors
- Fork indicators on messages show "N Children" badges

### Per-Message Settings

Each message can use different settings — you're not locked in:
- Agent, model, trusted tools, markdown, working directory
- Settings are sticky per room/thread but overridable per message
- Badges on messages show which agent/model/tools were used

### Thread Organization

- **Drawers** — Custom groups within a room (like filing cabinet drawers). Drag threads to drawer tabs.
- **Labels** — Cross-room tags with custom colors. Filter by label across all rooms.
- **Floors** — Groups of rooms in the sidebar. Collapsible, reorderable, color-coded.

### Message Groups & Timing

Messages are grouped by `groupId` for display:
- User message = own group
- Agent responses share a group
- Each group tracks `startedAt`/`endedAt` for elapsed timer display
- Timer ticks live during agent execution, shows final duration when done

## What Stallion Has Today

Stallion's conversation model is flat:

```
Project
├── Layout (Chat, Coding, etc.)
│   └── Conversation (one per agent session)
│       ├── User message
│       ├── Assistant message
│       └── ...
```

- **ConversationsContext** manages a `ConversationsStore` with `conversations`, `messages`, and `statuses` maps
- Conversations are per-agent — switching agents means switching conversations
- No forking, no family trees, no per-message agent switching
- No thread types — everything is a chat
- No message grouping or timing
- No labels, drawers, or organizational primitives beyond projects/layouts

## Recommendation

### What to Adopt

1. **Multi-thread per project** — Allow multiple conversation threads within a project. This is the foundation for everything else.

2. **Thread forking** — Fork any message into a new thread. Track parent/child relationships with `threadFamilyId`.

3. **Per-message metadata** — Store agent, model, and settings per message. Display badges showing what was used.

4. **Message groups with timing** — Group user + agent messages together. Track elapsed time per agent turn.

5. **Thread naming** — Let users name threads for easy identification.

### What to Skip (for now)

- **Drawers** — Stallion's project/layout hierarchy already provides organization. Drawers add complexity without clear mapping.
- **Floors** — Same reasoning. Stallion's sidebar already groups by project.
- **Collab thread type** — Interesting but niche. Stallion's knowledge/document system serves a different purpose.

### Stallion Mapping

| KiRoom Concept | Stallion Equivalent | Notes |
|----------------|-------------------|-------|
| Room | Project | 1:1 mapping |
| Thread | Conversation (enhanced) | Add multi-thread support |
| Floor | Project group (new) | Optional, low priority |
| Drawer | Layout? | Unclear mapping — skip for now |
| Label | Tag (new) | Cross-project thread tags |
| Message Group | Turn (new) | Group user + assistant messages |
| Thread Type | Conversation mode | chat vs acp vs collab |

### Architecture Considerations

**Storage**: KiRoom uses SQLite for threads/messages, which enables fast queries, search, and transactions. Stallion's JSON-file approach will struggle with multi-thread search and cross-project queries. Consider adding SQLite for conversation data.

**Real-time**: Thread status changes (in_progress, done, error, pending_approval) need real-time broadcast. KiRoom uses WebSocket with 40+ event types. Stallion's SSE can handle this but may need more granular event types.

**URL routing**: KiRoom encodes room/thread/message in the URL hash (`#KiRoom/roomId/roomName/threadIndex/messageIndex`). Stallion should encode project/thread in the URL for deep linking.

### Effort Estimate

- **Multi-thread support**: Large — requires data model changes, new UI components, storage migration
- **Forking**: Medium — builds on multi-thread, needs fork dialog and family tracking
- **Per-message metadata**: Small — extend existing message type, add badges
- **Message groups + timing**: Small — grouping logic + timer component
- **Thread naming**: Trivial — text field + storage
