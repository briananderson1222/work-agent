# desktop-ui Specification

## Purpose
TBD - created by archiving change add-work-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Agent Picker
The system SHALL expose agent selection and management controls via a global dropdown accessible from any workspace.

#### Scenario: Agent dropdown selector
- **WHEN** the user opens the global agent selector
- **THEN** the system displays a searchable dropdown of agents with name, model (including fallback indicator), and last modified timestamp without navigating away from the current screen

#### Scenario: Management shortcuts surfaced
- **WHEN** the agent selector dropdown is visible
- **THEN** the system presents actions to create a new agent, edit the highlighted agent, and open tools/workflows management so backend capabilities remain one click away

### Requirement: Chat Interface
The system SHALL render the chat experience inside a docked panel that supports multi-session workflows without obscuring the workspace.

#### Scenario: Docked chat layout
- **WHEN** the chat interface is rendered
- **THEN** it appears as a bottom dock that can collapse to a slim header or expand up to 40% of the viewport height while keeping the agent workspace visible

#### Scenario: Drawer opens from quick action
- **WHEN** the user triggers a quick prompt or workflow run
- **THEN** the system opens the dock (if collapsed), focuses the relevant conversation tab, and scrolls to the newest message in that session

#### Scenario: Multi-agent session tabs
- **WHEN** the user runs conversations for multiple agents or workflows in parallel
- **THEN** each session is represented as a tab labeled with agent name and context, and closing a tab ends only that session without draining other agents

#### Scenario: Dock activity indicator
- **WHEN** a response or tool event arrives while the dock is collapsed
- **THEN** the dock header shows an unread badge and the UI emits a toast naming the agent/session so the user can follow up

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
The system SHALL render an agent-specific workspace surface driven by configuration while preserving a sensible default layout.

#### Scenario: Agent workspace component
- **WHEN** an agent is activated
- **THEN** the system mounts the React component referenced by `agent.json -> ui.component` to render the main workspace content area

#### Scenario: Missing component fallback
- **WHEN** `ui.component` is absent or the identifier is unknown
- **THEN** the system renders the default workspace component and records a warning for diagnostics

#### Scenario: Work-agent default workspace
- **WHEN** the `work-agent` configuration is active with the default component
- **THEN** the workspace presents a two-panel layout showing a scrollable day calendar on the left and a detail inspector pane on the right for the selected event

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

### Requirement: Agent Quick Actions
The system SHALL surface configurable prompt/workflow shortcuts adjacent to the agent selector so users can launch common tasks rapidly.

#### Scenario: Prompt quick action buttons
- **WHEN** an agent defines `ui.quickPrompts`
- **THEN** the system renders labeled buttons near the agent selector so users can launch those prompts without opening the dock manually

#### Scenario: Workflow shortcuts
- **WHEN** workflows are available for an agent and are flagged for shortcuts
- **THEN** the system renders buttons alongside prompt actions; invoking one runs the workflow and directs output to the associated chat tab

#### Scenario: Action status indicator
- **WHEN** a quick action is executing
- **THEN** its button displays a loading state until the agent response begins streaming or the workflow reports completion

#### Scenario: No workflow shortcuts configured
- **WHEN** an agent lacks `ui.workflowShortcuts`
- **THEN** the quick action area hides workflow buttons and displays helper text guiding the user to add shortcuts from the agent configuration view

