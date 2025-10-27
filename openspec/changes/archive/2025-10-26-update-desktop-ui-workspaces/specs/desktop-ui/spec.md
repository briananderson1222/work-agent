## MODIFIED Requirements
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

## ADDED Requirements
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
