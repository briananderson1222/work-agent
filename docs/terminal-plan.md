# Interactive Terminal — Implementation Plan

## Architecture Overview

Following the existing Stallion pattern: **domain interfaces** in `domain/`, **service layer** in `services/`, **concrete adapters** as separate files, **routes** in `routes/`, **UI components** in `src-ui/`.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (xterm.js v6 + FitAddon)                       │
│  TerminalPanel component                                │
│    ↕ WebSocket (binary frames)                          │
├─────────────────────────────────────────────────────────┤
│  Server                                                 │
│  ┌─────────────────────────────────────────────────────┐│
│  │ TerminalWebSocketServer (ws library)                ││
│  │   ↕ routes terminal messages                       ││
│  ├─────────────────────────────────────────────────────┤│
│  │ TerminalService (session lifecycle)                 ││
│  │   - open / write / resize / close / restart        ││
│  │   - history persistence (5000 lines, debounced)    ││
│  │   - subprocess detection (polling)                 ││
│  │   - shell resolution chain                         ││
│  ├─────────────────────────────────────────────────────┤│
│  │ IPtyAdapter (interface)                             ││
│  │   └─ NodePtyAdapter (node-pty, dynamic import)     ││
│  │   └─ (future: BunPtyAdapter, ContainerPtyAdapter)  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Abstraction Boundaries

### Core (interfaces — `domain/`)
- `IPtyAdapter` — spawn/kill PTY processes. Swappable for Bun, containers, remote SSH
- `TerminalSession` types — session state, events, snapshots
- `ITerminalHistoryStore` — persist/restore terminal scrollback. Swappable for DB, memory

### Service Layer (`services/`)
- `TerminalService` — session orchestration, NOT tied to transport or PTY impl
  - Takes `IPtyAdapter` and `ITerminalHistoryStore` via constructor
  - Manages session map, lifecycle, subprocess polling
  - Emits events (data, exit, activity) via callback registration

### Transport (`services/terminal-ws-server.ts`)
- `TerminalWebSocketServer` — standalone `ws.WebSocketServer` on dedicated port
  - Routes WebSocket messages to `TerminalService` methods
  - Broadcasts PTY output to connected clients
  - Handles connection auth, reconnection

### Concrete Adapters
- `NodePtyAdapter` — wraps `node-pty` with dynamic import
- `FileTerminalHistoryStore` — persists history to `~/.stallion-ai/terminal-history/`

### Client (`src-ui/`)
- `TerminalPanel` — xterm.js component with WebSocket connection
- No framework-specific state store (React state + refs sufficient for single terminal)

---

## Phases

### Phase 1: Domain Types & Interfaces
**Files:**
- `src-server/domain/terminal-types.ts` — session state, events, config types
- `src-server/domain/pty-adapter.ts` — `IPtyAdapter` interface

**Types:**
```typescript
// IPtyAdapter
interface IPtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): () => void;
  onExit(cb: (event: { exitCode: number; signal: number | null }) => void): () => void;
}

interface IPtyAdapter {
  spawn(input: { shell: string; args?: string[]; cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv }): Promise<IPtyProcess>;
}

// Terminal types
interface TerminalSessionState {
  sessionId: string;       // projectSlug:terminalId
  projectSlug: string;
  terminalId: string;
  cwd: string;
  status: 'starting' | 'running' | 'exited';
  pid: number | null;
  history: string;
  exitCode: number | null;
  cols: number;
  rows: number;
  hasRunningSubprocess: boolean;
}

type TerminalEvent =
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'started'; sessionId: string; pid: number }
  | { type: 'exited'; sessionId: string; exitCode: number; signal: number | null }
  | { type: 'activity'; sessionId: string; hasRunningSubprocess: boolean };

interface TerminalSessionSnapshot {
  sessionId: string;
  status: string;
  pid: number | null;
  history: string;
  cols: number;
  rows: number;
}
```

### Phase 2: Node-PTY Adapter
**Files:**
- `src-server/adapters/node-pty-adapter.ts`

**Behavior:**
- Dynamic `import('node-pty')` — fails gracefully if not installed
- Wraps `IPty` in `IPtyProcess` interface
- Ensures spawn-helper is executable (macOS/Linux)
- Sets `TERM=xterm-256color`

**Dependencies:** `node-pty@^1.1.0` (added to package.json)

### Phase 3: Terminal Service
**Files:**
- `src-server/services/terminal-service.ts`

**Responsibilities:**
- Session map: `Map<string, TerminalSessionState>` keyed by `projectSlug:terminalId`
- `open(input)` — reuse existing session or spawn new PTY
  - Shell resolution: `$SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh`
  - Restore history from store on first open
  - Return snapshot (including history for client to replay)
