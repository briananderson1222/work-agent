# Analytics System - Complete Context

## Overview
Work Agent now has a complete analytics system that tracks usage, costs, and achievements. All data is stored locally in `.work-agent/analytics/` and message metadata is enriched with model information and token usage.

## Architecture

### Data Flow
```
1. User sends message → Agent processes with Bedrock
2. VoltAgent onEnd hook → Enriches assistant message with:
   - Model ID (from agent spec or app config default)
   - Model metadata (capabilities, pricing)
   - Token usage (input, output, total)
   - Estimated cost
3. FileVoltAgentMemoryAdapter.addMessage() → Saves to NDJSON with metadata
4. Adapter triggers UsageAggregator.incrementalUpdate()
5. Aggregator updates .work-agent/analytics/stats.json
6. Aggregator updates .work-agent/analytics/achievements.json
7. UI fetches via /api/analytics/* endpoints
```

### File Structure
```
.work-agent/
  analytics/
    stats.json              # Aggregated usage statistics
    achievements.json       # Achievement unlock status
  agents/
    <agent-slug>/
      memory/
        sessions/
          <conversation-id>.ndjson  # Messages with metadata
```

## Backend Components

### 1. Message Enrichment
**Location**: `src-server/runtime/voltagent-runtime.ts` (onEnd hook, ~line 2650)

**What it does**:
- After each assistant message, enriches it with model metadata and usage
- Gets model ID from agent spec or falls back to app config default
- Fetches model capabilities from Bedrock API
- Fetches pricing from AWS Pricing API
- Removes last message and re-adds with enriched metadata

**Key code**:
```typescript
await adapter.addMessage(lastMessage, userId, conversationId, {
  model: modelId,
  modelMetadata: { capabilities, pricing },
  usage: { inputTokens, outputTokens, totalTokens, estimatedCost }
});
```

### 2. Memory Adapter
**Location**: `src-server/adapters/file/voltagent-memory-adapter.ts`

**What it does**:
- Stores messages as NDJSON in `.work-agent/agents/<slug>/memory/sessions/`
- Accepts context parameter with model metadata and usage
- Triggers incremental analytics update after saving
- Passes UsageAggregator reference from runtime

**Message format**:
```json
{
  "id": "msg-123",
  "role": "assistant",
  "parts": [{"type": "text", "text": "..."}],
  "metadata": {
    "timestamp": 1700000000000,
    "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "modelMetadata": {
      "capabilities": {
        "inputModalities": ["TEXT"],
        "outputModalities": ["TEXT"],
        "supportsStreaming": true
      },
      "pricing": {
        "inputTokenPrice": 0.003,
        "outputTokenPrice": 0.015,
        "currency": "USD",
        "region": "us-east-1"
      }
    },
    "usage": {
      "inputTokens": 1234,
      "outputTokens": 567,
      "totalTokens": 1801,
      "estimatedCost": 0.012345
    }
  }
}
```

### 3. Usage Aggregator
**Location**: `src-server/analytics/usage-aggregator.ts`

**What it does**:
- Maintains running totals in `.work-agent/analytics/stats.json`
- Incremental updates: O(1) per message
- Full rescan: Reads all NDJSON files and rebuilds stats
- Handles missing model field by looking up agent spec
- Tracks achievements and auto-unlocks based on thresholds

**Stats structure**:
```typescript
{
  lifetime: {
    totalMessages: number,
    totalSessions: number,
    totalInputTokens: number,
    totalOutputTokens: number,
    totalCost: number,
    uniqueAgents: string[],
    firstMessageDate: string,
    lastMessageDate: string
  },
  byModel: {
    [modelId]: { messages, inputTokens, outputTokens, cost }
  },
  byAgent: {
    [agentSlug]: { sessions, messages, cost }
  }
}
```

**Achievements**:
- First Steps (1 message)
- Conversationalist (100 messages)
- Power User (1,000 messages)
- Model Explorer (5 different models)
- Cost Conscious (avg < $0.01/message)

### 4. Analytics Routes
**Location**: `src-server/runtime/voltagent-runtime.ts` (~line 210)

**Endpoints**:
- `GET /api/analytics/usage` - Returns aggregated stats
- `GET /api/analytics/achievements` - Returns achievement progress
- `POST /api/analytics/rescan` - Triggers full rescan (rebuilds stats from all messages)

