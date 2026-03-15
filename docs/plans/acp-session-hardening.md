# Plan: ACP Session Management Hardening

## Goal
Fill every gap between Stallion's ACP bridge and KiRoom's battle-tested session lifecycle: culling, resume retries, waiting detection, crash recovery, and session event visualization. Make ACP sessions feel robust and self-healing.

## Current State (what works)
- `ACPConnection` in `src-server/services/acp-bridge.ts` — spawns kiro-cli, manages session lifecycle
- `ACPManager` — manages multiple connections, routes to correct connection by slug
- Session persistence: `sessionMap` tracks conversationId → acpSessionId, stored in adapter metadata
- Session resume: `findPreviousSessionId()` scans adapters for stored acpSessionId, `loadSession()` resumes
- Reconnect: `scheduleReconnect()` with `maxReconnectAttempts = 5` on process exit
- Tool approvals: `ApprovalRegistry` with timeout, `handlePermissionRequest` emits SSE events
- Compaction handling: `_kiro.dev/compaction/status` notification streamed as text
- Slash commands: `_kiro.dev/commands/execute` extension method
- MCP server tracking: `_kiro.dev/mcp/server_initialized` notification
- OAuth flow: `_kiro.dev/mcp/oauth_request` notification with clickable link

## Architecture Understanding

### How ACPConnection works
1. `start()` spawns `kiro-cli acp` as subprocess with stdio pipes
2. `ClientSideConnection` from `@agentclientprotocol/sdk` wraps the JSON-RPC stream
3. `initialize()` → `newSession()` (or `loadSession()` for resume)
4. `handleChat()` sets `activeWriter` (SSE callback), calls `connection.prompt()`
5. ACP events arrive via `createClient()` callbacks → `handleSessionUpdate()` translates to SSE
6. `handlePermissionRequest()` blocks on `ApprovalRegistry.register()` until user responds via REST

### Key state per connection
- `proc: ChildProcess` — the kiro-cli process
- `connection: ClientSideConnection` — the ACP protocol wrapper
- `sessionId: string` — current ACP session
- `activeWriter` — SSE writer during active prompt (null between prompts)
- `sessionMap` — conversationId → acpSessionId for resume
- `terminals` — managed terminal processes
- `status` — disconnected/connecting/connected/error/unavailable

### How the UI receives ACP events
SSE events flow: `ACPConnection.handleSessionUpdate()` → `activeWriter()` → SSE stream → `useStreamingMessage` hook → handler chain (`TextDeltaHandler`, `ToolApprovalHandler`, `ToolLifecycleHandler`, `ReasoningHandler`, `StepHandler`) → React state updates.

New event types need: (1) server emits via `activeWriter`, (2) new handler class extending `StreamEventHandler`, (3) register in `useStreamingMessage.ts` handlers array.

## Gaps & Fixes

### Gap 1: No Session Culling — idle processes leak resources
**KiRoom behavior:** Tiered timeouts — 60s for unviewed threads, 5min for viewed. Processes killed, sessions resume transparently on next message.

**Files to modify:**
- `src-server/services/acp-bridge.ts` — `ACPConnection` class + `ACPManager` class

**Implementation:**

Add to `ACPConnection`:
```typescript
private lastActivityAt: number = Date.now();
private hasBeenViewed: boolean = false;

// Called at start of handleChat()
private touchActivity(): void {
  this.lastActivityAt = Date.now();
  this.hasBeenViewed = true;
}

// Called from ACPManager sweep
isIdle(): boolean {
  if (this.status !== 'connected') return false;
  if (this.activeWriter) return false; // actively streaming — never cull
  const elapsed = Date.now() - this.lastActivityAt;
  const timeout = this.hasBeenViewed ? 5 * 60_000 : 60_000;
  return elapsed > timeout;
}

async cullSession(): Promise<void> {
  this.logger.info(`[ACP:${this.prefix}] Culling idle session`, {
    sessionId: this.sessionId,
    idleMs: Date.now() - this.lastActivityAt,
    viewed: this.hasBeenViewed,
  });
  // Don't use scheduleReconnect — we'll reconnect on demand
  this.shuttingDown = false; // allow restart later
  this.cleanup();
  this.status = 'disconnected';
  // Keep sessionMap intact so resume works on next handleChat
  this.eventBus?.emit('acp:status', { id: this.config.id, status: 'culled' });
}
```

