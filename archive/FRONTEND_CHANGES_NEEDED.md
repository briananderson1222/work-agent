# Frontend Changes for Tool Name Display

## Backend Already Sends Parsed Names

The backend now sends `server` and `toolName` (or `tool`) fields separately, so **no parsing needed on frontend**!

## Files That Need Updates

### 1. `src-ui/src/hooks/useStreamingMessage.ts`

**Current**: Stores `data.toolName` directly
**Change**: Store server and tool separately

```typescript
// Line ~130 - tool-input-available handler
newContentParts.push({
  type: 'tool',
  tool: {
    id: data.toolCallId,
    name: data.toolName,              // Normalized (for internal use)
    server: data.server,              // ✨ MCP server name
    toolName: data.tool,              // ✨ Tool name only
    args: data.input,
    needsApproval,
    approvalId,
  }
});
```

### 2. `src-ui/src/components/ChatDock.tsx`

**Current**: Displays `tool.name` directly (line ~57)
**Change**: Display server and tool separately (already parsed by backend)

```typescript
// Line ~57 - ToolCallDisplay component
const tool = toolCall.tool || toolCall;
const id = tool.id || toolCall.toolCallId || '';
const server = tool.server;           // ✨ Already parsed
const toolName = tool.toolName;       // ✨ Already parsed

// Then in the render (line ~105):
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
  
  {/* Status icons */}
  {result && !error && <span style={{ color: 'var(--success-primary)' }}>✓</span>}
  {error && <span style={{ color: 'var(--error-primary)' }}>✗</span>}
</div>
```

### 3. `src-ui/src/views/AgentEditorView.tsx`

**Current**: Displays tool names from `/agents/:slug/tools`
**Change**: Use `server` and `toolName` fields

```typescript
// When fetching tools, use parsed fields
const toolsResponse = await fetch(`${apiBase}/agents/${slug}/tools`);
const { data: tools } = await toolsResponse.json();

// Display
tools.map(tool => (
  <div key={tool.id}>
    {tool.server && <span className="server-badge">{tool.server}</span>}
    <span>{tool.toolName}</span>
  </div>
))
```

### 4. `src-ui/src/views/SettingsView.tsx` (Health Check Display)

**Current**: Shows integrations from health check
**Change**: Display tools with server and toolName

```typescript
// When displaying integration tools
integration.metadata?.tools?.map(tool => (
  <div key={tool.name}>
    {tool.server && <span className="server-badge">{tool.server}</span>}
    <span>{tool.toolName}</span>
  </div>
))
```

## API Response Examples

### GET /agents/:slug/tools
```json
{
  "success": true,
  "data": [
    {
      "id": "satOutlook_calendarView",
      "name": "satOutlook_calendarView",
      "originalName": "sat-outlook_calendar_view",
      "server": "sat-outlook",
      "toolName": "calendar_view",
      "description": "Display calendar views",
      "parameters": {}
    }
  ]
}
```

### Streaming Event: tool-input-available
```json
{
  "type": "tool-input-available",
  "toolCallId": "call_abc123",
  "toolName": "satOutlook_calendarView",
  "originalToolName": "sat-outlook_calendar_view",
  "server": "sat-outlook",
  "tool": "calendar_view",
  "input": {
    "view": "day",
    "start_date": "11-20-2025"
  }
}
```

### GET /agents/:slug/health
```json
{
  "integrations": [
    {
      "id": "sat-outlook",
      "type": "mcp",
      "connected": true,
      "metadata": {
        "tools": [
          {
            "name": "satOutlook_calendarView",
            "originalName": "sat-outlook_calendar_view",
            "server": "sat-outlook",
            "toolName": "calendar_view",
            "description": "Display calendar views"
          }
        ]
      }
    }
  ]
}
```

## Summary

**No parsing needed on frontend!** Backend sends:
- `server`: MCP server name (e.g., `"sat-outlook"`)
- `toolName` or `tool`: Tool name only (e.g., `"calendar_view"`)

Just display them directly.
