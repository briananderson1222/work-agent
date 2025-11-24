# Analytics Implementation Summary

## Overview
Implemented historical model data tracking and usage analytics system for Work Agent. The system captures point-in-time model metadata with each message and provides aggregate statistics and achievements.

## Architecture

### Backend Components

#### 1. Enhanced Message Storage
**File**: `src-server/adapters/file/voltagent-memory-adapter.ts`

Messages now include:
```typescript
{
  role, content, timestamp,
  metadata: {
    model: string,
    modelMetadata: {
      capabilities: { inputModalities, outputModalities, supportsStreaming },
      pricing: { inputTokenPrice, outputTokenPrice, currency, region }
    },
    usage: {
      inputTokens: number,
      outputTokens: number,
      totalTokens: number,
      estimatedCost: number
    }
  }
}
```

#### 2. Usage Aggregator
**File**: `src-server/analytics/usage-aggregator.ts`

Features:
- **Incremental updates**: Updates stats on each new message
- **Full rescan**: Scans all NDJSON files to rebuild stats
- **Persistent storage**: Saves to `.work-agent/analytics/stats.json`
- **Achievement tracking**: Automatically updates achievements

Stats structure:
```typescript
{
  lifetime: {
    totalMessages, totalSessions, totalInputTokens, totalOutputTokens,
    totalCost, uniqueAgents, firstMessageDate, lastMessageDate
  },
  byModel: { [modelId]: { messages, inputTokens, outputTokens, cost } },
  byAgent: { [agentSlug]: { sessions, messages, cost } }
}
```

Achievements:
- First Steps (1 message)
- Conversationalist (100 messages)
- Power User (1,000 messages)
- Model Explorer (5 different models)
- Cost Conscious (avg < $0.01/message)

#### 3. Analytics Routes
**File**: `src-server/routes/analytics.ts`

Endpoints:
- `GET /api/analytics/usage` - Returns aggregated stats
- `GET /api/analytics/achievements` - Returns achievement progress
- `POST /api/analytics/rescan` - Triggers full rescan

### Frontend Components

#### 1. Analytics Context
**File**: `src-ui/src/contexts/AnalyticsContext.tsx`

- Uses `useSyncExternalStore` pattern for reactive updates
- Provides `useAnalytics()` hook
- Auto-fetches on mount
- Methods: `refresh()`, `rescan()`

#### 2. Usage Stats Panel
**File**: `src-ui/src/components/UsageStatsPanel.tsx`

Displays:
- Lifetime totals (messages, sessions, cost, avg cost/msg)
- Top 5 models by usage
- Top 5 agents by usage
- Active since date
- Refresh and rescan buttons

#### 3. Achievements Badge
**File**: `src-ui/src/components/AchievementsBadge.tsx`

Features:
- Compact mode for headers (🏆 3/5)
- Full mode for settings page
- Progress bars for locked achievements
- Unlock dates for completed achievements

## Integration Points

### 1. Message Creation
When sending messages, pass model metadata and usage in context:

```typescript
await adapter.addMessage(message, userId, conversationId, {
  modelMetadata: {
    capabilities: modelCapabilities,
    pricing: pricingData
  },
  usage: {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.totalTokens,
    estimatedCost: calculateCost(response.usage, pricingData)
  }
});
```

### 2. Incremental Stats Update
After each message is saved:

```typescript
await aggregator.incrementalUpdate(message, agentSlug, conversationId);
```

### 3. UI Integration
Wrap app with AnalyticsProvider:

```tsx
<AnalyticsProvider apiBase={API_BASE}>
  <App />
</AnalyticsProvider>
```

Use components:
```tsx
// In settings page
<UsageStatsPanel />
<AchievementsBadge />

// In chat dock header
<AchievementsBadge compact />
```

## Data Storage

### Files Created
- `.work-agent/analytics/stats.json` - Running totals
- `.work-agent/analytics/achievements.json` - Unlocked achievements

### Message Format
Each line in `.work-agent/agents/<slug>/memory/sessions/<conversation-id>.ndjson`:
```json
{
  "role": "assistant",
  "content": "...",
  "metadata": {
    "timestamp": 1700000000000,
    "model": "anthropic.claude-3-7-sonnet-20250219-v1:0",
    "modelMetadata": {
      "capabilities": { "inputModalities": ["TEXT"], "outputModalities": ["TEXT"], "supportsStreaming": true },
      "pricing": { "inputTokenPrice": 0.003, "outputTokenPrice": 0.015, "currency": "USD", "region": "us-east-1" }
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

## Next Steps

### Required Integration Work

1. **Fetch Model Metadata at Message Time**
   - In `useSendMessage` hook, fetch capabilities and pricing before saving
   - Use existing `/api/models/capabilities` and `/api/models/pricing/:modelId` endpoints

2. **Calculate Token Usage**
   - Extract usage from Bedrock response
   - Calculate estimated cost: `(inputTokens * inputPrice + outputTokens * outputPrice) / 1000`

3. **Wire Up Incremental Updates**
   - Import `UsageAggregator` in runtime
   - Call `incrementalUpdate()` after each message save

4. **Add to UI**
   - Import `AnalyticsProvider` in `main.tsx`
   - Add `UsageStatsPanel` to settings page
   - Add `AchievementsBadge` to chat dock header

### Optional Enhancements

1. **Per-Conversation Stats**
   - Add endpoint: `GET /api/analytics/conversation/:id`
   - Show cost breakdown in conversation panel

2. **Time-Series Charts**
   - Track daily/weekly/monthly usage trends
   - Visualize cost over time

3. **Budget Alerts**
   - Set spending limits
   - Notify when approaching threshold

4. **Export Reports**
   - CSV export of usage data
   - PDF reports for billing

## Testing

### Backend
```bash
# Start server
npm run dev:server

# Test endpoints
curl http://localhost:3141/api/analytics/usage
curl http://localhost:3141/api/analytics/achievements
curl -X POST http://localhost:3141/api/analytics/rescan
```

### Frontend
```bash
# Start UI
npm run dev:ui

# Navigate to settings page to see stats
# Send messages to see incremental updates
```

### Manual Testing
1. Send messages with different agents
2. Use different models
3. Check stats update in real-time
4. Verify achievements unlock at thresholds
5. Test rescan functionality

## Performance Considerations

- **Incremental updates**: O(1) per message
- **Full rescan**: O(n) where n = total messages (use sparingly)
- **Caching**: Stats cached in memory, persisted to disk
- **Lazy loading**: UI fetches stats on demand

## Security

- No PII stored in analytics
- Stats scoped per agent
- No cross-agent data leakage
- Local-first storage (no external services)
