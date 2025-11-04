# SA Dashboard Plugin

Stallion AI workspace dashboard with calendar and SFDC integration.

## Features

- **Calendar View**: Displays today's meetings from Outlook via MCP
- **Meeting Details**: Click any meeting to see full details, attendees, and body
- **SFDC Integration**: Shows related accounts and opportunities
- **Session Caching**: 5-minute cache for calendar and SFDC data
- **AI Analysis**: Send meeting context to chat dock for AI analysis

## Capabilities

- `chat`: Send prompts to chat dock
- `mcp`: Use MCP tools (sat-outlook, sat-sfdc)
- `storage`: Session storage for caching

## Permissions

- `storage.session`: Required for caching calendar and SFDC data

## Keyboard Shortcuts

- `⌘R`: Refresh dashboard data

## MCP Tools Used

- `sat-outlook_calendar_view`: Load today's calendar
- `sat-outlook_calendar_get_event`: Get meeting details
- `sat-sfdc_query`: Query Salesforce data

## Configuration

The dashboard respects meeting notification settings from app config:

```json
{
  "meetingNotifications": {
    "enabled": true,
    "thresholds": [30, 10, 1]
  }
}
```
