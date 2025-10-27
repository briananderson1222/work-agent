## MODIFIED Requirements
### Requirement: Agent Specification Loading
The system SHALL parse agent definitions including optional UI metadata and validate them before activation.

#### Scenario: UI metadata parsed
- **WHEN** `agent.json` includes a `ui` object with keys such as `component`, `quickPrompts`, or `workflowShortcuts`
- **THEN** the loader validates the structure against the updated schema and exposes the metadata to the UI runtime along with the agent definition

#### Scenario: Invalid UI metadata rejected
- **WHEN** `ui` entries are missing required fields (e.g., prompt text) or reference unknown workflow IDs
- **THEN** the system surfaces a validation error identifying the offending field and blocks agent activation

## ADDED Requirements
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
