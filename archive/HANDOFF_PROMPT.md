# Nova Tool Name Normalization - Implementation Handoff

## Context

We discovered that Amazon Bedrock's Nova model crashes during streaming when tool names contain hyphens (`-`). We've implemented a transparent normalization system that converts tool names to camelCase format while preserving original names for display.

## What's Been Completed (Backend)

✅ **All backend changes are complete and working:**

1. **Tool name normalizer** (`src-server/utils/tool-name-normalizer.ts`)
   - Normalizes: `sat-outlook_calendar_view` → `satOutlook_calendarView`
   - Parses into server + tool: `{ server: "sat-outlook", tool: "calendar_view" }`

2. **Runtime integration** (`src-server/runtime/voltagent-runtime.ts`)
   - Normalizes tool names when loading from MCP
   - Stores mapping with parsed data: `{ original, normalized, server, tool }`
   - Single Map lookup for all operations (efficient)

3. **API endpoints updated:**
   - `GET /agents/:slug/tools` - includes `server` and `toolName` fields
   - `GET /agents/:slug/health` - includes parsed tool names in integrations
   - Streaming `tool-input-available` - includes `server` and `tool` fields

## What Needs to Be Done (Frontend)

### 1. Update `src-ui/src/hooks/useStreamingMessage.ts`

**Location**: Line ~130, `tool-input-available` handler

**Change**:
```typescript
// Current
newContentParts.push({
  type: 'tool',
  tool: {
    id: data.toolCallId,
    name: data.toolName,
    args: data.input,
    needsApproval,
    approvalId,
  }
});

// Update to
newContentParts.push({
  type: 'tool',
  tool: {
    id: data.toolCallId,
    name: data.toolName,
    server: data.server,        // ✨ ADD
    toolName: data.tool,        // ✨ ADD
    args: data.input,
    needsApproval,
    approvalId,
  }
});
```

### 2. Update `src-ui/src/components/ChatDock.tsx`

**Location**: Line ~57, ToolCallDisplay component

**Change**:
```typescript
// Current
const tool = toolCall.tool || toolCall;
const name = tool.name || toolCall.type?.replace('tool-', '') || '';

// Update to
const tool = toolCall.tool || toolCall;
const server = tool.server;
const toolName = tool.toolName || tool.name;

// Then in render (around line ~105), replace the name display with:
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
  <span style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
    {isExpanded ? '▼' : '▶'}
  </span>
  
  {server && (
    <span style={{ 
      fontSize: '0.7em',
      padding: '2px 6px',
      background: 'var(--color-bg-tertiary)',
      color: 'var(--text-secondary)',
      borderRadius: '3px',
      fontFamily: 'monospace'
    }}>
      {server}
    </span>
  )}
  
  <span style={{ fontWeight: 500 }}>
    {toolName}
  </span>
  
  {/* Keep existing status icons */}
</div>
```

### 3. Update `src-ui/src/views/AgentEditorView.tsx`

**Find**: Where tools are displayed from `GET /agents/:slug/tools`

**Change**: Use `tool.server` and `tool.toolName` instead of `tool.name`

### 4. Update `src-ui/src/views/SettingsView.tsx`

**Find**: Health check integration tools display

**Change**: Use `tool.server` and `tool.toolName` fields

## Testing Checklist

1. **Start backend**: `npm run dev:server`
2. **Start frontend**: `npm run dev:ui`
3. **Test tool display**:
   - Open agent with MCP tools (e.g., `stallion-workspace:work-agent`)
   - Send message that triggers tool use
   - Verify display shows: `[sat-outlook] calendar_view` (not `satOutlook_calendarView`)
4. **Test Nova streaming**:
   - Switch agent to use Nova model
   - Trigger tool invocation
   - Verify no `NGHTTP2_INTERNAL_ERROR` crash
5. **Check health endpoint**:
   - Navigate to Settings
   - Verify integrations show parsed tool names

## Key Files Reference

- `FRONTEND_CHANGES_NEEDED.md` - Detailed frontend changes
- `TOOL_DISPLAY_MOCKUP.md` - Visual examples of UI
- `AI_SDK_COMPLIANCE.md` - Confirms we're compliant
- `SUMMARY.md` - Complete overview
- `test-nova-camelcase.ts` - Proof that camelCase works

## Expected Result

**Before**: Tool calls show `satOutlook_calendarView` (normalized, ugly)
**After**: Tool calls show `[sat-outlook] calendar_view` (original, clean)

**Nova**: No crashes with normalized names sent to Bedrock
**Users**: Never see normalized names, completely transparent

## Questions?

All backend work is done. Frontend just needs to use the new fields (`server`, `toolName`/`tool`) that the backend is already sending. No parsing needed on frontend!
