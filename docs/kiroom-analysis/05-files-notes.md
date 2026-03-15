# Files & Notes

## Priority: 🟡 Medium

## What KiRoom Built

### Two-Tier File Management

KiRoom has files at two scopes:

**Room Files** (shared across all threads):
- Upload via drag & drop, click to browse, or clipboard paste (Cmd+V)
- Paste preview dialog for images/text before uploading
- Rename, download, preview (text files and images inline)
- Binary detection — PDFs/archives show "cannot preview" with download option
- Agents upload via `upload_file_to_room` MCP tool; files appear inline on the message that uploaded them
- Checkbox selection for bulk delete
- Stored at `~/shared/kiroom/rooms/<roomId>/files/`
- File names/sizes auto-injected into agent prompts

**Thread Files** (scoped to individual threads):
- Upload via compose box 📎 button
- **Staged files** — files uploaded before sending are "staged" and attached when you send
- Reply drafts have their own staging area
- **Conflict detection** — live validation warns when filename conflicts with existing thread or room files
- **Promote to Room** — move thread files to Room Files to share across all threads
- Locked/Unlocked indicators show which files can be promoted
- Agents upload via `upload_thread_file` MCP tool; files appear inline on the message
- Soft delete — deleted files show "File was deleted" on messages that referenced them
- Stored at `~/shared/kiroom/rooms/<roomId>/threads/<threadIndex>/files/`

### Doc Collaboration

A dedicated thread type for collaborating on markdown documents:

- **Split view** — document preview on left, chat on right (resizable)
- **Version history** — every agent edit creates a new version, browse with version picker
- **Diff view** — changes between any two versions with green/red line highlighting, word-level diff
- **Inline comments** — click line numbers to add comments on specific lines or ranges
- **Comment navigation** — sticky bar with comment count, scroll up/down buttons
- **@kiro Review Comments** — one-click button to ask agent to address all comments
- **Mermaid diagrams** — render button for mermaid code blocks
- **Markdown toggle** — switch between rendered and plain text
- **MCP tools** — agents use `get_doc_content`, `get_doc_comments`, `update_doc`

The versioning system (`files/versioning.ts`) stores each version as a separate file, with a `file_versions` table tracking version history. Comments are stored in a `doc_comments` table with line ranges.

### Notes System

Simple but high-value scratchpads:

- **Room Notes** — one per room, stored as `notes.txt` in the room directory
- **Thread Notes** — one per thread, stored as `notes.txt` in the thread directory
- **Floating window** — draggable, resizable, stays on screen
- **Auto-save** on close
- **Visual indicator** — button icon changes when notes have content (outline vs filled)
- **Both open simultaneously** — room and thread notes can coexist
- **Auto-close** — notes close when you leave the room/thread
- **Auto-injection (ACP)** — notes automatically included in system prompt so agents have your context immediately. Re-injected when content changes (hash-based change detection)
- **Agent access** — agents can also read notes via `get_notes` MCP tool for on-demand access

The implementation is dead simple — `storage/notes.ts` is just `fs.readFileSync` / `fs.writeFileSync` on text files. The power is in the auto-injection into ACP prompts.

## What Stallion Has Today

- **Knowledge service** (`knowledge-service.ts`) — document management focused on embedding/RAG. Upload documents, chunk them, embed for vector search.
- **File storage** — project-level document storage for knowledge base
- No thread-scoped files
- No file staging or conflict detection
- No doc collaboration with versioning/comments
- No notes system
- No auto-injection of user context into prompts

## Recommendation

### What to Adopt

1. **Notes System** (Small effort, high value)

   This is the easiest win. Per-project and per-conversation scratchpads:
   - Simple text files on disk
   - Floating/panel UI for editing
   - Auto-inject into ACP system prompt
   - Agent access via MCP tool or context injection

   The auto-injection is the key insight — users write notes, agents automatically see them. No explicit "attach context" step needed.

2. **Thread-Scoped File Attachments** (Medium effort)

   Allow attaching files to specific messages in a conversation:
   - Staged files before sending
   - Files appear inline on the message
   - Agent sees attached file names in context
   - Useful for "here's the error screenshot" or "review this file" workflows

3. **File Paste Support** (Small effort)

   Cmd+V to paste images/text from clipboard with preview dialog. This is a quality-of-life feature that makes file sharing frictionless.

### What to Skip (for now)

- **Doc Collaboration** — Interesting but niche. Stallion's knowledge system serves a different purpose (embedding/RAG vs collaborative editing). The versioning/comments system is substantial to build and may not align with Stallion's direction.
- **Room Files vs Thread Files distinction** — Stallion's project-level documents already serve the "room files" role. Thread-scoped attachments are the gap.
- **File promotion (thread → room)** — Only relevant if you have both tiers.

### Stallion Mapping

| KiRoom Feature | Stallion Location | Notes |
|---------------|------------------|-------|
| Room Notes | New: per-project notes | Text file in project data dir |
| Thread Notes | New: per-conversation notes | Text file in conversation data dir |
| Notes auto-injection | `acp-bridge.ts` system prompt | Inject notes content |
| Notes MCP tool | New MCP tool or context provider | Agent reads notes on demand |
| Thread file attachments | Extend message model | Add `attachments` field |
| File paste | `ChatInputArea.tsx` | Handle paste event |
| Room files | Existing knowledge/documents | Already have project-level files |

### Implementation Sketch: Notes

```
~/.stallion-ai/projects/<slug>/notes.txt          — project notes
~/.stallion-ai/projects/<slug>/conversations/<id>/notes.txt — conversation notes
```

UI: A "Notes" button in the chat dock header. Opens a panel/floating window. Auto-saves on blur/close. Badge indicator when notes have content.

ACP injection: When building the system prompt in `acp-bridge.ts`, check for notes files and append their content in a `<user_notes>` section.

### Effort Estimate

- **Notes system**: Small — 1-2 days. File read/write, UI panel, ACP injection.
- **Thread file attachments**: Medium — 2-3 days. Upload UI, message model extension, agent context.
- **File paste support**: Small — 0.5-1 day. Paste event handler, preview dialog.
