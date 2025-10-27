## ADDED Requirements

### Requirement: Agent CRUD API
The system SHALL expose custom REST endpoints (via VoltAgent's `configureApp`) for creating, updating, and deleting agent configurations.

#### Scenario: Create new agent
- **WHEN** the client sends `POST /agents` with a valid agent specification (name, prompt, optional model/tools/ui)
- **THEN** the system validates the payload against the agent schema, generates a slug from the name, creates `.work-agent/agents/<slug>/agent.json`, and returns the created agent with HTTP 201

#### Scenario: Update existing agent
- **WHEN** the client sends `PUT /agents/:slug` with updated agent fields
- **THEN** the system validates the payload, merges changes into the existing `agent.json`, writes the updated file, reloads the agent if active, and returns the updated agent with HTTP 200

#### Scenario: Delete agent
- **WHEN** the client sends `DELETE /agents/:slug`
- **THEN** the system removes the agent directory `.work-agent/agents/<slug>/` recursively, drains the agent if active, and returns HTTP 204

#### Scenario: Validation failure on mutation
- **WHEN** a POST or PUT request contains invalid data (e.g., missing required fields, invalid model ID)
- **THEN** the system returns HTTP 400 with a JSON error response containing field-level validation messages

### Requirement: Tool Configuration API
The system SHALL expose REST endpoints for managing agent tool configurations.

#### Scenario: List available tools
- **WHEN** the client sends `GET /tools`
- **THEN** the system scans `.work-agent/tools/`, reads each `tool.json`, and returns an array of tool definitions with id, name, kind, and transport

#### Scenario: Add tool to agent
- **WHEN** the client sends `POST /agents/:slug/tools` with a tool ID
- **THEN** the system adds the tool ID to the agent's `tools.use` array, validates the updated spec, writes `agent.json`, and returns the updated tool list with HTTP 200

#### Scenario: Remove tool from agent
- **WHEN** the client sends `DELETE /agents/:slug/tools/:toolId`
- **THEN** the system removes the tool ID from `tools.use`, writes the updated `agent.json`, and returns HTTP 204

#### Scenario: Update tool allow-list
- **WHEN** the client sends `PUT /agents/:slug/tools/allowed` with an array of tool IDs or `["*"]`
- **THEN** the system updates the agent's `tools.allowed` field, validates, writes `agent.json`, and returns the updated config with HTTP 200

#### Scenario: Update tool aliases
- **WHEN** the client sends `PUT /agents/:slug/tools/aliases` with an object mapping alias names to tool IDs
- **THEN** the system updates the agent's `tools.aliases` field, validates, writes `agent.json`, and returns HTTP 200

### Requirement: Workflow File Management API
The system SHALL expose custom REST endpoints for managing workflow files (.ts/.js) on disk, distinct from VoltAgent's built-in workflow execution endpoints.

#### Scenario: List agent workflow files
- **WHEN** the client sends `GET /agents/:slug/workflows/files`
- **THEN** the system scans `.work-agent/agents/<slug>/workflows/`, returns an array of workflow file metadata (id, filename, lastModified, content preview) with HTTP 200

#### Scenario: Create workflow
- **WHEN** the client sends `POST /agents/:slug/workflows` with filename and content (TypeScript or JavaScript)
- **THEN** the system writes the content to `.work-agent/agents/<slug>/workflows/<filename>`, validates syntax if possible, and returns the created workflow metadata with HTTP 201

#### Scenario: Update workflow
- **WHEN** the client sends `PUT /agents/:slug/workflows/:workflowId` with updated content
- **THEN** the system writes the new content to the workflow file and returns HTTP 200

#### Scenario: Delete workflow
- **WHEN** the client sends `DELETE /agents/:slug/workflows/:workflowId`
- **THEN** the system deletes the workflow file from `.work-agent/agents/<slug>/workflows/` and returns HTTP 204

### Requirement: Application Settings API
The system SHALL expose REST endpoints for reading and updating application-level configuration.

#### Scenario: Get current settings
- **WHEN** the client sends `GET /config/app`
- **THEN** the system reads `.work-agent/config/app.json` and returns the configuration object (region, defaultModel, etc.) with HTTP 200

#### Scenario: Update settings
- **WHEN** the client sends `PUT /config/app` with updated configuration fields
- **THEN** the system validates against the app.json schema, writes the updated config to `.work-agent/config/app.json`, updates the runtime configuration, and returns HTTP 200

#### Scenario: Invalid settings rejected
- **WHEN** the client sends `PUT /config/app` with invalid data (e.g., malformed region, unknown model ID)
- **THEN** the system returns HTTP 400 with validation error details

## MODIFIED Requirements

### Requirement: Configuration Validation
The system SHALL validate all JSON configuration files against JSON schemas and provide actionable error messages, including validations for API mutations.

#### Scenario: Schema validation on API mutations
- **WHEN** any configuration mutation API is called (POST/PUT for agents, tools, workflows, app config)
- **THEN** the system validates the request payload and resulting configuration against the corresponding JSON schema, returns detailed validation errors for invalid requests, and only persists valid configurations
