## Why

- Agent definitions currently mix AI configuration (prompt, model, tools) with UI concerns (component, quickPrompts, workflowShortcuts).
- The SA agent needs multiple workspace views (Calendar/Email, Salesforce) but the current architecture ties one agent to one UI component.
- Users cannot easily create workspace variations that share the same underlying agent configuration.
- Agent management is tightly coupled to workspace selection, making it difficult to organize UI experiences independently from AI capabilities.
- No clear separation between backend AI configuration and frontend UX customization.

## What Changes

- Split agent definitions into pure AI configuration (system prompt, model, tools, guardrails) stored in `.work-agent/agents/<slug>/agent.json`.
- Create workspace definitions as separate entities in `.work-agent/workspaces/<slug>/workspace.json` with tabs and prompts.
- Agents are global and can be referenced by any workspace prompt.
- Each prompt (global or tab-specific) specifies which agent to use.
- Support multi-tab workspaces where each tab can have its own component and local prompts.
- Add workspace-level global prompts that apply across all tabs.
- Replace agent selector with workspace selector in the UI.
- Move agent management (create, edit, delete) to Settings view.
- Support workspace management (create, edit, delete) as the primary UI configuration mechanism.
- Update `onSendToChat` callback to accept agent parameter: `onSendToChat(text, agent)`.

## Impact

- **Specs**: Create new `workspace-config` spec; update `agent-config` to remove UI metadata; update `desktop-ui` to reflect workspace-centric navigation.
- **Backend**: Add workspace configuration loader; add REST API endpoints for workspace CRUD; update agent loader to remove UI fields.
- **Frontend**: Replace AgentSelector with WorkspaceSelector; add tab navigation within workspaces; add workspace editor view; move agent management to settings.
- **Migration**: Provide migration path for existing agent.json files with UI metadata to split into agent + workspace configs.
- **Documentation**: Update README and architecture docs to explain workspace/agent separation.

## User Experience

**Before**: Select agent → See single workspace → Quick prompts from agent config
**After**: Select workspace → See tabbed interface → Global + tab-specific prompts (each specifies agent) → Agents are global

**Example**: "SA Workspace" with tabs:
- Calendar & Email (component: sa-calendar-dashboard, local prompts with agent: "sa-agent")
- Salesforce (component: sa-salesforce-dashboard, local prompts with agent: "sa-agent")
- Global prompts (Standup Prep with agent: "sa-agent") available on all tabs
- Workspace components can call `onSendToChat(text, "sa-agent")` to send messages to specific agents
