# tool-orchestration Specification

## Purpose
TBD - created by archiving change add-work-agent-system. Update Purpose after archive.
## Requirements
### Requirement: Dynamic Agent Switching

The system SHALL rebuild VoltAgent context when switching agents, ensuring complete isolation of tools, memory, and MCP connections.

#### Scenario: Agent switch initiated

- **WHEN** user selects a different agent in the UI
- **THEN** the system waits for current agent's in-flight operations (5s timeout), tears down the current VoltAgent context, loads the new agent config, and rebuilds VoltAgent with new tools and memory adapter

#### Scenario: Context teardown

- **WHEN** tearing down an agent context
- **THEN** the system disconnects all MCP servers (stdio/process killed, ws/tcp closed), clears tool registry, and logs teardown events to VoltAgent debugger

#### Scenario: Context build

- **WHEN** building a new agent context
- **THEN** the system loads agent.json, resolves tools from catalog, spawns/connects MCP servers, registers tools with VoltAgent, initializes memory adapter, and logs build events to debugger

#### Scenario: Switch timeout

- **WHEN** in-flight operations exceed 5s timeout during agent switch
- **THEN** the system forces teardown, logs timeout warning to debugger, and proceeds with new agent build

### Requirement: Tool Allow-List Enforcement

The system SHALL enforce tool allow-lists specified in agent configuration, blocking calls to tools not in the allowed set.

#### Scenario: Allowed tool invoked

- **WHEN** VoltAgent attempts to invoke a tool in the agent's `tools.allowed` list
- **THEN** the system permits the invocation and logs to debugger

#### Scenario: Blocked tool invoked

- **WHEN** VoltAgent attempts to invoke a tool NOT in the agent's `tools.allowed` list (or allowed list is empty and tool not in `use`)
- **THEN** the system blocks the invocation, returns an error to VoltAgent, and logs the blocked attempt to debugger with tool name

#### Scenario: Wildcard allow-all

- **WHEN** agent config has `tools.allowed: ["*"]`
- **THEN** the system permits all tools in `tools.use` to be invoked

### Requirement: MCP Server Lifecycle

The system SHALL manage MCP server lifecycle per agent, spawning processes and establishing connections based on tool definitions.

#### Scenario: stdio MCP server spawned

- **WHEN** agent tools include an MCP tool with `transport: "stdio"`
- **THEN** the system spawns a child process with specified command and args, establishes stdio communication, and waits for server ready signal

#### Scenario: ws/tcp MCP server connected

- **WHEN** agent tools include an MCP tool with `transport: "ws"` or `"tcp"`
- **THEN** the system establishes websocket or TCP connection to the specified endpoint and performs MCP handshake

#### Scenario: MCP server fails to start

- **WHEN** MCP server process exits or connection fails within startup timeout
- **THEN** the system logs error to debugger, marks tool as unavailable in UI, and continues with remaining tools

#### Scenario: MCP health check

- **WHEN** agent tool config includes `healthCheck` configuration
- **THEN** the system periodically pings the MCP server and updates UI status indicator (green/yellow/red)

### Requirement: Tool Aliases

The system SHALL support tool aliases defined in agent configuration, allowing agents to reference tools by alternate names.

#### Scenario: Alias resolved

- **WHEN** agent config has `tools.aliases: { "read": "@files/read_file" }`
- **THEN** VoltAgent can invoke the tool using either "read" or "@files/read_file" and both resolve to the same tool implementation

#### Scenario: Alias in allow-list

- **WHEN** agent config has `tools.allowed: ["read"]` and `tools.aliases: { "read": "@files/read_file" }`
- **THEN** the system permits invocations of both "read" and "@files/read_file"

### Requirement: Built-In Tool Registration

The system SHALL register built-in tools (fs_read, fs_write, shell_exec) with VoltAgent's tool registry based on tool definitions.

#### Scenario: fs_read tool registered

- **WHEN** agent uses a tool with `kind: "builtin"` and `builtinPolicy.name: "fs_read"`
- **THEN** the system registers a file read tool with VoltAgent that enforces allowedPaths from the policy

#### Scenario: fs_write tool registered

- **WHEN** agent uses a tool with `kind: "builtin"` and `builtinPolicy.name: "fs_write"`
- **THEN** the system registers a file write tool with VoltAgent that enforces allowedPaths and prevents writes outside allowed directories

#### Scenario: shell_exec tool registered

- **WHEN** agent uses a tool with `kind: "builtin"` and `builtinPolicy.name: "shell_exec"`
- **THEN** the system registers a shell execution tool with VoltAgent that enforces command allow-list and timeout from the policy

### Requirement: Tool Discovery

The system SHALL discover available RPC methods from MCP servers after connection and expose them to VoltAgent.

#### Scenario: MCP capabilities discovered

- **WHEN** MCP server connection is established
- **THEN** the system sends a capabilities request (JSON-RPC), receives the list of available methods, and registers each as a callable tool in VoltAgent's registry

#### Scenario: Tool metadata exposed

- **WHEN** MCP server provides tool metadata (name, description, parameters)
- **THEN** the system passes this metadata to VoltAgent for LLM tool selection and displays it in the UI tools list

