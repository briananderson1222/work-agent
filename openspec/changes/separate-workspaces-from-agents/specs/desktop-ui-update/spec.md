# desktop-ui Specification Delta

## REMOVED Requirements

### Requirement: Agent Picker
~~The system SHALL expose agent selection and management controls via a global dropdown accessible from any workspace.~~

#### Scenario: Agent dropdown selector
~~- **WHEN** the user opens the global agent selector~~
~~- **THEN** the system displays a searchable dropdown of agents with name, model (including fallback indicator), and last modified timestamp without navigating away from the current screen~~

#### Scenario: Management shortcuts surfaced
~~- **WHEN** the agent selector dropdown is visible~~
~~- **THEN** the system presents actions to create a new agent, edit the highlighted agent, and open tools/workflows management so backend capabilities remain one click away~~

### Requirement: Agent Quick Actions
~~The system SHALL surface configurable prompt/workflow shortcuts adjacent to the agent selector so users can launch common tasks rapidly.~~

#### Scenario: Prompt quick action buttons
~~- **WHEN** an agent defines `ui.quickPrompts`~~
~~- **THEN** the system renders labeled buttons near the agent selector so users can launch those prompts without opening the dock manually~~

#### Scenario: Workflow shortcuts
~~- **WHEN** workflows are available for an agent and are flagged for shortcuts~~
~~- **THEN** the system renders buttons alongside prompt actions; invoking one runs the workflow and directs output to the associated chat tab~~

#### Scenario: No workflow shortcuts configured
~~- **WHEN** an agent lacks `ui.workflowShortcuts`~~
~~- **THEN** the quick action area hides workflow buttons and displays helper text guiding the user to add shortcuts from the agent configuration view~~

### Requirement: Agent Overview
~~The system SHALL render an agent-specific workspace surface driven by configuration while preserving a sensible default layout.~~

#### Scenario: Agent workspace component
~~- **WHEN** an agent is activated~~
~~- **THEN** the system mounts the React component referenced by `agent.json -> ui.component` to render the main workspace content area~~

#### Scenario: Missing component fallback
~~- **WHEN** `ui.component` is absent or the identifier is unknown~~
~~- **THEN** the system renders the default workspace component and records a warning for diagnostics~~

#### Scenario: Work-agent default workspace
~~- **WHEN** the `work-agent` configuration is active with the default component~~
~~- **THEN** the workspace presents a two-panel layout showing a scrollable day calendar on the left and a detail inspector pane on the right for the selected event~~

## ADDED Requirements

### Requirement: Workspace Selector
The system SHALL expose workspace selection and management controls via a global dropdown accessible from any view.

#### Scenario: Workspace dropdown selector
- **WHEN** the user opens the global workspace selector
- **THEN** the system displays a searchable dropdown of workspaces with name, icon, and description without navigating away from the current screen

#### Scenario: Workspace management shortcuts
- **WHEN** the workspace selector dropdown is visible
- **THEN** the system presents actions to create a new workspace, edit the current workspace, and open settings

#### Scenario: Agent management moved to settings
- **WHEN** user needs to create or edit agents
- **THEN** they navigate to Settings view where agent management is located alongside other configuration options

### Requirement: Workspace Tab Navigation
The system SHALL render multi-tab workspaces with tab navigation controls and preserve tab state during navigation.

#### Scenario: Tab bar displayed
- **WHEN** a workspace with multiple tabs is active
- **THEN** the system displays a tab bar below the workspace selector showing all tab labels with icons

#### Scenario: Tab switching
- **WHEN** user clicks a different tab
- **THEN** the system switches the active tab, renders that tab's component, and updates quick actions to show global + local prompts

#### Scenario: Single-tab workspace
- **WHEN** a workspace has only one tab
- **THEN** the system hides the tab bar and renders the single tab's component directly

#### Scenario: Tab state preservation
- **WHEN** user switches between tabs
- **THEN** each tab's component state is preserved (not remounted) until the workspace changes

### Requirement: Agent Selection for Prompts
The system SHALL prompt users to select an agent when executing prompts or sending messages without a specified agent.

#### Scenario: Prompt without agent shows selector
- **WHEN** user clicks a prompt button that has no `agent` field
- **THEN** the system displays an agent selector modal, waits for user selection, then sends the prompt to the selected agent

