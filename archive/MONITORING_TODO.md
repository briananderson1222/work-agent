# Monitoring Dashboard - Remaining Work

## Context
We've built a real-time monitoring dashboard for the work-agent system that shows agent activity, tool calls, and conversation events. The dashboard is accessible at `/monitoring` and includes:

### ✅ Completed Features
1. **Real-time event streaming** via SSE (`/monitoring/events`)
2. **Agent status tracking** (idle/running) with heartbeat monitoring
3. **Event filtering** by agent, conversation, and event type
4. **Visual indicators** for active filters (removable badges)
5. **Tool call tracking** with input/output display
6. **Artifacts list** on agent-complete showing all tool calls/results from that turn
7. **Export functionality** with clipboard copy (matches ChatDock style)
8. **Conversation color coding** for easy visual grouping
9. **Incremental stats caching** (no recalculation on every request)
10. **Theme-consistent styling** using CSS variables

### 🔄 Remaining Work

#### 1. Event Persistence (High Priority)
**Goal**: Store monitoring events to disk so they survive server restarts and can be queried historically.

**Implementation Plan**:
- Create `.work-agent/monitoring/events.ndjson` file
- Each line is a JSON event with structure:
  ```json
  {
    "timestamp": "2025-11-17T08:00:00.000Z",
    "userId": "agent:sa-agent:user:123",
    "type": "tool-call",
    "agentSlug": "sa-agent",
    "conversationId": "agent:sa-agent:user:123:1234567890:abc123",
    "toolName": "sat-outlook_calendar_view",
    "input": {...},
    "result": {...}
  }
  ```
- Extract `userId` from `conversationId` (format: `agent:<slug>:user:<id>:timestamp:random`)
- Append events to NDJSON file as they occur
- Load recent events on server startup (last 1000 or last 24 hours)
- Implement log rotation (daily files: `events-2025-11-17.ndjson`)

**Files to Modify**:
- `src-server/runtime/voltagent-runtime.ts`:
  - Add `eventLogPath` property
  - Create `loadEventsFromDisk()` method
  - Create `persistEvent(event)` method
  - Call `persistEvent()` when emitting monitoring events
  - Use `appendFile` from `fs/promises` for atomic writes

**Reference Pattern**: See `FileVoltAgentMemoryAdapter` in `src-server/adapters/file/voltagent-memory-adapter.ts` for NDJSON read/write patterns.

#### 2. Time-Based Filtering (Medium Priority)
**Goal**: Allow filtering events by date range with proper start/end times.

**Current State**:
- Date range selector exists with options: "Now", "Today", "Week", "Month", "All Time"
- "Now" should mean "since page loaded" with live updates
- Other ranges should query historical data

**Implementation Plan**:
- Add `startTime` and `endTime` to monitoring stats request
- Backend endpoint: `/monitoring/events?start=<timestamp>&end=<timestamp>`
- Frontend: Track page load time for "Now" mode
- For historical ranges, calculate timestamps and fetch from persisted events
- Disable SSE when viewing historical data (not "Now")

**Files to Modify**:
- `src-ui/src/contexts/MonitoringContext.tsx`:
  - Add `dateRange` state
  - Calculate start/end timestamps based on range
  - Conditionally connect SSE only for "Now" mode
- `src-server/runtime/voltagent-runtime.ts`:
  - Add query params to `/monitoring/events` endpoint
  - Filter events by timestamp range when loading from disk

#### 3. User-Scoped Events (Low Priority)
**Goal**: Separate events per user so multi-user systems don't mix monitoring data.

**Implementation**:
- Extract userId from conversationId: `agent:sa-agent:user:USER_ID:timestamp:random`
- Store events in user-specific files: `.work-agent/monitoring/users/<userId>/events.ndjson`
- Add userId to all monitoring events
- Filter events by current user (if multi-user auth is implemented)

**Note**: This can be deferred until multi-user authentication is added to the system.

## Key Files Reference

### Backend
- `src-server/runtime/voltagent-runtime.ts` - Main runtime, monitoring endpoints
- `src-server/adapters/file/voltagent-memory-adapter.ts` - NDJSON file patterns

### Frontend
- `src-ui/src/views/MonitoringView.tsx` - Main monitoring UI
- `src-ui/src/contexts/MonitoringContext.tsx` - Real-time event subscription
- `src-ui/src/types.ts` - MonitoringEvent interface

### Current Monitoring Event Structure
```typescript
interface MonitoringEvent {
  type: string; // 'agent-start' | 'agent-complete' | 'tool-call' | 'tool-result' | 'heartbeat' | 'connected'
  timestamp: string;
  agentSlug?: string;
  conversationId?: string;
  reason?: string; // completion reason
  toolName?: string;
  toolCallId?: string;
  input?: any;
  result?: any;
  artifacts?: Array<{ type: string; name?: string; content?: any }>;
}
```

## Testing Checklist
- [ ] Events persist across server restarts
- [ ] Historical date ranges load correct events
- [ ] "Now" mode shows live events
- [ ] File rotation works (daily files)
- [ ] No memory leaks from unbounded event arrays
- [ ] Export functionality works for all event types
- [ ] Filters work correctly with persisted events

## Notes
- The monitoring system uses VoltAgent's event emitter pattern
- Events are emitted in `voltagent-runtime.ts` during agent streaming
- SSE connection auto-reconnects on failure with 5s delay
- Heartbeat monitoring resets stale "running" agents after 60s
- All colors use theme CSS variables for light/dark mode support
