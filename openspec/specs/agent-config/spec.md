# agent-config Specification

## Purpose
TBD - created by archiving change add-work-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Agent Specification Loading
The system SHALL parse agent definitions including optional UI metadata and validate them before activation.

#### Scenario: UI metadata parsed
- **WHEN** `agent.json` includes a `ui` object with keys such as `component`, `quickPrompts`, or `workflowShortcuts`
- **THEN** the loader validates the structure against the updated schema and exposes the metadata to the UI runtime along with the agent definition

#### Scenario: Invalid UI metadata rejected
- **WHEN** `ui` entries are missing required fields (e.g., prompt text) or reference unknown workflow IDs
- **THEN** the system surfaces a validation error identifying the offending field and blocks agent activation

### Requirement: Tool Definition Catalog

The system SHALL maintain a global tool catalog in `.work-agent/tools/<tool-id>/tool.json` that agents can reference and override.

#### Scenario: Tool loaded from catalog

- **WHEN** agent specifies `tools.use: ["files"]`
- **THEN** the system loads `.work-agent/tools/files/tool.json` and registers it with VoltAgent's tool registry

#### Scenario: MCP tool configuration

- **WHEN** tool.json has `kind: "mcp"` with transport, command, args
- **THEN** the system configures MCP connection parameters for VoltAgent's MCP connector

#### Scenario: Built-in tool configuration

- **WHEN** tool.json has `kind: "builtin"` with builtinPolicy
- **THEN** the system registers a built-in tool implementation (fs_read, fs_write, shell_exec) with specified permissions

### Requirement: Application Configuration

The system SHALL read global configuration from `.work-agent/config/app.json` containing region and defaultModel settings.

#### Scenario: Bedrock provider initialization

- **WHEN** the application starts
- **THEN** the system reads `config/app.json`, extracts region and defaultModel, and initializes VoltAgent runtime with @ai-sdk/amazon-bedrock provider using these values

#### Scenario: Missing config file

- **WHEN** `config/app.json` does not exist on first run
- **THEN** the system creates a default config with `region: "us-east-1"` and prompts user to configure Bedrock credentials

### Requirement: Agent Listing

The system SHALL discover and list all agents by scanning `.work-agent/agents/` subdirectories.

#### Scenario: Multiple agents displayed

- **WHEN** user opens the agent picker
- **THEN** the system scans `.work-agent/agents/`, reads each `agent.json`, and displays agent names with last modified timestamps

#### Scenario: Empty agents directory

- **WHEN** `.work-agent/agents/` contains no subdirectories
- **THEN** the system displays "No agents found" with a button to create a new agent

### Requirement: Configuration Validation

The system SHALL validate all JSON configuration files against JSON schemas and provide actionable error messages.

#### Scenario: Schema validation on load

- **WHEN** any config file is loaded (agent.json, tool.json, app.json)
- **THEN** the system validates against the corresponding JSON schema and reports validation errors with file path, field name, and expected format

#### Scenario: File watching

- **WHEN** a config file is modified externally while the app is running
- **THEN** the system detects the change, revalidates, and updates the active configuration (or shows error if invalid)

### Requirement: Agent UI Metadata
The system SHALL allow agent definitions to declare UI customization metadata consumed by the desktop application.

#### Scenario: Component reference configuration
- **WHEN** `agent.json` defines `ui.component: "<component-id>"`
- **THEN** the system records the identifier so the desktop UI can mount the matching React workspace component, and falls back to the default component when the identifier is not registered

#### Scenario: Quick prompt definition
- **WHEN** `agent.json` provides `ui.quickPrompts` entries with `id`, `label`, and plain-text `prompt` strings
- **THEN** the system makes these prompts available to the UI for rendering quick action buttons and for seeding new chat sessions

#### Scenario: Workflow shortcut curation
- **WHEN** `agent.json` specifies `ui.workflowShortcuts` containing workflow file names or IDs
- **THEN** the UI uses that list (instead of showing every workflow) when rendering workflow quick actions; missing workflows raise a validation warning

