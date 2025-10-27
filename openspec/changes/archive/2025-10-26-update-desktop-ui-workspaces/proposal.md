## Why

- Current desktop layout dedicates most screen space to the chat interface, leaving little room for agent-specific workflows.
- Users cannot keep multiple agent conversations active at once, limiting cross-agent collaboration.
- Agent-specific UI experiences are not supported, so every agent shares the same static layout.
- Important management actions (creating agents, managing tools/workflows) are not surfaced in the primary workflow.

## What Changes

- Restructure the desktop UI so the chat experience lives in a bottom dock that can be collapsed or expanded without obscuring the main workspace.
- Replace the agent list screen with a global dropdown selector that exposes quick actions for prompts and workflows, signaling when a conversation is running in the dock.
- Allow multiple simultaneous chat sessions by turning active agents/sessions into tabbed conversations within the dock.
- Introduce an agent-config-driven workspace surface that mounts a React component per agent; ship a `work-agent` dashboard with calendar summary + detail panes.
- Ensure agent + tool administration flows remain reachable from the reworked layout (new agent, tool catalog, workflows, debugger).

## Impact

- **Specs**: Update `desktop-ui` to capture the docked chat layout, agent quick actions, and multi-session behavior; update `agent-config` to allow declaring UI components and quick prompts.
- **Frontend**: Significant React/Tauri layout refactor, new component registry for agent workspaces, chat dock state management, tabbed conversations, and quick action triggers.
- **Backend/UI bridge**: Extend existing APIs (if needed) for listing prompts/workflows and for creating ad-hoc chat sessions without forcing agent drain semantics.
- **Documentation**: Refresh README / UI docs after implementation to describe the new layout and configuration options.
