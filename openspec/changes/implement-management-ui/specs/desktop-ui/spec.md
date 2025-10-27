## ADDED Requirements

### Requirement: Agent Editor UI
The system SHALL provide a multi-step form interface for creating and editing agent configurations.

#### Scenario: New agent form
- **WHEN** the user clicks "New Agent" in the management dropdown
- **THEN** the system navigates to a form view with fields for name, prompt, model, region, guardrails, tools selection, and UI customization options

#### Scenario: Edit existing agent
- **WHEN** the user clicks "Edit Agent" with an agent selected
- **THEN** the system navigates to the agent editor pre-populated with the current agent's configuration

#### Scenario: Form validation
- **WHEN** the user fills out the agent form and clicks Save
- **THEN** the system validates all fields against the agent schema, displays inline error messages for invalid fields, and only submits when all validation passes

#### Scenario: Save new agent
- **WHEN** the user submits a valid new agent form
- **THEN** the system sends `POST /agents` with the form data, displays a success toast on HTTP 201, and navigates back to the main view with the new agent selected

#### Scenario: Save agent updates
- **WHEN** the user submits changes to an existing agent
- **THEN** the system sends `PUT /agents/:slug` with the updated data, displays a success toast on HTTP 200, and refreshes the agent in the dropdown

#### Scenario: Delete agent confirmation
- **WHEN** the user clicks "Delete Agent" in the editor
- **THEN** the system displays a confirmation modal warning that all data (config, workflows, memory) will be removed; on confirmation, sends `DELETE /agents/:slug` and navigates to the main view

### Requirement: Tool Management UI
The system SHALL provide an interface for configuring agent tools from the global catalog.

#### Scenario: Tool catalog view
- **WHEN** the user clicks "Manage Tools" with an agent selected
- **THEN** the system navigates to a view showing the global tool catalog on the left and the agent's current tools on the right

#### Scenario: Add tool to agent
- **WHEN** the user checks a tool checkbox in the catalog
- **THEN** the system sends `POST /agents/:slug/tools` with the tool ID, updates the UI to show the tool as enabled, and displays a success toast

#### Scenario: Remove tool from agent
- **WHEN** the user unchecks a tool checkbox
- **THEN** the system sends `DELETE /agents/:slug/tools/:toolId`, updates the UI, and displays a success toast

#### Scenario: Configure allow-list
- **WHEN** the user enters tool IDs in the "Allowed Tools" input field
- **THEN** the system sends `PUT /agents/:slug/tools/allowed` with the array of tool IDs, validates the list, and displays success or error feedback

#### Scenario: Configure aliases
- **WHEN** the user adds or edits tool alias mappings
- **THEN** the system sends `PUT /agents/:slug/tools/aliases` with the updated aliases object and displays feedback

#### Scenario: MCP status indicator
- **WHEN** the tool catalog includes MCP tools
- **THEN** the system displays connection status badges (connected/starting/failed) and provides a "Reconnect" button for failed MCP servers

### Requirement: Workflow Management UI
The system SHALL provide an interface for viewing, creating, and editing VoltAgent workflows.

#### Scenario: Workflow list view
- **WHEN** the user clicks "Manage Workflows" with an agent selected
- **THEN** the system navigates to a view showing all workflows for the agent as cards with name, file extension, and last modified date

#### Scenario: Create new workflow
- **WHEN** the user clicks "New Workflow"
- **THEN** the system displays a form prompting for a workflow name and initial template choice (blank, sequence, conditional), creates a `.ts` file with the template content, and opens the workflow editor

#### Scenario: Edit workflow
- **WHEN** the user clicks "Edit" on a workflow card
- **THEN** the system opens a code editor (textarea with monospace font) pre-populated with the workflow file content

#### Scenario: Save workflow changes
- **WHEN** the user edits workflow content and clicks Save
- **THEN** the system sends `PUT /agents/:slug/workflows/:id` with the updated content, validates syntax if possible, and displays success or error feedback

#### Scenario: Delete workflow confirmation
- **WHEN** the user clicks "Delete" on a workflow
- **THEN** the system displays a confirmation modal; on confirmation, sends `DELETE /agents/:slug/workflows/:id` and removes the workflow from the list

#### Scenario: Run workflow from editor
- **WHEN** the user clicks "Run" in the workflow editor
- **THEN** the system triggers workflow execution via the agent, opens the chat dock, and displays results in a new conversation tab

### Requirement: Settings and Developer Tools UI
The system SHALL provide a settings interface for configuring application-level options and inspecting runtime state.

#### Scenario: Settings page access
- **WHEN** the user clicks the settings/gear icon in the UI header
- **THEN** the system navigates to a tabbed settings view with sections for General, Advanced, and Debug

#### Scenario: General settings tab
- **WHEN** the user opens the General tab
- **THEN** the system displays fields for API Base URL, AWS Region, and Default Model with current values pre-filled

#### Scenario: Update settings
- **WHEN** the user edits settings fields and clicks Save
- **THEN** the system sends `PUT /config/app` with the updated configuration, displays success feedback, and updates the UI to reflect the new settings

#### Scenario: Test connection
- **WHEN** the user clicks "Test Connection" in the settings
- **THEN** the system attempts to list available Bedrock models using the current credentials and displays success or error feedback with details

#### Scenario: Reset to defaults
- **WHEN** the user clicks "Reset to Defaults" in the settings
- **THEN** the system displays a confirmation modal; on confirmation, resets `app.json` to factory defaults and reloads the configuration

#### Scenario: Advanced settings tab
- **WHEN** the user opens the Advanced tab
- **THEN** the system displays options for log level, memory retention policy, and MCP connection timeouts

#### Scenario: Debug tab
- **WHEN** the user opens the Debug tab
- **THEN** the system displays runtime diagnostics including loaded agents, active MCP connections, memory usage, and a button to export logs

## MODIFIED Requirements

### Requirement: Agent Picker
The system SHALL expose agent selection and management controls via a global dropdown accessible from any workspace, with functional navigation to management views.

#### Scenario: Management action navigation
- **WHEN** the user clicks a management button in the agent selector ("New Agent", "Edit Agent", "Manage Tools", "Manage Workflows")
- **THEN** the system navigates to the corresponding full-screen management view and closes the dropdown