Add `touchActivity()` call at the top of `handleChat()`.

Also update `handleSessionUpdate()` to touch activity on any event (agent is producing output = not idle):
```typescript
// At the top of handleSessionUpdate:
this.lastActivityAt = Date.now();
```

Add to `ACPManager`:
```typescript
private cullTimer: ReturnType<typeof setInterval> | null = null;

// In constructor or startAll():
this.cullTimer = setInterval(() => this.sweepIdleSessions(), 30_000);

// In shutdown():
if (this.cullTimer) { clearInterval(this.cullTimer); this.cullTimer = null; }

private async sweepIdleSessions(): Promise<void> {
  for (const [id, conn] of this.connections) {
    if (conn.isIdle()) {
      await conn.cullSession();
    }
  }
}
```

**Stallion improvement over KiRoom:** KiRoom's culling is per-thread. Stallion's is per-connection, which is simpler but means a single connection serves all conversations for that CLI instance. When culled, ALL conversations on that connection lose their live process — but resume works per-conversation via `findPreviousSessionId()`. This is actually fine because kiro-cli sessions are cheap to resume.

**Auto-restart on demand:** When `handleChat()` is called on a disconnected (culled) connection, it needs to auto-restart:
```typescript
// At the top of handleChat(), before the connection check:
if (this.status === 'disconnected' && !this.shuttingDown) {
  this.logger.info(`[ACP:${this.prefix}] Auto-restarting culled session`);
  const started = await this.start();
  if (!started) {
    return c.json({ success: false, error: 'ACP failed to restart' }, 503);
  }
}
```

### Gap 2: No Resume Retries — single attempt, then fresh session
**KiRoom behavior:** 3 retries with backoff before falling back to fresh session. Retries recorded inline as session events.

**File:** `src-server/services/acp-bridge.ts` — `ACPConnection.start()` around line 330

**Current code (simplified):**
```typescript
if (previousSessionId && initResult.agentCapabilities?.loadSession) {
  try {
    await this.connection.loadSession({ sessionId: previousSessionId, ... });
  } catch (err) {
    sessionResult = await this.connection.newSession({ ... });
  }
}
```

**Fix:** Retry loop with exponential backoff:
```typescript
if (previousSessionId && initResult.agentCapabilities?.loadSession) {
  const delays = [500, 1000, 2000]; // 3 retries
  let resumed = false;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      await this.connection.loadSession({
        sessionId: previousSessionId, cwd: this.cwd, mcpServers: [],
      });
      sessionResult = { sessionId: previousSessionId };
      this.logger.info('[ACPBridge] Resumed session', {
        sessionId: previousSessionId, attempt: attempt + 1,
      });
      resumed = true;
      break;
    } catch (err: any) {
      this.logger.warn('[ACPBridge] Resume attempt failed', {
        attempt: attempt + 1, maxAttempts: delays.length, error: err.message,
      });
      if (attempt < delays.length - 1) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  if (!resumed) {
    this.logger.info('[ACPBridge] All resume attempts failed, creating fresh session');
    sessionResult = await this.connection.newSession({ cwd: this.cwd, mcpServers: [] });
  }
}
```

Emit retry events so the UI could show them:
```typescript
this.eventBus?.emit('acp:resume-retry', {
  id: this.config.id, attempt, maxAttempts: delays.length, error: err.message,
});
```

### Gap 3: No Waiting Detection — user doesn't know if agent is stuck
**KiRoom behavior:** Server polls output file mtime every 5s. After 60s of no output, emits "Waiting" state. Red badge on active message. Auto-clears when output resumes.

**Files:**
- `src-server/services/acp-bridge.ts` — `ACPConnection.handleChat()` streaming section
- `src-ui/src/hooks/streaming/WaitingHandler.ts` — new handler
- `src-ui/src/hooks/useStreamingMessage.ts` — register handler
- `src-ui/src/components/chat.css` — waiting badge styles

**Server implementation:**

In `handleChat()`, inside the `honoStream` callback, after setting `activeWriter`:
```typescript
// Waiting detection — emit if no output for 60s
let lastOutputAt = Date.now();
const STALE_THRESHOLD_MS = 60_000;
const POLL_INTERVAL_MS = 5_000;
let waitingEmitted = false;

const waitingTimer = setInterval(async () => {
  const elapsed = Date.now() - lastOutputAt;
  if (elapsed >= STALE_THRESHOLD_MS && !waitingEmitted) {
    waitingEmitted = true;
    await write({ type: 'waiting', elapsedMs: elapsed });
  } else if (elapsed >= STALE_THRESHOLD_MS && waitingEmitted) {
    // Update elapsed time periodically
    await write({ type: 'waiting', elapsedMs: elapsed });
  }
}, POLL_INTERVAL_MS);
```

