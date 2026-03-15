# Audit Addendum — Missed Features

Features discovered in the second pass that weren't covered (or were undercovered) in the original analysis.

## 1. Quote & Respond (Selection Toolbar)

**Priority: 🟡 Medium**

KiRoom has a `SelectionToolbar` component that appears when you select text in an agent message:

1. Select text in any agent message → floating "Quote & Respond" button appears
2. Click to expand → shows selected text preview + text input
3. Type your response, hit send
4. Injects an XML-formatted quote + response into the reply compose box:
   ```xml
   <quote source="agent" message="5">selected text here</quote>
   Your response here
   ```
5. User messages with `<quote>` tags render as styled purple blockquotes (visual only — stored data is never modified)

This is a genuinely useful UX pattern for referencing specific parts of long agent responses. Stallion's `MessageBubble` could add this — detect text selection within agent messages, show a floating action, and inject the quote into the chat input.

**Effort**: Small — 1-2 days. Selection detection, floating toolbar, quote formatting.

## 2. MCP Prompt Discovery & Caching

**Priority: 🟡 Medium**

KiRoom discovers and caches MCP prompt templates from the agent's configured MCP servers:

- `@Prompts` popover in the compose box discovers available prompts
- Background refresh loop keeps prompt metadata cached for all configured agents
- Three invalidation signals: agent config mtime, command binary mtime, 5-minute TTL
- Prompt content resolved via `prompts/get` and injected at send time as structured XML
- Manual refresh button clears cache and re-discovers
- Supports argument collection (prompts with parameters show input fields)

