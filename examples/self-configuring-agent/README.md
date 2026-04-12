# Self-Configuring Agent Example

This example is the concrete demo artifact for Stallion's `stallion-control` loop.

It is not a plugin. It is an example managed-agent bundle that shows how to:

- inspect the current workspace
- refine reusable playbooks
- delegate narrow work to child agents
- keep delegated sessions constrained

## Files

- [agent.json](./agent.json) — example orchestrator agent config

## What this agent is for

The `Workspace Bootstrapper` is meant to be asked things like:

- "Set up a review workflow for this repository"
- "Create a reusable playbook for onboarding this project"
- "Split the next task into a planner and a worker"

The important part is not the exact prompt. The important part is the shape:

- `stallion-control` is the only management surface
- read-style tools are auto-approved
- mutating tools stay explicit
- delegation depth is capped
- destructive config changes are blocked for children

Use this together with [Build a Self-Configuring Agent](../../docs/guides/self-configuring-agent.md).