## Frontend Components

### 1. AnalyticsContext
**Location**: `src-ui/src/contexts/AnalyticsContext.tsx`

**What it does**:
- Uses `useSyncExternalStore` pattern for reactive updates
- Fetches from `/api/analytics/*` endpoints
- Caches snapshot to prevent infinite re-renders
- Provides `useAnalytics()` hook

**Usage**:
```typescript
const { usageStats, achievements, loading, error, refresh, rescan } = useAnalytics();
```

### 2. ProfilePage
**Location**: `src-ui/src/pages/ProfilePage.tsx`
**Route**: `/profile`
**CSS**: `src-ui/src/pages/ProfilePage.css`

**Features**:
- Hero section with user initials (like agent icons)
- Dynamic title: "{userName}'s Profile"
- Progress-based messaging (getting started, on a roll, power user)
- Cost badges
- 2-column grid layout for stats and achievements
- Activity timeline placeholder (future: time-series chart showing daily/weekly message volume, cost trends, and model usage over time)

**Activity Timeline Intent**:
The activity timeline is a placeholder for future time-series visualization that will show:
- Daily/weekly message volume trends
- Cost trends over time
- Model usage patterns (which models used when)
- Peak usage times
- Conversation frequency
This will help users understand their usage patterns and identify cost optimization opportunities.

### 3. UsageStatsPanel
**Location**: `src-ui/src/components/UsageStatsPanel.tsx`
**CSS**: `src-ui/src/components/UsageStatsPanel.css`

**Features**:
- 4 stat cards (messages, sessions, total cost, avg cost/msg)
- Top 5 models with progress bars
- Top 5 agents with progress bars
- Refresh and rescan buttons
- Active since date

### 4. AchievementsBadge
**Location**: `src-ui/src/components/AchievementsBadge.tsx`
**CSS**: `src-ui/src/components/AchievementsBadge.css`

**Features**:
- Unlocked/locked visual states
- Progress bars with color coding (green > 75%, yellow > 50%, blue > 25%, primary < 25%)
- Unlock dates
- Compact mode for header (🏆 3/5)

### 5. Header Navigation
**Location**: `src-ui/src/components/Header.tsx`

**What changed**:
- Added user badge button (👤) before settings
- Active state when on profile page
- Navigates to `/profile` on click

## Integration Points

### Provider Setup
**Location**: `src-ui/src/main.tsx`

```typescript
<ApiBaseProvider>
  <ConfigProvider>
    <NavigationProvider>
      {/* ... other providers ... */}
      <AnalyticsProvider>
        <App />
      </AnalyticsProvider>
    </NavigationProvider>
  </ConfigProvider>
</ApiBaseProvider>
```

### Navigation Type
**Location**: `src-ui/src/types.ts`

Added `{ type: 'profile' }` to NavigationView union type.

## Common Issues & Solutions

### Issue: "unknown" model in stats
**Cause**: Old messages saved before model enrichment was added
**Solution**: Run rescan endpoint: `POST /api/analytics/rescan`
**Prevention**: Aggregator now looks up agent spec when model field is missing

### Issue: Infinite re-render loop
**Cause**: `getSnapshot()` returning new object every call
**Solution**: Cache snapshot in store, only update on `notify()`

### Issue: Text color issues (black on dark)
**Cause**: Using `color: var(--bg-primary)` instead of proper text color
**Solution**: Use `color: var(--text-on-accent)` for badges on colored backgrounds

### Issue: Analytics not updating
**Cause**: UsageAggregator not passed to memory adapter
**Solution**: Pass aggregator in adapter constructor options

## Testing

### Backend
```bash
# Check analytics endpoints
curl http://localhost:3141/api/analytics/usage | jq '.'
curl http://localhost:3141/api/analytics/achievements | jq '.'

# Trigger rescan
curl -X POST http://localhost:3141/api/analytics/rescan | jq '.'

# Check message format
find .work-agent/agents -name "*.ndjson" | head -1 | xargs tail -1 | jq '.metadata'
```

### Frontend
1. Navigate to `/profile` or click 👤 icon
2. Send messages to see stats update
3. Check achievements unlock at thresholds
4. Test refresh and rescan buttons

## Performance

- **Incremental updates**: O(1) per message
- **Full rescan**: O(n) where n = total messages (use sparingly)
- **Memory**: Stats cached in-memory, persisted to disk
- **UI**: Auto-fetches on mount, manual refresh available

