## Decisions

- Introduce a persistent bottom dock component that hosts the chat experience; the dock supports collapsed (content hidden, header visible) and expanded states and occupies up to 40% of vertical space when open.
- Replace the agent list view with a global selector (command palette style dropdown) that exposes agent metadata plus quick action buttons for prompts and workflows. Selecting an action either focuses an existing dock tab or spawns a new session.
- Represent each active chat session as a tab within the dock. Tabs are keyed by `{agentSlug}:{sessionId}`, show agent name plus optional quick action label, and allow closing without draining other sessions.
- Maintain a UI event bus so quick actions or workflow executions can trigger dock visibility, tab creation, and toast notifications if the dock stays collapsed.
- Add an agent workspace registry that maps `agent.json -> ui.component` identifiers to React components. Components receive agent slug, workspace data sources, and callbacks to open chat sessions.
- Provide a default workspace component for agents without a custom mapping; the `work-agent` default renders a two-panel layout (left day calendar view, right detail inspector) backed by a mocked view model until real data sources are wired.
- Extend the agent configuration schema with `ui` metadata: `component` (string identifier), `quickPrompts` (array of predefined prompt templates), and optional `workflowShortcuts` overrides to control which workflows appear as quick actions.
- When `ui.workflowShortcuts` is omitted, the quick action area omits workflow buttons and surfaces helper text guiding the user to add workflows in the agent configuration.

## Open Questions

- (Resolved) Quick prompts remain plain text strings; formatting/templates are deferred.
- (Resolved) Collapsed dock uses unread badges during streaming and fires a toast when the response completes; the dock does not auto-expand.
- (Resolved) Per-agent theming is out of scope for this iteration.
- (Resolved) The initial `work-agent` workspace uses a mocked calendar view model packaged with the component; future integrations can swap the data source.
- (Resolved) Workflow quick actions render only when explicitly configured; otherwise the UI shows guidance to add shortcuts rather than defaulting to every workflow.
