# Tool Display Mockup

## Chat Interface - Tool Call Display

### Option 1: Inline with Separator
```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                            │
├─────────────────────────────────────────────────────────┤
│ Let me check your calendar for today.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ▶ sat-outlook › calendar_view                    ✓ │ │
│ │   view: "day", start_date: "11-20-2025"            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ You have 3 meetings scheduled for today...             │
└─────────────────────────────────────────────────────────┘
```

### Option 2: Server Badge + Tool Name
```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                            │
├─────────────────────────────────────────────────────────┤
│ Let me check your calendar for today.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ▶ [sat-outlook] calendar_view                    ✓ │ │
│ │   view: "day", start_date: "11-20-2025"            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ You have 3 meetings scheduled for today...             │
└─────────────────────────────────────────────────────────┘
```

### Option 3: Two-Line Display
```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                            │
├─────────────────────────────────────────────────────────┤
│ Let me check your calendar for today.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ▶ calendar_view                                  ✓ │ │
│ │   sat-outlook                                       │ │
│ │   view: "day", start_date: "11-20-2025"            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ You have 3 meetings scheduled for today...             │
└─────────────────────────────────────────────────────────┘
```

## Agent Settings - Tools List

```
┌─────────────────────────────────────────────────────────┐
│ MCP Integrations                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ✓ sat-outlook (15 tools)                               │
│   ├─ calendar_view                                     │
│   ├─ email_search                                      │
│   ├─ meeting_details                                   │
│   └─ ...                                               │
│                                                         │
│ ✓ sat-sfdc (8 tools)                                   │
│   ├─ query                                             │
│   ├─ get_account                                       │
│   ├─ get_opportunity                                   │
│   └─ ...                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Health Check - Integration Status

```
┌─────────────────────────────────────────────────────────┐
│ Integration Health                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ sat-outlook                                             │
│ ├─ Status: ✓ Connected                                │
│ ├─ Transport: stdio                                    │
│ ├─ Tools: 15                                           │
│ └─ Available Tools:                                    │
│    • calendar_view - Display calendar views            │
│    • email_search - Search emails                      │
│    • meeting_details - Get meeting information         │
│                                                         │
│ sat-sfdc                                                │
│ ├─ Status: ✓ Connected                                │
│ ├─ Transport: stdio                                    │
│ ├─ Tools: 8                                            │
│ └─ Available Tools:                                    │
│    • query - Query Salesforce                          │
│    • get_account - Get account details                 │
│    • get_opportunity - Get opportunity details         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Recommended: Option 2 (Server Badge)

**Rationale**:
- Clear visual separation between server and tool
- Compact single-line display
- Server name is de-emphasized (gray badge)
- Tool name is prominent
- Easy to scan

**Implementation**:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
  <span style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
    {isExpanded ? '▼' : '▶'}
  </span>
  
  {mcpServer && (
    <span style={{ 
      fontSize: '0.7em',
      padding: '2px 6px',
      background: 'var(--color-bg-tertiary)',
      color: 'var(--text-secondary)',
      borderRadius: '3px',
      fontFamily: 'monospace'
    }}>
      {mcpServer}
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
