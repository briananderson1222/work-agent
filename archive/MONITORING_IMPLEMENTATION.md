# Monitoring Event Persistence - Implementation Summary

## Overview
Implemented event persistence for the monitoring dashboard, allowing events to survive server restarts and enabling historical queries.

## Changes Made

### Backend (`src-server/runtime/voltagent-runtime.ts`)

#### 1. Added Event Storage Infrastructure
- **New property**: `eventLogPath` - Path to monitoring directory (`.work-agent/monitoring/`)
- **New property**: `persistedEvents` - In-memory cache of last 1000 events
- **New imports**: Added `mkdir`, `appendFile`, `readdir`, `readFile` from `fs/promises` and `existsSync`, `createReadStream` from `fs`

#### 2. Event Persistence Methods

**`extractUserId(conversationId: string)`**
- Extracts userId from conversationId format: `agent:<slug>:user:<id>:timestamp:random`
- Returns userId or null if format doesn't match

**`getTodayEventLogPath()`**
- Returns path to today's event log file
- Format: `.work-agent/monitoring/events-YYYY-MM-DD.ndjson`
- Implements daily log rotation

**`loadEventsFromDisk()`**
- Called during server initialization
- Loads events from last 2 days of log files
- Filters to events from last 24 hours
- Keeps only last 1000 events in memory
- Creates monitoring directory if it doesn't exist

**`persistEvent(event: any)`**
- Appends event to today's NDJSON log file
- Adds event to in-memory cache
- Maintains cache size limit of 1000 events
- Creates monitoring directory if needed

#### 3. Updated Event Emission
Modified all monitoring event emissions to persist events:
- **agent-start**: Persists when agent begins processing
- **tool-call**: Persists when tool is invoked
- **tool-result**: Persists when tool returns result
- **agent-complete**: Persists when agent finishes processing

Each event is now:
1. Created as an object
2. Emitted via EventEmitter (for SSE)
3. Persisted to disk via `persistEvent()`

#### 4. Enhanced `/monitoring/events` Endpoint
The endpoint now supports two modes:

**Historical Mode** (with query params):
```
GET /monitoring/events?start=<ISO-timestamp>&end=<ISO-timestamp>
```
- Returns JSON array of filtered events
- Filters `persistedEvents` by timestamp range
- No SSE connection

**Live Mode** (no query params):
```
GET /monitoring/events
```
- Returns SSE stream of real-time events
- Existing behavior preserved
- Includes heartbeat every 30 seconds

### Frontend (`src-ui/src/contexts/MonitoringContext.tsx`)

#### 1. Added Date Range Support
- **New property**: `dateRange` - Current date range filter
- **New property**: `isLiveMode` - Whether in live streaming mode

#### 2. New Methods

**`fetchHistoricalEvents(start?: Date, end?: Date)`**
- Fetches historical events from backend
- Constructs query params from date range
- Updates events array with results

**`setDateRange(range: 'now' | 'today' | 'week' | 'month' | 'all')`**
- Sets the active date range filter
- Calculates start/end timestamps based on range:
  - **now**: Live mode, no date filter
  - **today**: From midnight today
  - **week**: Last 7 days
  - **month**: Last 30 days
  - **all**: No time limit
- Disconnects SSE for historical modes
- Connects SSE for "now" mode
- Fetches historical events for non-live modes

#### 3. Updated Hook
Exposed `setDateRange` in `useMonitoring()` hook for UI components to use.

## File Structure

```
.work-agent/
  monitoring/
    events-2025-11-17.ndjson    # Today's events
    events-2025-11-16.ndjson    # Yesterday's events
    events-2025-11-15.ndjson    # Older events
```

## Event Format

Each line in the NDJSON file is a JSON object:

```json
{
  "type": "agent-start",
  "timestamp": "2025-11-17T15:48:00.000Z",
  "agentSlug": "sa-agent",
  "conversationId": "agent:sa-agent:user:123:1234567890:abc123"
}
```

```json
{
  "type": "tool-call",
  "timestamp": "2025-11-17T15:48:01.000Z",
  "agentSlug": "sa-agent",
  "conversationId": "agent:sa-agent:user:123:1234567890:abc123",
  "toolName": "sat-outlook_calendar_view",
  "toolCallId": "call_123",
  "input": { "days": 7 }
}
```

```json
{
  "type": "agent-complete",
  "timestamp": "2025-11-17T15:48:05.000Z",
  "agentSlug": "sa-agent",
  "conversationId": "agent:sa-agent:user:123:1234567890:abc123",
  "reason": "stop",
  "artifacts": [...]
}
```

## Testing

### Manual Testing Steps

1. **Start the server**:
   ```bash
   npm run dev:server
   ```

2. **Generate some events** by sending messages to an agent:
   ```bash
   curl -X POST http://localhost:3141/agents/sa-agent/text \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [{"role": "user", "content": "Hello"}],
       "userId": "test-user"
     }'
   ```

3. **Check event log file**:
   ```bash
   cat .work-agent/monitoring/events-$(date +%Y-%m-%d).ndjson
   ```

4. **Test historical query**:
   ```bash
   curl "http://localhost:3141/monitoring/events?start=2025-11-17T00:00:00.000Z&end=2025-11-17T23:59:59.999Z"
   ```

5. **Test SSE stream**:
   ```bash
   curl -N http://localhost:3141/monitoring/events
   ```

6. **Restart server** and verify events are loaded:
   - Check server logs for "Loaded persisted events" message
   - Query `/monitoring/events` with date range to see persisted events

### Automated Test Script

Run the included test script:
```bash
./test-monitoring-persistence.sh
```

## Testing Checklist

- [x] Event persistence infrastructure implemented
- [x] Daily log rotation implemented
- [x] Historical query endpoint implemented
- [x] Frontend date range filtering implemented
- [ ] Events persist across server restarts (needs manual verification)
- [ ] Historical date ranges load correct events (needs manual verification)
- [ ] "Now" mode shows live events (needs manual verification)
- [ ] File rotation works correctly (needs manual verification)
- [ ] No memory leaks from unbounded arrays (cache limited to 1000 events)
- [ ] Export functionality works for all event types (existing feature)
- [ ] Filters work correctly with persisted events (existing feature)

## Future Enhancements

### User-Scoped Events (Low Priority)
Currently deferred until multi-user authentication is implemented:
- Extract userId from conversationId
- Store events in user-specific directories: `.work-agent/monitoring/users/<userId>/`
- Filter events by current user

### Additional Features
- Event log cleanup/archival for old files
- Compression of old log files
- Event search/filtering by agent, conversation, or event type
- Event export to CSV or other formats
- Event analytics and aggregation

## Notes

- Events are loaded on server startup (last 1000 or 24 hours)
- In-memory cache is limited to 1000 events to prevent memory issues
- Daily log files enable easy cleanup and archival
- SSE connection auto-reconnects on failure with 5s delay
- All timestamps are in ISO 8601 format (UTC)
- Event persistence is fire-and-forget (errors logged but don't block event emission)
