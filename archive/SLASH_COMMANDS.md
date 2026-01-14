# Slash Commands

The chat interface now supports slash commands for quick access to agent information with autocomplete.

## Autocomplete

Type `/` in the chat input to see all available commands. The list filters as you type:
- **Arrow Up/Down**: Navigate through commands
- **Tab or Enter**: Select the highlighted command
- **Escape**: Close autocomplete
- **Click**: Select a command with mouse

## Available Commands

### `/mcp`
Lists all MCP servers configured for the current agent.

**Example output:**
```
**MCP Servers for Work Agent:**

• sat-outlook
• sat-sfdc
• aws-knowledge-mcp-server
```

### `/tools`
Shows all available tools for the current agent, including:
- Available tools (with wildcard patterns)
- Auto-approved tools
- Complete list of all tools in the system

**Example output:**
```
**Tools for Work Agent:**

**Available:** sat-outlook_*, sat-sfdc_query, sat-sfdc_get_*

**Auto-approved:** sat-outlook_calendar_view, sat-outlook_email_read, sat-sfdc_query

**All Tools:**
• sat-outlook (mcp)
• sat-sfdc (mcp)
• aws-knowledge-mcp-server (mcp)
```

## Usage

Simply type the command in the chat input and press Enter. The response will appear as a system message in the chat.

## Implementation Details

- Slash commands are intercepted before being sent to the agent
- Commands are processed client-side by fetching data from the API
- Results are displayed as system messages (styled differently from user/assistant messages)
- Unknown commands show a help message with available commands
