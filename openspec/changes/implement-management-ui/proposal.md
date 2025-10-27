## Why

- The desktop UI has placeholder handlers for agent management actions (New Agent, Edit Agent, Manage Tools, Manage Workflows) but they're not implemented.
- Users cannot create, edit, or configure agents through the UI—they must manually edit JSON files.
- Tool and workflow configuration requires direct file system access, limiting discoverability and usability.
- Application settings (API endpoint, region, model defaults) are hardcoded and cannot be adjusted without restarting or editing code.
- No developer tools or settings interface exists for inspecting or changing runtime configuration.

## What Changes

- Implement full CRUD operations for agents via REST API and UI forms (create, read, update, delete).
- Build tool management interface showing global catalog, allowing users to add/remove tools per agent, configure allow-lists, and set up aliases.
- Create workflow management UI for viewing, creating, and editing VoltAgent workflows per agent.
- Add a Settings/Developer Tools page for configuring API endpoint, AWS region, default model, and other app-level settings.
- Ensure all management UIs validate inputs against JSON schemas and display actionable error messages.
- Wire up the existing management action handlers in AgentSelector to navigate to appropriate views.

## Impact

- **Specs**: Update `desktop-ui` to capture agent CRUD forms, tool/workflow management views, and settings page; update `agent-config` to define REST API endpoints for configuration mutations.
- **Backend**: Add POST/PUT/DELETE endpoints for agents, tools, workflows, and app settings; implement file-based CRUD operations via ConfigLoader.
- **Frontend**: Build React forms and views for agent editor, tool catalog, workflow list/editor, and settings panel; integrate with existing AgentSelector dropdown.
- **Validation**: Extend schema validation to cover all mutation operations and surface errors in the UI.
- **Documentation**: Update README with instructions for using the management UI.
