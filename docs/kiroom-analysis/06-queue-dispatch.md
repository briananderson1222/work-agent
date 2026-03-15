# Queue & Dispatch

## Priority: 🟡 Medium

## What KiRoom Built

### Server-Side Message Queue

KiRoom's `QueueDispatcher` manages a server-side queue for messages sent while an agent is still working:

**Core flow:**
1. User sends a message while agent is in_progress → message is queued (not sent)
2. Agent finishes successfully → 10-second countdown starts for next queued message
3. Countdown completes → queued message dispatched automatically
4. Agent finishes that message → next queued message countdown starts
5. Repeat until queue is empty

**Queue states per message:**
- `pending` — waiting to be dispatched
- `sending` — currently being dispatched
- `sent` — successfully dispatched
- `failed` — dispatch failed (user must retry manually)

### Countdown & Pause

- **10-second countdown** before dispatch (allows cancellation)
- **Send Now** — green button to bypass the timer
- **Pause on edit** — countdown automatically pauses when you start editing a queued message. Blue "Paused (Ns left)" badge shows frozen remaining time. Resumes after 2-second grace period once you stop typing.
- **Abandoned pause recovery** — if browser disconnects while paused, server auto-resumes after 60 seconds

### Failure Handling

- **Force stop** → all pending queued messages marked as failed (not auto-sent)
- **Agent error** → all pending queued messages marked as failed
- **Tool approval needed** → queue pauses (user must interact first)
- **Failed messages** are editable with Cancel button. Retry button appears only on the first failed message to preserve queue order.

### Crash Recovery

- Queued messages persist server-side in SQLite (`queued_messages` table)
- If server crashes, pending messages are marked as **failed** on restart (not auto-sent — safety first)
- Failed messages appear in the thread's queue UI with Retry and Cancel buttons
- `has_queued` and `has_failed_queue` columns on threads for fast HUD/sidebar badge queries
- On startup, `syncHasQueued()` and `syncHasFailedQueue()` reconcile flags with actual table state

### Real-Time Sync

Queue state syncs via WebSocket events:
- `queue:sync` — full queue state for a thread
- `queue:added` — new message queued
- `queue:updated` — message status changed
- `queue:removed` — message cancelled
- `queue:reordered` — queue order changed
- `queue:dispatch_started` — countdown started
- `queue:dispatch_complete` — dispatch finished (success/failure)

### UI

- Scrollable queue area below the compose box (max height, scroll to see all)
- Progress indicator: "Queued 1 of 3"
- Edit queued message content and settings before dispatch
- Reorder queued messages
- Auto-scroll to show agent output when queued message sends
- HUD: "Queued: N" and "Failed Queue: N" indicators in top bar
- Sidebar badges per room

### Optimistic Locking

Each queued message has a `version` field for optimistic locking. Concurrent edits (e.g., user editing while server is dispatching) are detected and handled gracefully. The `pausedRemainingMs` field tracks frozen countdown state for pause/resume.

## What Stallion Has Today

Stallion doesn't have a message queue system. If the user sends a message while the agent is working, the behavior depends on the conversation/streaming implementation — likely either blocked or creates a race condition.

## Recommendation

### What to Adopt

The full queue system is worth adopting. It eliminates the "wait for agent to finish" friction that plagues every chat-with-AI interface.

### Implementation Plan

**Phase 1: Basic Queue (Small-Medium effort)**

1. **Queue storage** — Add a `queued_messages` array/table per conversation. Each entry: `{ id, content, agent, model, status, queuePosition, createdAt }`.

2. **Queue on busy** — When user sends a message and conversation status is `streaming`/`processing`, queue it instead of sending.

3. **Auto-dispatch** — When agent finishes successfully, dispatch the next queued message after a short delay (10s countdown or configurable).

4. **Queue UI** — Show queued messages below the compose box. Allow edit, cancel, reorder.

**Phase 2: Robustness (Medium effort)**

5. **Countdown with pause** — 10-second countdown before dispatch. Pause on edit. Send Now button.

6. **Failure handling** — On agent error or force stop, mark all pending as failed. Show retry/cancel buttons.

7. **Crash recovery** — Persist queue to disk. On restart, mark pending as failed (don't auto-send).

8. **Real-time sync** — Broadcast queue state changes via SSE events.

### Stallion Mapping

| KiRoom Component | Stallion Location | Notes |
|-----------------|-------------------|-------|
| `QueueDispatcher` | New: `src-server/services/queue-service.ts` | Core queue logic |
| `queued-messages.ts` (storage) | Extend storage adapter or new store | Persist queue state |
| Queue WS events | SSE events | `queue:added`, `queue:dispatched`, etc. |
| Queue UI | `ChatDockBody.tsx` or new component | Below compose box |
| HUD badges | `Header.tsx` | "Queued: N" indicator |
| `has_queued` flag | Conversation metadata | Fast badge queries |

### Key Design Decision

KiRoom's queue is per-thread. In Stallion, it would be per-conversation. If Stallion adopts multi-threading, the queue naturally scopes to each thread. If staying single-conversation, the queue scopes to the active conversation.

### Effort Estimate

- **Phase 1 (Basic Queue)**: Small-Medium — 2-3 days. Storage, queue-on-busy, auto-dispatch, basic UI.
- **Phase 2 (Robustness)**: Medium — 2-3 days. Countdown, failure handling, crash recovery, real-time sync.
