# agent-config Specification Delta

## REMOVED Requirements

### Requirement: Agent UI Metadata
~~The system SHALL allow agent definitions to declare UI customization metadata consumed by the desktop application.~~

#### Scenario: Component reference configuration
~~- **WHEN** `agent.json` defines `ui.component: "<component-id>"`~~
~~- **THEN** the system records the identifier so the desktop UI can mount the matching React workspace component, and falls back to the default component when the identifier is not registered~~

#### Scenario: Quick prompt definition
~~- **WHEN** `agent.json` provides `ui.quickPrompts` entries with `id`, `label`, and plain-text `prompt` strings~~
~~- **THEN** the system makes these prompts available to the UI for rendering quick action buttons and for seeding new chat sessions~~

#### Scenario: Workflow shortcut curation
~~- **WHEN** `agent.json` specifies `ui.workflowShortcuts` containing workflow file names or IDs~~
~~- **THEN** the UI uses that list (instead of showing every workflow) when rendering workflow quick actions; missing workflows raise a validation warning~~

## MODIFIED Requirements

### Requirement: Agent Specification Loading
The system SHALL parse agent definitions ~~including optional UI metadata~~ and validate them before activation.

#### Scenario: ~~UI metadata parsed~~ Agent configuration validated
- **WHEN** `agent.json` ~~includes a `ui` object with keys such as `component`, `quickPrompts`, or `workflowShortcuts`~~ is loaded
- **THEN** the loader validates the structure against the ~~updated~~ agent schema ~~and exposes the metadata to the UI runtime along with the agent definition~~ containing only AI configuration fields (name, prompt, model, tools, guardrails)

#### Scenario: Invalid ~~UI metadata~~ agent configuration rejected
- **WHEN** ~~`ui` entries are missing required fields (e.g., prompt text) or reference unknown workflow IDs~~ agent configuration contains invalid fields or values
- **THEN** the system surfaces a validation error identifying the offending field and blocks agent activation

## ADDED Requirements

### Requirement: Agent Configuration Purity
The system SHALL enforce that agent definitions contain only AI-related configuration and reject any UI-related fields. Agents are global and can be referenced by any workspace prompt.

#### Scenario: UI fields rejected in agent config
- **WHEN** `agent.json` contains fields like `ui`, `component`, `quickPrompts`, or `workflowShortcuts`
- **THEN** the system returns a validation error indicating these fields belong in workspace configuration

#### Scenario: Agent used by multiple workspace prompts
- **WHEN** multiple workspace prompts reference the same agent slug
- **THEN** the system allows this configuration and shares the agent's AI capabilities across all referencing prompts

#### Scenario: Agent deletion with prompt references
- **WHEN** user attempts to delete an agent that is referenced by one or more workspace prompts
- **THEN** the system returns an error listing the dependent workspaces and prevents deletion
