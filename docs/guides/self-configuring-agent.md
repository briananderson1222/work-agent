# Build a Self-Configuring Agent

This guide shows how to build an agent that can set up its own workspace in Stallion using `stallion-control`.

## Goal

The agent should be able to:

- inspect the current workspace state
- create or refine playbooks
- delegate bounded work to another agent
- configure the project enough that the user lands in a useful environment

The concrete example bundle lives in [examples/self-configuring-agent](../../examples/self-configuring-agent/README.md).

## What `stallion-control` gives you

`stallion-control` is the built-in MCP server for platform management. It exposes tools such as:

- `list_agents`, `get_agent`, `list_projects`, `get_project`
- `list_prompts`, `create_prompt`, `update_prompt`, `track_prompt_run`, `record_prompt_outcome`
- `send_message` for agent-to-agent delegation
- config and navigation tools for steering the workspace

This means the same agent loop that writes code can also shape its own working environment.

## Recommended setup pattern

1. Start with one orchestrator agent.
2. Give it `stallion-control` plus only the MCP servers it actually needs.
3. Let it create task-specific child agents through `send_message`.
4. Keep child sessions isolated with delegation limits.
5. Refine successful playbooks instead of baking everything into one giant system prompt.

The orchestrator should stay focused on coordination. Child agents should own narrow tasks.

## Example agent

Use the example `agent.json` as a starting point:

```json
{
  "name": "Workspace Bootstrapper",
  "prompt": "You set up useful project workspaces. Inspect the current project, create or refine playbooks when you find reusable workflows, and delegate narrow tasks to specialist child agents. Prefer small reversible changes.",
  "tools": {
    "mcpServers": ["stallion-control"],
    "available": [
      "stallion-control_list_agents",
      "stallion-control_list_projects",
      "stallion-control_get_project",
      "stallion-control_list_prompts",
      "stallion-control_create_prompt",
      "stallion-control_update_prompt",
      "stallion-control_send_message"
    ],
    "autoApprove": [
      "stallion-control_list_agents",
      "stallion-control_list_projects",
      "stallion-control_get_project",
      "stallion-control_list_prompts"
    ]
  },
  "delegation": {
    "maxDepth": 2,
    "blockedTools": [
      "stallion-control_update_config",
      "stallion-control_delete_*"
    ]
  }
}
```

## Delegation rules

Stallion now enforces child-agent isolation for delegated sessions:

- delegated children inherit a depth counter
- blocked tools and allowlists can be enforced per child
- delegated children can be denied approval-bound tools entirely

That gives you a safe default for “planner delegates to worker” patterns without giving every child full platform control.

## Playbook refinement loop

The playbook loop is intentionally simple:

1. Agent notices a repeated task.
2. Agent creates or updates a playbook through `create_prompt` / `update_prompt`.
3. Stallion records the agent/conversation provenance for that edit.
4. When the playbook is used, Stallion tracks runs.
5. Success/failure outcomes can be recorded to build a quality signal over time.

This is enough to support self-improving agents without needing a full offline training system.

## Approval model

Approval-bound tools still respect the human-in-the-loop path.

- human approval requests aggregate into the notifications inbox
- an optional guardian review layer can allow, deny, or defer risky tool calls before they reach the human path
- delegated child agents can be configured to avoid approval-bound tools altogether

That combination keeps the bootstrap agent useful without giving it silent unrestricted power.

## Recommended first demo

Use the example bundle to demonstrate this flow:

1. Ask the bootstrap agent to inspect a repo.
2. Let it create a “review this repo” playbook.
3. Let it delegate a focused task to a child agent.
4. Watch the workspace update in the UI and the resulting playbook appear in Playbooks.

That is the clearest demo of Stallion’s “agents managing agents” model.
