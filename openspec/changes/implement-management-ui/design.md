## Decisions

- Leverage VoltAgent's built-in `GET /agents` and `GET /workflows` endpoints; we already override `GET /agents` in WorkAgentRuntime to add metadata (slug, name, updatedAt, ui).
- Add custom CRUD endpoints via `configureApp`: `POST /agents`, `PUT /agents/:slug`, `DELETE /agents/:slug`, `GET /tools`, `POST /agents/:slug/tools`, `DELETE /agents/:slug/tools/:id`, `POST /agents/:slug/workflows`, `PUT /agents/:slug/workflows/:id`, `DELETE /agents/:slug/workflows/:id`.
- Distinguish between workflow definitions (registered with VoltAgent, accessed via built-in endpoints) and workflow files (.ts/.js files on disk, managed via custom endpoints).
- Add `GET /config/app` and `PUT /config/app` for application settings management; validates against app.json schema and writes to `.work-agent/config/app.json`.
- Implement a Settings/Developer Tools view accessible from the main UI (e.g., gear icon in top-right corner) that displays current configuration in a tabbed interface (General, Advanced, Debug).
- Agent editor UI presents a multi-step form: (1) Basic Info (name, prompt), (2) Model Configuration (model ID, region, guardrails), (3) Tools (catalog selection with checkboxes), (4) UI Customization (component, quick prompts, workflow shortcuts).
- Tool management view shows a two-column layout: left side lists global catalog tools with metadata (name, kind, transport); right side shows currently enabled tools for the selected agent with allow-list and alias configuration.
- Workflow management view lists workflows as cards with name, file type (.ts/.js), and last modified; clicking "Edit" opens a code editor (Monaco or simple textarea) with syntax highlighting; "New Workflow" scaffolds a basic VoltAgent workflow template.
- All forms validate on blur and on submit, displaying inline error messages derived from JSON schema validation; successful saves show a toast notification and refresh the agent list.
- Settings page includes a "Reset to Defaults" button that restores `app.json` to factory settings and a "Test Connection" button that pings the Bedrock API to verify credentials.
- The AgentSelector dropdown management buttons navigate to full-screen views: "New Agent" → `/agent/new`, "Edit Agent" → `/agent/:slug/edit`, "Manage Tools" → `/agent/:slug/tools`, "Manage Workflows" → `/agent/:slug/workflows`; settings accessible via a global gear icon → `/settings`.

## Open Questions

- (Resolved) Workflow editor will use a simple textarea with monospace font for initial implementation; Monaco integration can be added later.
- (Resolved) API endpoint configuration applies immediately without restart by updating a runtime config singleton; agents must be reloaded for region/model changes to take effect.
- (Resolved) Deletion of agents/tools/workflows requires confirmation modal to prevent accidental data loss.
- (Resolved) Settings page allows configuring the API base URL to support scenarios where the backend runs on a different host/port (useful for development or remote deployment).