Update `lastOutputAt` whenever we emit content. Wrap the existing `activeWriter` to track output:
```typescript
const originalWrite = write;
const trackedWrite = async (chunk: any) => {
  if (chunk.type === 'text-delta' || chunk.type === 'tool-call' || chunk.type === 'tool-result') {
    lastOutputAt = Date.now();
    if (waitingEmitted) {
      waitingEmitted = false;
      await originalWrite({ type: 'waiting-cleared' });
    }
  }
  return originalWrite(chunk);
};
this.activeWriter = trackedWrite;
```

In the `finally` block, clear the timer:
```typescript
clearInterval(waitingTimer);
```

**UI implementation:**

New file: `src-ui/src/hooks/streaming/WaitingHandler.ts`
```typescript
export class WaitingHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'waiting' || event.type === 'waiting-cleared';
  }
  handle(event: StreamEvent, state: StreamState): HandlerResult {
    this.updateChat({
      waitingState: event.type === 'waiting' ? {
        elapsedMs: event.elapsedMs,
        since: Date.now() - event.elapsedMs,
      } : null,
    });
    return this.noOp(state);
  }
}
```

Register in `useStreamingMessage.ts` handlers array.

**CSS:** `.message__waiting-badge` — small pulsing badge below the last message:
```css
.message__waiting-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', monospace;
  color: #e5534b;
  background: rgba(229, 83, 75, 0.1);
  border-radius: 4px;
  animation: pulse-waiting 2s ease-in-out infinite;
}
@keyframes pulse-waiting {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
```

**Render in ChatDockBody or MessageBubble:** When `chatState.waitingState` is set, show the badge with a live timer: "⏳ Waiting · 1:23"

### Gap 4: Pending approvals not cancelled on crash/disconnect
**KiRoom behavior:** When the ACP process crashes or is force-stopped, all pending approvals are cancelled (resolved as denied) and their UI toasts dismissed.

**File:** `src-server/services/acp-bridge.ts` — `ACPConnection.cleanup()`

**Current cleanup:**
```typescript
private cleanup(): void {
  if (this.proc) {
    this.proc.kill();
    this.proc = null;
  }
  this.connection = null;
  // ... terminal cleanup
}
```

**Fix:** Cancel all pending approvals in the registry:
```typescript
private cleanup(): void {
  // Cancel all pending approvals for this connection
  // The ApprovalRegistry doesn't track by connection, so we need to
  // resolve all pending approvals as denied
  // TODO: ApprovalRegistry needs a cancelAll() or cancelByPrefix() method
  
  if (this.proc) {
    this.proc.kill();
    this.proc = null;
  }
  this.connection = null;
  this.activeWriter = null;
  // ... terminal cleanup
}
```

**File:** `src-server/services/approval-registry.ts`

Add `cancelAll()` method:
```typescript
cancelAll(): number {
  let count = 0;
  for (const [id, entry] of this.pending) {
    entry.resolve(false); // deny
    count++;
  }
  this.pending.clear();
  return count;
}
```

Then in `ACPConnection.cleanup()`:
```typescript
const cancelled = this.approvalRegistry.cancelAll();
if (cancelled > 0) {
  this.logger.info(`[ACP:${this.prefix}] Cancelled ${cancelled} pending approvals on cleanup`);
}
```

### Gap 5: In-progress tool calls not marked as failed on error
**KiRoom behavior:** When the agent errors or crashes mid-tool-call, any in-progress tool calls are marked as failed in the UI.

**File:** `src-server/services/acp-bridge.ts` — `handleChat()` catch block (around line 790)

**Current behavior:** Partial response is saved, but tool calls in `responseParts` that are still in `state: 'call'` (never got a result) are left as-is.

**Fix:** In the catch block, before saving the partial message, mark incomplete tool calls:
```typescript
// Mark in-progress tool calls as failed
for (const part of this.responseParts) {
  if (part.type === 'tool-invocation' && part.state === 'call') {
    part.state = 'error';
    part.result = 'Tool call interrupted — agent session ended unexpectedly';
  }
}
```

