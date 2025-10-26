# desktop-ui Specification

## Purpose
TBD - created by archiving change add-work-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Agent Picker

The system SHALL provide a UI for selecting and managing agents.

#### Scenario: Agent list displayed

- **WHEN** user opens the application
- **THEN** the system displays a list of agents with name, model (with fallback indicator if using default), and last modified timestamp

#### Scenario: Agent selected

- **WHEN** user clicks on an agent in the list
- **THEN** the system navigates to the Agent Overview screen showing agent details and action buttons

#### Scenario: Create agent button

- **WHEN** user clicks "New Agent"
- **THEN** the system displays a form to create a new agent.json with name, prompt, model selection, and saves to `.work-agent/agents/<slug>/agent.json`

### Requirement: Chat Interface

The system SHALL provide a chat UI for running conversations with the active agent.

#### Scenario: Message sent

- **WHEN** user types a message and presses Enter
- **THEN** the system sends the message to VoltAgent runtime, displays user message in chat panel, and streams agent response as it arrives

#### Scenario: Tool call visible

- **WHEN** VoltAgent invokes a tool during the conversation
- **THEN** the system displays a tool call indicator in the chat panel with tool name and status (pending/success/error)

#### Scenario: Streaming response

- **WHEN** agent generates a response via Bedrock
- **THEN** the system displays tokens as they stream in real-time in the chat panel

### Requirement: VoltAgent Debugger View

The system SHALL integrate VoltAgent's debugger in a right-side drawer showing execution traces.

#### Scenario: Debugger opened

- **WHEN** user clicks "Debugger" button in chat interface
- **THEN** the system displays a drawer with VoltAgent debugger showing prompts, tool I/O, timings, and execution flow

#### Scenario: Tool invocation traced

- **WHEN** VoltAgent invokes a tool
- **THEN** the debugger displays the tool name, input parameters, execution time, and output result

#### Scenario: Prompt inspection

- **WHEN** user clicks on a trace event in the debugger
- **THEN** the system displays the full prompt sent to Bedrock including system instructions and conversation history

### Requirement: Sessions UI

The system SHALL provide a UI for managing memory sessions per agent.

#### Scenario: Sessions listed

- **WHEN** user navigates to Sessions view for an agent
- **THEN** the system displays a table of sessions with ID, last activity timestamp, and file size

#### Scenario: Session cleared

- **WHEN** user clicks "Clear" on a session
- **THEN** the system prompts for confirmation, clears the session memory, and updates the UI to show empty session

#### Scenario: Session deleted

- **WHEN** user clicks "Delete" on a session
- **THEN** the system prompts for confirmation, deletes the session file, and removes it from the UI list

#### Scenario: Bulk operations

- **WHEN** user selects multiple sessions and clicks "Delete Selected"
- **THEN** the system prompts for confirmation and deletes all selected sessions

### Requirement: Tools Configuration UI

The system SHALL provide a UI for managing agent tools, including catalog selection, allow-lists, and aliases.

#### Scenario: Tool catalog displayed

- **WHEN** user navigates to Tools view for an agent
- **THEN** the system displays available tools from the global catalog with checkboxes to add to agent's `tools.use`

#### Scenario: Tool selected

- **WHEN** user checks a tool checkbox
- **THEN** the system adds the tool ID to agent's `tools.use` array and saves agent.json

#### Scenario: Allow-list configured

- **WHEN** user enters tool IDs in the "Allowed Tools" field
- **THEN** the system updates agent's `tools.allowed` array and saves agent.json

#### Scenario: Alias created

- **WHEN** user adds an alias mapping (e.g., "read" → "@files/read_file")
- **THEN** the system updates agent's `tools.aliases` object and saves agent.json

#### Scenario: MCP server status

- **WHEN** agent has MCP tools configured
- **THEN** the UI displays connection status for each MCP server (green: connected, yellow: starting, red: failed) with reconnect button

### Requirement: Workflows UI

The system SHALL provide a UI for managing VoltAgent workflows per agent.

#### Scenario: Workflows listed

- **WHEN** user navigates to Workflows view for an agent
- **THEN** the system displays workflows found in `agents/<slug>/workflows/` with name and last modified timestamp

#### Scenario: Workflow created

- **WHEN** user clicks "New Workflow"
- **THEN** the system displays a workflow editor (code or visual) for creating VoltAgent workflow definitions using andThen, andAgent, andWhen

#### Scenario: Workflow executed

- **WHEN** user clicks "Run" on a workflow
- **THEN** the system executes the workflow via VoltAgent runtime and displays results in chat interface with debugger traces

### Requirement: Agent Overview

The system SHALL provide an overview screen displaying agent configuration and actions.

#### Scenario: Agent details displayed

- **WHEN** user navigates to Agent Overview
- **THEN** the system displays agent name, prompt excerpt, model, region, guardrails, and configured tools

#### Scenario: Run Chat button

- **WHEN** user clicks "Run Chat"
- **THEN** the system navigates to Chat interface with the agent activated

#### Scenario: Edit Spec button

- **WHEN** user clicks "Edit Spec"
- **THEN** the system displays a form to edit agent.json fields (name, prompt, model, guardrails, tools)

### Requirement: Tauri Desktop App

The system SHALL package the UI as a Tauri desktop application for macOS, Windows, and Linux.

#### Scenario: Application launched

- **WHEN** user opens the desktop application
- **THEN** Tauri launches the React UI and Node/TS VoltAgent runtime in a native window

#### Scenario: File system access

- **WHEN** application needs to read/write `.work-agent/` files
- **THEN** Tauri provides secure file system access via IPC commands between UI and runtime

#### Scenario: Cross-platform build

- **WHEN** building the application for distribution
- **THEN** Tauri produces native installers for macOS (.dmg), Windows (.exe), and Linux (.AppImage)

### Requirement: Configuration Error Display

The system SHALL display actionable error messages when configuration files are invalid.

#### Scenario: Validation error shown

- **WHEN** agent.json fails schema validation
- **THEN** the UI displays an error banner with file path, invalid fields, expected format, and a link to edit the file

#### Scenario: MCP connection failure

- **WHEN** MCP server fails to connect
- **THEN** the UI displays an error notification with server details, error message, and reconnect button

