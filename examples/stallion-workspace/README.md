# Stallion Workspace Plugin

Calendar and CRM workspace plugin for Work Agent with enhanced features.

## Features

- **Calendar View**: Full-featured calendar with event management
- **CRM View**: Customer relationship management interface
- **Agent Integration**: Works with any configured agent
- **Flexible Navigation**: Tab-based workspace switching

## Installation

```bash
# Install from local directory
work-agent plugin install ./examples/stallion-workspace

# Or from npm (when published)
npm install @work-agent/stallion-workspace
```

## Components

- `Calendar.tsx` (2074 lines) - Enhanced calendar with event management
- `CRM.tsx` (1035 lines) - Enhanced CRM interface
- `hooks.ts` - Shared hooks for workspace functionality

## Configuration

The plugin includes:
- Agent definition in `agents/work-agent/agent.json`
- Workspace configuration in `workspace.json`
- Component exports in `src/index.tsx`

## Usage

After installation, the workspace will be available in the workspace selector.
