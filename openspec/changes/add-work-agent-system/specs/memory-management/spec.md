# Memory Management Capability

## ADDED Requirements

### Requirement: File-Based Memory Adapter

The system SHALL implement VoltAgent's memory adapter interface with an NDJSON file backend writing to `.work-agent/agents/<slug>/memory/sessions/<session-id>.ndjson`.

#### Scenario: Memory event appended

- **WHEN** VoltAgent runtime calls `memoryAdapter.save(event)`
- **THEN** the system appends the event as a JSON line to the current session's NDJSON file with timestamp

#### Scenario: Session history loaded

- **WHEN** VoltAgent runtime calls `memoryAdapter.load(sessionId)`
- **THEN** the system reads the NDJSON file line-by-line, parses JSON events, and returns them in chronological order

#### Scenario: New session created

- **WHEN** user starts a new chat session
- **THEN** the system generates a unique session ID and creates a new NDJSON file at `memory/sessions/<session-id>.ndjson`

### Requirement: Session Management

The system SHALL provide operations to list, clear, and delete memory sessions per agent.

#### Scenario: Sessions listed

- **WHEN** user opens the Sessions UI for an agent
- **THEN** the system scans `agents/<slug>/memory/sessions/`, lists all `.ndjson` files with session ID, last modified timestamp, and file size

#### Scenario: Session cleared

- **WHEN** user clicks "Clear" on a session
- **THEN** the system truncates the NDJSON file to zero bytes and logs the clear operation to VoltAgent debugger

#### Scenario: Session deleted

- **WHEN** user clicks "Delete" on a session
- **THEN** the system removes the `.ndjson` file from disk and removes the session from the UI list

### Requirement: Agent-Scoped Memory

The system SHALL isolate memory sessions per agent, ensuring agents cannot access other agents' memory.

#### Scenario: Agent switch isolates memory

- **WHEN** user switches from Agent A to Agent B
- **THEN** VoltAgent memory adapter points to Agent B's memory directory, and Agent B cannot read Agent A's session files

#### Scenario: Concurrent sessions

- **WHEN** user runs multiple chat sessions for the same agent
- **THEN** each session writes to its own NDJSON file without conflicts

### Requirement: Memory Adapter Interface

The system SHALL implement VoltAgent's memory adapter interface methods (save, load, clear, list).

#### Scenario: Save method

- **WHEN** `memoryAdapter.save(event)` is called
- **THEN** the system appends event to the active session's NDJSON file atomically

#### Scenario: Load method

- **WHEN** `memoryAdapter.load(sessionId, options)` is called
- **THEN** the system reads the session file, optionally limits to last N events, and returns parsed array

#### Scenario: Clear method

- **WHEN** `memoryAdapter.clear(sessionId)` is called
- **THEN** the system truncates the session file and confirms success

#### Scenario: List method

- **WHEN** `memoryAdapter.list()` is called
- **THEN** the system returns metadata for all sessions (id, timestamp, size) in the current agent's memory directory