- `write(sessionId, data)` — forward to PTY stdin
- `resize(sessionId, cols, rows)` — forward to PTY
- `close(sessionId)` — kill PTY, persist final history
- `restart(sessionId)` — kill + respawn in same cwd
- Event subscription: `subscribe(cb: (event: TerminalEvent) => void): () => void`
- History management:
  - Append PTY output to in-memory buffer
  - Cap at 5,000 lines
  - Debounced persist (40ms) to `ITerminalHistoryStore`
- Subprocess detection:
  - Poll every 1s: check if shell PID has child processes
  - Emit `activity` event on change
  - Uses `pgrep -P <pid>` (macOS/Linux) or skip on Windows
- Cleanup: `dispose()` kills all sessions

### Phase 4: History Store
**Files:**
- `src-server/domain/terminal-history-store.ts` — interface
- `src-server/adapters/file-terminal-history-store.ts` — file-based impl

**Interface:**
```typescript
interface ITerminalHistoryStore {
  load(sessionId: string): Promise<string>;
  save(sessionId: string, history: string): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
```

**File impl:** Stores in `~/.stallion-ai/terminal-history/{sessionId}.txt`

### Phase 5: WebSocket Server
**Files:**
- `src-server/services/terminal-ws-server.ts`

**Protocol (JSON messages):**
```
Client → Server:
  { type: 'open', projectSlug, terminalId, cwd, cols, rows }
  { type: 'data', sessionId, data }        // keystrokes
  { type: 'resize', sessionId, cols, rows }
  { type: 'close', sessionId }

Server → Client:
  { type: 'snapshot', sessionId, status, pid, history, cols, rows }
  { type: 'data', sessionId, data }        // PTY output
  { type: 'started', sessionId, pid }
  { type: 'exited', sessionId, exitCode, signal }
  { type: 'activity', sessionId, hasRunningSubprocess }
```

**Behavior:**
- `new WebSocketServer({ port })` on `serverPort + 1`
- On connection: wait for `open` message, delegate to `TerminalService.open()`
- Subscribe to `TerminalService` events, forward to connected clients
- Handle disconnection gracefully (sessions persist, reconnect restores)

### Phase 6: Runtime Integration
**Files:**
- `src-server/runtime/stallion-runtime.ts` (modify)

**Changes:**
- Instantiate `NodePtyAdapter`, `FileTerminalHistoryStore`, `TerminalService`, `TerminalWebSocketServer`
- Start WS server in `initialize()`, stop in `shutdown()`
- Add REST endpoint `GET /api/coding/terminal-port` returning the WS port
- Keep existing `POST /api/coding/exec` as fallback for non-PTY environments

### Phase 7: Client Dependencies
**Install:** `@xterm/xterm@^6.0.0`, `@xterm/addon-fit@^0.11.0`

### Phase 8: TerminalPanel Component
**Files:**
- `src-ui/src/components/TerminalPanel.tsx` (new, extracted from CodingLayout)

**Behavior:**
- On mount: fetch `/api/coding/terminal-port`, open WebSocket
- Send `open` message with `{projectSlug, terminalId: 'default', cwd, cols, rows}`
- On `snapshot` response: `terminal.write(snapshot.history)` to restore scrollback
- `terminal.onData(data)` → send `{type: 'data', sessionId, data}` over WS
- WS `data` messages → `terminal.write(data)`
- `FitAddon` + `ResizeObserver` → send `resize` messages
- On unmount: close WebSocket (session persists server-side)
- Fallback: if WS connection fails, show the existing REST command executor
- Theme: dark terminal theme matching app colors

### Phase 9: CodingLayout Integration
**Files:**
- `src-ui/src/components/CodingLayout.tsx` (modify)

**Changes:**
- Import `@xterm/xterm/css/xterm.css`
- Replace current TerminalPanel with new xterm-based component
- Pass `projectSlug`, `workingDir` as props

### Phase 10: Build & Verify
- `npm install` new deps
- `./stallion start --clean --force`
- Test: `ls`, `pwd`, `git status`, `kiro-cli` (interactive), `vim` (if available)
- Verify history persists across page refresh
- Verify subprocess detection (run `sleep 10`, check activity indicator)

---

## File Summary

| File | Type | Layer |
|---|---|---|
| `domain/terminal-types.ts` | Types | Core |
| `domain/pty-adapter.ts` | Interface | Core |
| `domain/terminal-history-store.ts` | Interface | Core |
| `adapters/node-pty-adapter.ts` | Adapter | Pluggable |
| `adapters/file-terminal-history-store.ts` | Adapter | Pluggable |
| `services/terminal-service.ts` | Service | Core |
| `services/terminal-ws-server.ts` | Transport | Core (swappable) |
| `runtime/stallion-runtime.ts` | Wiring | Core |
| `src-ui/components/TerminalPanel.tsx` | UI | Client |
| `src-ui/components/CodingLayout.tsx` | UI (modify) | Client |

## Dependencies Added
- `node-pty@^1.1.0` (server, native)
- `ws@^8.18.0` (server, already used by VoltAgent transitively)
- `@xterm/xterm@^6.0.0` (client)
- `@xterm/addon-fit@^0.11.0` (client)