#### Scenario: sendToChat without agent shows selector
- **WHEN** workspace component calls `onSendToChat(text)` without specifying an agent
- **THEN** the system displays an agent selector modal, waits for user selection, then sends the message to the selected agent

#### Scenario: Agent selection remembered per session
- **WHEN** user selects an agent for a prompt without agent specified
- **THEN** the system creates a chat session associated with that agent and subsequent messages in that session use the same agent

#### Scenario: Prompt with agent skips selector
- **WHEN** user clicks a prompt button that specifies `agent: "sa-agent"`
- **THEN** the system immediately sends the prompt to the specified agent without showing the selector

### Requirement: Workspace Quick Actions
The system SHALL surface global and tab-specific prompts in the quick actions bar.

#### Scenario: Global prompts always visible
- **WHEN** workspace defines global prompts
- **THEN** the quick actions bar displays those prompts regardless of active tab

#### Scenario: Tab-specific prompts added
- **WHEN** active tab defines local prompts
- **THEN** the quick actions bar displays global prompts followed by the tab's local prompts

#### Scenario: Prompt execution with agent reference
- **WHEN** user clicks a prompt button with `agent` specified
- **THEN** the system creates a chat session using the agent specified in the prompt definition and sends the prompt text

#### Scenario: Prompt execution without agent reference
- **WHEN** user clicks a prompt button without `agent` specified
- **THEN** the system shows agent selector modal, waits for selection, then creates chat session with selected agent

#### Scenario: No prompts configured
- **WHEN** workspace has no global prompts and active tab has no local prompts
- **THEN** the quick actions bar displays helper text suggesting workspace configuration

### Requirement: Workspace Component Rendering
The system SHALL render workspace tabs using component IDs and maintain a component registry.

#### Scenario: Tab component resolution
- **WHEN** a tab specifies `component: "sa-salesforce-dashboard"`
- **THEN** the system resolves the component from the registry and renders it in the workspace panel

#### Scenario: Missing component fallback
- **WHEN** a tab's component ID is not registered
- **THEN** the system renders a default placeholder component and logs a warning

#### Scenario: Component receives workspace context
- **WHEN** a workspace component is rendered
- **THEN** it receives props including the workspace definition, active tab, and callback functions including `onSendToChat(text, agent?)` where agent is optional and triggers agent selection if omitted

### Requirement: Workspace Management UI
The system SHALL provide a UI for creating, editing, and deleting workspaces.

#### Scenario: Workspace editor view
- **WHEN** user clicks "Edit Workspace" or "New Workspace"
- **THEN** the system displays a form for configuring workspace name, agent reference, tabs, and prompts

#### Scenario: Tab configuration
- **WHEN** user edits workspace tabs
- **THEN** the form allows adding/removing tabs, setting tab labels, selecting components, and defining tab-specific prompts

#### Scenario: Agent selection in workspace editor
- **WHEN** user configures workspace agent reference
- **THEN** the form displays a dropdown of available agents with their names and models

#### Scenario: Workspace saved
- **WHEN** user saves workspace configuration
- **THEN** the system validates the configuration, creates/updates `workspace.json`, and refreshes the workspace list

### Requirement: Settings View with Agent Management
The system SHALL provide a Settings view containing agent management alongside other configuration options.

#### Scenario: Settings navigation
- **WHEN** user clicks Settings button in workspace selector or toolbar
- **THEN** the system navigates to Settings view showing sections for Agents, Workspaces, and App Configuration

#### Scenario: Agent CRUD in settings
- **WHEN** user is in Settings > Agents section
- **THEN** they can create, edit, and delete agents using forms that configure only AI-related fields

#### Scenario: Workspace CRUD in settings
- **WHEN** user is in Settings > Workspaces section
- **THEN** they can create, edit, and delete workspaces using forms that configure UI and prompt definitions

## MODIFIED Requirements

### Requirement: Chat Interface
The system SHALL render the chat experience inside a docked panel that supports multi-session workflows without obscuring the workspace.

#### Scenario: Chat uses prompt's agent
- **WHEN** user sends a message in the chat dock from a prompt
- **THEN** the system uses the agent specified in the prompt definition for AI interactions

#### Scenario: Multi-agent session tabs
- **WHEN** user runs conversations with different agents in parallel
- **THEN** each session is represented as a tab labeled with agent name and context

#### Scenario: Action status indicator
- **WHEN** a quick action is executing
- **THEN** its button displays a loading state until the prompt's specified agent response begins streaming
