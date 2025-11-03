# workspace-config Specification Delta

## ADDED Requirements

### Requirement: Workspace Configuration Loading
The system SHALL load workspace definitions from `.work-agent/workspaces/<slug>/workspace.json` and validate them against the workspace schema.

#### Scenario: Workspace loaded with prompt agent references
- **WHEN** the system loads `workspace.json` containing prompts with `agent: "sa-agent"`
- **THEN** it validates each agent slug exists in `.work-agent/agents/` and associates prompts with their specified agents

#### Scenario: Workspace loaded with prompts without agent
- **WHEN** the system loads `workspace.json` containing prompts without `agent` field
- **THEN** it accepts the configuration and marks those prompts as requiring user agent selection at runtime

#### Scenario: Multi-tab workspace parsed
- **WHEN** `workspace.json` defines multiple tabs with different components
- **THEN** the system validates each tab's component ID and prompt structure, making all tabs available for navigation

#### Scenario: Invalid agent reference rejected
- **WHEN** `workspace.json` contains a prompt referencing a non-existent agent slug
- **THEN** the system returns a validation error identifying the missing agent and prevents workspace activation

### Requirement: Workspace Listing
The system SHALL discover and list all workspaces by scanning `.work-agent/workspaces/` subdirectories.

#### Scenario: Multiple workspaces displayed
- **WHEN** user opens the workspace selector
- **THEN** the system scans `.work-agent/workspaces/`, reads each `workspace.json`, and displays workspace names with icons and descriptions

#### Scenario: Empty workspaces directory
- **WHEN** `.work-agent/workspaces/` contains no subdirectories
- **THEN** the system displays "No workspaces found" with a button to create a new workspace

### Requirement: Workspace Tab Navigation
The system SHALL support multi-tab workspaces where each tab can render a different component with local prompts.

#### Scenario: Tab component resolution
- **WHEN** user switches to a tab with `component: "sa-salesforce-dashboard"`
- **THEN** the system resolves the component from the registry and renders it in the workspace panel

#### Scenario: Tab-specific prompts displayed
- **WHEN** a tab defines local prompts
- **THEN** the quick actions bar shows global prompts plus the active tab's local prompts

#### Scenario: Tab state preservation
- **WHEN** user switches between tabs within a workspace
- **THEN** each tab's component state is preserved (not remounted) until the workspace changes

### Requirement: Global and Local Prompts
The system SHALL support workspace-level global prompts and tab-level local prompts.

#### Scenario: Global prompts available on all tabs
- **WHEN** workspace defines `globalPrompts`
- **THEN** those prompts appear in the quick actions bar regardless of which tab is active

#### Scenario: Local prompts scoped to tab
- **WHEN** user is on a tab with local prompts defined
- **THEN** the quick actions bar shows both global prompts and that tab's local prompts

#### Scenario: No prompts configured
- **WHEN** workspace has no global prompts and active tab has no local prompts
- **THEN** the quick actions bar displays helper text suggesting prompt configuration

### Requirement: Workspace CRUD API
The system SHALL provide REST API endpoints for creating, reading, updating, and deleting workspaces.

#### Scenario: Workspace created via API
- **WHEN** client POSTs to `/workspaces` with valid workspace definition
- **THEN** the system creates `.work-agent/workspaces/<slug>/workspace.json` and returns the created workspace

#### Scenario: Workspace updated via API
- **WHEN** client PUTs to `/workspaces/:slug` with updated configuration
- **THEN** the system validates the changes, updates `workspace.json`, and returns the updated workspace

#### Scenario: Workspace deleted via API
- **WHEN** client DELETEs `/workspaces/:slug`
- **THEN** the system removes the workspace directory and returns success confirmation

#### Scenario: Duplicate slug rejected
- **WHEN** client attempts to create a workspace with an existing slug
- **THEN** the system returns a 409 Conflict error with message identifying the duplicate

### Requirement: Workspace Schema Validation
The system SHALL validate workspace configurations against a JSON schema and provide actionable error messages.

#### Scenario: Required fields validated
- **WHEN** `workspace.json` is missing required fields (name, agent, tabs)
- **THEN** the system returns validation errors identifying each missing field

#### Scenario: Tab structure validated
- **WHEN** a tab is missing required fields (id, label, component)
- **THEN** the system returns validation error identifying the invalid tab and missing fields

#### Scenario: Prompt structure validated
- **WHEN** a prompt is missing required fields (id, label, prompt)
- **THEN** the system returns validation error identifying the invalid prompt

#### Scenario: Optional agent field accepted
- **WHEN** a prompt omits the `agent` field
- **THEN** the system accepts the configuration and will prompt user for agent selection at runtime