## Future Enhancements

1. **Per-conversation stats** - Show cost breakdown per conversation
2. **Time-series charts** - Visualize usage trends over time
3. **Budget alerts** - Set spending limits and notifications
4. **Export reports** - CSV/PDF export for billing
5. **More achievements** - Add creative milestones
6. **User profiles** - Multi-user support with separate stats

## Key Files Modified

### Backend (4 files)
- `src-server/runtime/voltagent-runtime.ts` - Added aggregator, enrichment, routes
- `src-server/adapters/file/voltagent-memory-adapter.ts` - Enhanced message storage
- `src-server/analytics/usage-aggregator.ts` - Created aggregator (new)
- `src-server/routes/analytics.ts` - Created routes (new, but unused - routes inline in runtime)

### Frontend (8 files)
- `src-ui/src/pages/ProfilePage.tsx` - Profile page (new)
- `src-ui/src/pages/ProfilePage.css` - Profile styles (new)
- `src-ui/src/contexts/AnalyticsContext.tsx` - Analytics context (new)
- `src-ui/src/components/UsageStatsPanel.tsx` - Stats panel (new)
- `src-ui/src/components/UsageStatsPanel.css` - Stats styles (new)
- `src-ui/src/components/AchievementsBadge.tsx` - Achievements (new)
- `src-ui/src/components/AchievementsBadge.css` - Achievement styles (new)
- `src-ui/src/components/Header.tsx` - Added user badge button
- `src-ui/src/App.tsx` - Added profile route, removed duplicate ApiBaseProvider
- `src-ui/src/main.tsx` - Added ApiBaseProvider and AnalyticsProvider
- `src-ui/src/types.ts` - Added profile view type

## CSS Variables Used

All components use theme variables for consistency:
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--text-primary`, `--text-secondary`, `--text-on-accent`
- `--border-primary`
- `--accent-primary`, `--accent-secondary`, `--accent-success`, `--accent-warning`, `--accent-danger`

## Why Messages Might Not Have Model Field

Messages may be missing the `model` field in their metadata for several reasons:

**Historical reasons**:
1. **Legacy messages**: Messages saved before the analytics system was implemented (no metadata at all)
2. **Pre-enrichment messages**: Messages saved before model enrichment was added to the onEnd hook
3. **System errors**: Enrichment failures during message processing (caught and logged, but message still saved)

**Technical details**:
- The `model` field is added by the VoltAgent runtime's `onEnd` hook after each assistant response
- The hook fetches model metadata from Bedrock API and pricing from AWS Pricing API
- If these API calls fail, the message is saved without enrichment to prevent data loss
- The enrichment happens AFTER the message is generated but BEFORE it's returned to the user

**Current behavior**:
- All new messages get the `model` field from the onEnd hook
- The UsageAggregator falls back to the agent spec's model when the field is missing
- Running a rescan (`POST /api/analytics/rescan`) rebuilds stats with correct model attribution
- The aggregator logs warnings when it encounters messages without model metadata

**How to fix**:
```bash
# Trigger a full rescan to rebuild stats from all messages
curl -X POST http://localhost:3141/api/analytics/rescan
```

This will:
1. Read all NDJSON message files
2. Look up agent specs for messages missing model field
3. Rebuild stats.json with correct model attribution
4. Update achievements based on corrected data

## Quick Start for New Session

1. **Check current state**:
   ```bash
   curl http://localhost:3141/api/analytics/usage | jq '.data.byModel'
   ```

2. **If seeing "unknown" models**:
   ```bash
   curl -X POST http://localhost:3141/api/analytics/rescan
   ```

3. **Access profile page**:
   - Navigate to http://localhost:5173/profile
   - Or click 👤 icon in header

4. **Send test message**:
   ```bash
   curl -X POST "http://localhost:3141/agents/stallion-workspace:work-agent/text" \
     -H "Content-Type: application/json" \
     -d '{"input": "Hello", "options": {"userId": "test", "conversationId": "test-123"}}'
   ```

5. **Verify analytics updated**:
   - Refresh profile page
   - Check stats incremented
   - Check achievements progress

## Status: ✅ COMPLETE AND VERIFIED

All components working end-to-end. Analytics tracking correctly. UI is sleek and intuitive. Ready for production use!
