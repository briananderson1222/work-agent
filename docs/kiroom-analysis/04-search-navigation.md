# Search & Navigation

## Priority: 🟡 Medium

## What KiRoom Built

### Cross-Room Search

Server-side search with powerful filtering:

- **Text search** — Search message content across all threads in a room or across all rooms
- **Regex search** — Start query with `/` for regex patterns (e.g., `/error.*timeout/`)
- **Doc filename search** — Matches doc filenames in collab threads
- **Match navigation** — When viewing results, see match count and "Next" to cycle through matches
- **Auto-scroll to match** — Opening a thread from search scrolls to the first match with highlight

The search is backed by SQLite `LIKE` / regex queries against the messages table, with `json_extract()` for lean context retrieval.

### URL Filters

Every filter is encoded in the URL — bookmarkable, shareable, composable:

```
?q=search          — text/regex query
?status=in_progress — thread status (comma-separated for multi-select)
?labels=bug,feature — label filter
?unread=true        — unread only
?forks=true         — fork-related threads
?refs=true          — threads with #KiRoom/ references
?collab=true        — doc collaboration threads
?lastUpdate=7d      — updated within time period (30m, 2h, 7d, 1w)
?room=abc123        — scope to specific room
?locked=true        — lock filters across room navigation
```

### Lock Filters

Lock your current filters to persist them when navigating between rooms:
- Purple badges show matching thread counts per room in the sidebar
- Collapsed floors show combined match counts
- Unlock to return to normal navigation

### Deep Links

Full URL-based navigation:
```
<host>/#KiRoom/abc123/My%20Room/3/5
         roomId  roomName  thread message
```

- URLs update as you navigate (shareable, back button works)
- Browser back/forward creates history entries via `pushState`
- Rapid navigation (<300ms) coalesced into single history entry
- Ctrl+click / Middle-click opens in new tab
- Dynamic page titles: "KiRoom > #MyRoom > Thread 5"
- Dynamic favicon: blue (running), orange (unread), purple (idle)

### Unread Tracking

- Server-authoritative badge counts via `GET /api/room-stats` (SQL query)
- Threads auto-mark read when viewed (only if tab is visible)
- Background tabs don't mark as read
- Reconnect sync — badges refresh when WebSocket reconnects
- HUD indicators in top bar: Queued, Failed Queue, In Progress, Waiting

### Header HUD

At-a-glance status indicators:
- **Queued: N** — threads with queued messages
- **Failed Queue: N** — threads with failed queued messages (red)
- **In Progress: N** — threads currently running
- **Waiting: N** — threads with stale output (red)
- Click any indicator → popover with "Search across all rooms" / "Search in current room"

## What Stallion Has Today

- Basic search within conversations (client-side)
- URL routing for projects/layouts via React Router
- No cross-project search
- No URL-encoded filters
- No unread tracking
- No HUD status indicators
- No deep linking to specific messages

## Recommendation

### What to Adopt

1. **Cross-project search** — Server-side search across all conversations. If moving to SQLite, this is straightforward. With JSON files, you'd need an index.

2. **URL-encoded filters** — Encode search query, status, and project in URL params. Makes searches bookmarkable and shareable.

3. **Deep links to messages** — Encode project/conversation/message in URL. Essential for the threading model.

4. **Unread tracking** — Track `lastReadAt` per conversation. Show badge counts in sidebar. Server-authoritative counts.

5. **HUD status bar** — Show in-progress, waiting, queued counts in the header. Click to filter.

### What to Adapt

- **Lock filters** — Interesting but complex. Skip initially, add if users request it.
- **Dynamic favicon** — Nice polish. Easy to add later.
- **Regex search** — Power user feature. Start with plain text search.

### Stallion Mapping

| KiRoom Feature | Stallion Location | Notes |
|---------------|------------------|-------|
| Search API | New route in `src-server/routes/` | Query conversations/messages |
| URL filters | `useUrlSelection.ts` or new hook | Encode/decode URL params |
| Deep links | `NavigationContext.tsx` | Extend URL routing |
| Unread tracking | `ConversationsContext.tsx` | Add `lastReadAt`, badge counts |
| HUD indicators | `Header.tsx` | Add status counts |
| Room stats | New API endpoint | Aggregate counts per project |

### Effort Estimate

- **Cross-project search**: Medium — 2-3 days. API endpoint, search UI, result rendering.
- **URL filters**: Small — 1-2 days. Hook for URL param sync.
- **Deep links**: Small — 1 day. URL encoding, navigation handler.
- **Unread tracking**: Small — 1-2 days. `lastReadAt` field, badge component.
- **HUD indicators**: Small — 1 day. Count aggregation, header component.