Also emit SSE events for each failed tool call so the UI updates:
```typescript
for (const part of this.responseParts) {
  if (part.type === 'tool-invocation' && part.state === 'call') {
    part.state = 'error';
    part.result = 'Tool call interrupted';
    if (this.activeWriter) {
      await this.activeWriter({
        type: 'tool-result',
        toolCallId: part.toolCallId,
        error: 'Tool call interrupted — agent session ended unexpectedly',
      });
    }
  }
}
```

### Gap 6: No session lifecycle events in UI
**KiRoom behavior:** Session event cards show init/resume progress, MCP server checklist, status badges, elapsed timer, prompt retries.

**Implementation approach:** Emit lightweight SSE events for key lifecycle moments. The UI renders them as small inline cards between messages.

**Server events to emit (in `handleChat`):**
- `{ type: 'session-event', event: 'connecting' }` — when auto-restarting a culled session
- `{ type: 'session-event', event: 'resumed', sessionId }` — when session was resumed
- `{ type: 'session-event', event: 'fresh-session' }` — when resume failed and fresh session created
- `{ type: 'session-event', event: 'mcp-ready', server: name }` — when MCP server initializes (already tracked via `_kiro.dev/mcp/server_initialized`)

**UI:** New `SessionEventHandler` in the streaming handler chain. Renders as small, muted inline cards:
```
🔄 Resuming session...
✅ Session resumed (attempt 2/3)
🔌 MCP: tool-email ready
```

These are informational — they don't interrupt the message flow.

## Parallel Execution Plan

### Stream A (Session Culling — server only, independent)
1. Add `lastActivityAt`, `hasBeenViewed`, `touchActivity()`, `isIdle()`, `cullSession()` to `ACPConnection`
2. Add `touchActivity()` calls in `handleChat()` and `handleSessionUpdate()`
3. Add auto-restart logic at top of `handleChat()` for culled sessions
4. Add `sweepIdleSessions()` timer to `ACPManager`
5. Clean up timer in `ACPManager.shutdown()`

### Stream B (Resume Retries — server only, independent, parallel with A)
1. Replace single try/catch in `start()` with 3-retry loop + backoff
2. Emit `acp:resume-retry` events via eventBus
3. Log each attempt with attempt number

### Stream C (Waiting Detection — server + UI, independent, parallel with A+B)
1. Add waiting detection timer in `handleChat()` streaming section
2. Wrap `activeWriter` with output tracking
3. Create `WaitingHandler.ts` in `src-ui/src/hooks/streaming/`
4. Register handler in `useStreamingMessage.ts`
5. Add waiting badge CSS in `chat.css`
6. Render waiting badge in chat UI when `waitingState` is set

### Stream D (Crash Recovery — server, independent, parallel with A+B+C)
1. Add `cancelAll()` to `ApprovalRegistry`
2. Call `cancelAll()` in `ACPConnection.cleanup()`
3. Mark in-progress tool calls as failed in `handleChat()` catch block
4. Emit tool-result error events for interrupted tool calls

### Stream E (Session Events — server + UI, depends on A+B for events to emit)
1. Emit session-event SSE events at lifecycle moments in `handleChat()` and `start()`
2. Create `SessionEventHandler.ts` in `src-ui/src/hooks/streaming/`
3. Register handler in `useStreamingMessage.ts`
4. Render inline session event cards in chat UI

## Verification (Playwright)

### Culling
1. Start app, connect to ACP agent
2. Send a message, get a response
3. Wait 70 seconds (unviewed timeout)
4. Check server logs or process list — kiro-cli process should be gone
5. Send another message — should auto-restart and resume transparently

### Resume Retries
1. Verify in server logs that resume attempts are logged with attempt numbers
2. If resume fails (simulate by corrupting session), verify 3 retries then fresh session

### Waiting Detection
1. Send a message that triggers a long-running tool (e.g., a complex code generation)
2. If the agent stalls for 60s+, verify "Waiting" badge appears
3. When output resumes, verify badge clears

### Crash Recovery
1. Send a message that triggers a tool call
2. While tool is in progress, kill the kiro-cli process (`kill <pid>`)
3. Verify: tool call shows as "failed" in UI, pending approvals cancelled, error message shown
4. Send another message — verify session restarts cleanly
