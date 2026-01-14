# Frontend Integration - Tool Name Display

## Overview

Tool name normalization is **completely internal**. The frontend receives original tool names in all API responses and streaming events.

## API Responses

### 1. Agent Tools Endpoint

```bash
GET /agents/:slug/tools
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "satOutlook_calendarView",
      "name": "satOutlook_calendarView",
      "originalName": "sat-outlook_calendar_view",
      "description": "Display daily, weekly, or monthly calendar views",
      "parameters": { }
    }
  ]
}
```

**Frontend displays:** `sat-outlook_calendar_view` (from `originalName`)

### 2. Agent Health Check

```bash
GET /agents/:slug/health
```

**Response:**
```json
{
  "success": true,
  "healthy": true,
  "integrations": [
    {
      "id": "sat-outlook",
      "type": "mcp",
      "connected": true,
      "metadata": {
        "transport": "stdio",
        "toolCount": 15,
        "tools": [
          {
            "name": "satOutlook_calendarView",
            "originalName": "sat-outlook_calendar_view",
            "description": "Display calendar views"
          }
        ]
      }
    }
  ]
}
```

**Frontend displays:**
- MCP Server: `sat-outlook` (from `id`)
- Tools: `sat-outlook_calendar_view` (from `originalName`)

## Streaming Events

### Tool Call Event

```json
{
  "type": "tool-input-available",
  "toolCallId": "call_abc123",
  "toolName": "satOutlook_calendarView",
  "originalToolName": "sat-outlook_calendar_view",
  "input": {
    "view": "day",
    "start_date": "11-20-2025"
  }
}
```

**Frontend displays:** `sat-outlook_calendar_view` (from `originalToolName`)

## Display Logic

Store mapping when receiving tool-input-available and use it for displaying results.

## Key Points

1. **Never show normalized names** to users
2. **Always use originalName fields**
3. **MCP server names** from agent config
4. **Tool names** from MCP server
5. **Normalization is transparent**
