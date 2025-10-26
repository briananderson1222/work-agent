# agent-config Specification

## Purpose
TBD - created by archiving change add-work-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Agent Specification Loading

The system SHALL load agent specifications from `.work-agent/agents/<slug>/agent.json` files and validate them against a JSON schema before initializing VoltAgent instances.

#### Scenario: Valid agent loaded

- **WHEN** user selects an agent from the picker
- **THEN** the system reads `agent.json`, validates the schema, and creates a VoltAgent agent instance with the specified name, prompt, model, guardrails, and tool configuration

#### Scenario: Invalid agent rejected

- **WHEN** `agent.json` contains invalid structure (missing required fields, wrong types)
- **THEN** the system displays a validation error with specific field issues and prevents agent activation

#### Scenario: Model fallback

- **WHEN** agent.json does not specify a `model` field
- **THEN** the system uses `defaultModel` from `config/app.json` and displays a fallback indicator in the UI

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