This means agents with MCP servers that expose prompts (like KiRoom's own MCP server) get their prompts surfaced in the UI automatically. Stallion has MCP support but may not be discovering/surfacing MCP prompts in the compose UI.

**Effort**: Medium — 2-3 days. MCP prompt discovery, caching layer, popover UI.

## 3. TODO List as Context Compaction Anchor

**Priority: 🟡 Medium (if adopting ACP)**

KiRoom's prompt builder includes a clever pattern: the agent is instructed to create a TODO list with a specific prefix format as its first action. This TODO list serves as a **memory anchor** — when kiro-cli compacts context to stay within token limits, the TODO persists with everything the agent needs to continue.

The TODO description template includes:
- Room ID and thread index
- Context loading instructions
- Reply instructions
- Resume prompt path (if applicable)

This is a resilience pattern worth adopting in Stallion's ACP integration. When context compacts, the agent doesn't lose its bearings.

**Effort**: Trivial — just a prompt engineering change in the system prompt.

## 4. Content Retention on Delete

**Priority: 🟢 Low**

When deleting rooms or threads that have notes or files, KiRoom shows a dialog offering to retain content to `~/shared/kiroom/retained/` before deletion. The checkbox defaults to checked (safe by default).

Retained content is saved with a structured hierarchy:
```
~/shared/kiroom/retained/{timestamp}_{roomName}_thread-{N}[_{threadName}]/
├── notes.txt
└── files/
    └── ...
```

This is a good safety pattern — users don't accidentally lose notes and files when cleaning up conversations.

**Effort**: Small — 1 day. Confirmation dialog, copy-before-delete logic.

## 5. Backup & Recovery System

**Priority: 🟡 Medium (if adopting SQLite)**

KiRoom's backup system is more robust than I initially described:

- **Periodic backups**: Every 5 minutes via SQLite Online Backup API (safe during reads/writes). Max 12 on disk (1 hour rolling history).
- **Startup integrity check**: `PRAGMA quick_check` on every server start. If corruption detected, 3-tier recovery cascade:
  1. **Repair** — dump recoverable rows from corrupt DB into fresh one
  2. **Restore** — swap in most recent verified backup
  3. **Fresh** — create empty DB (files on disk preserved)
- **Corruption-proof pragmas**: `journal_mode=DELETE`, `synchronous=FULL`, `locking_mode=EXCLUSIVE` — prevents corruption on network filesystems (NFS/EFS)
- **PID lockfile with heartbeat**: `hostname:pid:epoch` format. Heartbeat updated every 5 minutes. Locks older than 10 minutes auto-reclaimed. Works across shared filesystems (multiple machines accessing same data dir).
- **Manual restore**: `kiroom --restore-backup <filename>` with pre-restore preservation
- **List backups**: `kiroom-list-backups` with verification status and ready-to-paste restore commands

If Stallion moves to SQLite for conversation data, this backup pattern is worth adopting wholesale.

**Effort**: Medium — 2-3 days. Backup timer, integrity check, recovery cascade, lockfile.

## 6. Data Export/Import

**Priority: 🟢 Low**

Full data portability via Settings:
- **Export**: Downloads all rooms, threads, messages, files, settings as `.tgz` archive
- **Import**: Replaces current data with uploaded archive. Auto-backs up current data first (both `.tgz` and browsable directory). Background analysis jobs paused during import to prevent DB conflicts. Auto-restores on failure.

I mentioned this briefly in the settings doc but the implementation is more thorough than I described — particularly the pause/resume of background jobs and the auto-restore on failure.

**Effort**: Small-Medium — 1-2 days. Archive endpoint, import with backup, job pause/resume.

## 7. Agent Auto-Configure (Self-Repairing)

**Priority: 🟢 Low (Stallion-specific)**

KiRoom's agent auto-configure is more sophisticated than I described:
- **Self-repairing**: If you move KiRoom to a different directory, the MCP path in agent configs auto-updates on next message send
- **Self-cleaning**: Stale `@kiroom/*` tools automatically removed from `allowedTools` when the tool list changes
- **Project-level priority**: Only configures project-level agents when a match exists there (matches kiro-cli resolution order)
- **Duplicate detection**: Warns when multiple config files define the same agent name with different settings
- **KiRoom-aware comparison**: Strips auto-configure fields before comparing configs to avoid false duplicate positives

This is KiRoom-specific (managing its own MCP server config in agent files), but the self-repairing pattern is worth noting if Stallion ever needs to manage agent configurations.

## 8. Session Cleanup & TODO Cleanup

**Priority: 🟢 Low**

Two background sweepers I didn't detail:

**Session Cleanup** (`session-cleanup.ts`):
- Cursor-based sweeper that removes stale kiro-cli chat sessions from the kiro-cli SQLite database
- Worker thread for DB access (keeps Express responsive)
- Prompt fingerprinting with zero false positives (4 fingerprint patterns)
- 3-layer active session protection (age threshold, in-progress working dir protection, fingerprint check)
- ACP session quiet period (pauses for 5 min after ACP session starts to avoid SQLite lock contention)

**TODO Cleanup** (`todo-cleanup.ts`):
- Event-driven: deletes completed TODO on kiro-cli exit
- Background sweeper every 5 minutes as fallback
- Only touches KiRoom-signature TODOs (never touches non-KiRoom TODOs)
- Cross-platform kiro-cli data directory detection

These are operational hygiene features. If Stallion creates TODO lists or kiro-cli sessions, similar cleanup would be needed.

## 9. Reconnection & Crash Recovery UX

**Priority: 🟡 Medium**

Several UX patterns around resilience I didn't fully cover:

- **Reconnection Banner**: Full-width sticky banner when WebSocket drops. "Retry Now" button that cancels backoff timer and closes stuck CONNECTING sockets.
- **Output Restore on Reload**: Close browser while agent is running → streaming output restored from disk on return. Scroll up to load more lines on demand.
- **Draft Persistence**: Compose box drafts auto-saved to localStorage per room/thread. Recover unsent messages after browser refresh or crash.
- **Crash Recovery**: If server crashes mid-execution, output recovered on restart, stale tool calls marked as failed, pending approvals cancelled, next agent session warned about interruption.

Stallion should consider draft persistence (localStorage) and reconnection UX at minimum.

**Effort**: Small — 1 day for draft persistence, 1 day for reconnection banner.

## 10. Dynamic Favicon & Page Titles

**Priority: 🟢 Low**

- **Dynamic page titles**: Breadcrumb-style (e.g., "KiRoom > #MyRoom > Thread 5") with unread count prefix (e.g., "(3) KiRoom > ...")
- **Dynamic favicon**: Tab icon changes color based on state — blue when threads are running, orange when unread messages exist, purple when idle

Small polish features that help when you have multiple tabs open.

**Effort**: Trivial — 0.5 day each.

## Updated Priority Summary

Adding these to the original matrix:

| Feature | Priority | Effort | Original Doc |
|---------|----------|--------|-------------|
| Quote & Respond | 🟡 | Small | New |
| MCP Prompt Discovery | 🟡 | Medium | New |
| TODO as Compaction Anchor | 🟡 | Trivial | New (ACP-related) |
| Content Retention on Delete | 🟢 | Small | New |
| Backup & Recovery | 🟡 | Medium | New (if SQLite) |
| Data Export/Import | 🟢 | Small-Medium | Updated from 07 |
| Draft Persistence | 🟡 | Small | New |
| Reconnection UX | 🟡 | Small | New |
