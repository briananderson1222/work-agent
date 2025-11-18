# Work Workspace Plugin

A comprehensive workspace plugin for Work Agent that provides calendar and CRM functionality with integrated AI agents.

## Features

- **Calendar Component**: View and manage calendar events with Outlook integration
- **CRM Component**: Manage Salesforce accounts and opportunities
- **Integrated Agents**: Dedicated calendar and CRM agents with specialized tools
- **SDK Integration**: Uses `@stallion-ai/sdk` for seamless core app integration

## Components

### Calendar
- View daily calendar events
- Get meeting details
- Quick actions for common calendar queries
- Integrated with `sat-outlook` MCP server

### CRM
- Browse accounts and opportunities
- View pipeline summaries
- Account management actions
- Integrated with `sat-sfdc` MCP server

## Agents

### Calendar Agent (`work-workspace:calendar-agent`)
- Specialized in calendar and meeting management
- Has access to Outlook tools via `sat-outlook` MCP server
- Auto-approves safe calendar operations

### CRM Agent (`work-workspace:crm-agent`)
- Specialized in Salesforce CRM operations
- Has access to SFDC tools via `sat-sfdc` MCP server
- Auto-approves safe query operations

## Installation

```bash
work-agent plugin install github:work-agent/plugins#work-workspace
```

## Usage

1. Navigate to the Work workspace in the UI
2. Switch between Calendar and CRM tabs
3. Click on items to get details via the integrated agents
4. Use quick actions for common queries
5. Open chat dock for detailed agent interactions

## Development

This plugin demonstrates the work-agent plugin architecture:
- Workspace-owned agents with namespacing
- SDK hook usage for core app integration
- Component-based UI with tab navigation
- MCP tool integration for external services
