---
name: "schedule-prompt"
description: "Manage boo scheduler jobs — create, edit, list, remove cron-scheduled agent prompts."
---

# Schedule Prompt

Manage scheduled agent prompts using the `boo` CLI — a cross-platform scheduler daemon for kiro-cli prompts.

## Trigger Patterns

This skill activates when the user:

- Wants to schedule a prompt on a recurring basis ("schedule a daily standup at 9am", "run this every weekday")
- Wants to manage existing scheduled jobs ("list schedules", "disable the morning job", "remove wrap-up")
- Wants to inspect job history or daemon status ("show logs for good-morning", "is boo running?")
- Mentions `boo` by name

## Prerequisites

Confirm `boo` is available by running it (e.g. `boo --help`). If the command is not found, tell the user `boo` is not installed and stop.

## Foundation

This skill builds on the **boo** skill for CLI reference (commands, deep links, conventions). Read it if you need boo fundamentals.

## Workflow

### Step 1: VERIFY
Run `boo --help` to confirm availability. If not found, stop.
- SHOULD skip this step IF already verified in context

### Step 2: UNDERSTAND INTENT
- **Add** a new job → Step 3a
- **List/status** → Step 3b
- **Modify** (enable/disable/remove) → Step 3c
- **Inspect** (logs/run) → Step 3d

### Step 3a: ADD A JOB
Gather from the user: a name (kebab-case with `stallion-` prefix), the cron schedule, the prompt text, and optionally which agent and working directory.

Job names MUST start with `stallion-` (e.g., `stallion-daily-standup`, `stallion-email-check`). This prefix identifies jobs belonging to this agent system.

Before adding, use `boo next "<cron>"` to preview the timing and confirm with the user. Then run `boo add` with the collected parameters. Confirm success with `boo list`.

If unsure about `boo add` flags, run `boo add --help` first.

### Step 3b: LIST/STATUS
Run `boo list` or `boo status`. Offer to take action on any listed job.

### Step 3c: MODIFY A JOB
Show `boo list` first if the user hasn't named a target. Execute the operation (enable/disable/remove) and confirm the result with `boo list`.

### Step 3d: INSPECT A JOB
For logs, run `boo logs <target>` — check `boo logs --help` for output formatting options.
For immediate execution, warn the user it runs synchronously, then proceed if confirmed.

## Key Principles
- ALWAYS verify `boo` is available before any operation
- ALWAYS preview cron timing with `boo next` before adding a job
- ALWAYS confirm mutations by running `boo list` afterward
- Use `boo <subcommand> --help` to discover flags — don't assume syntax
- Do NOT run `boo daemon` or `boo install` without explicit user confirmation — these are system-level operations
