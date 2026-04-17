---
name: "sa-plan"
description: "Code planning primitive — goal + directory to structured execution plan. Delegates to tool-planner. No resume, no ideation."
---

# Plan

Goal + directory in, structured plan artifact out. Pure planning primitive.

## Agents

| Agent | Role |
|---|---|
| tool-planner | Codebase analysis, structured execution plan, writes plan artifact |

## Orchestrator Rule

You do not read source files. You delegate to tool-planner and read the artifact it produces.

## Pre-Planning: Research

Before delegating to tool-planner, check if the goal can be solved with existing tools or libraries:
1. Search the current codebase for similar functionality
2. If the goal involves adding new capabilities, invoke the search-first skill
3. Pass research findings to tool-planner as additional context

Skip this step if the goal is purely about modifying existing code (bug fixes, refactors).

## Input

The orchestrator (or user) provides:
- **Goal**: what to build or change
- **Directory**: working directory for the codebase
- **Constraints**: from AGENTS.md, user preferences, conversation context
- **Session file path** (optional): if part of a larger workflow, the orchestrator passes this

## Workflow

1. Create session file in `.kiro/cli_todos/` if one wasn't provided:
   - Filename: `<branch>--sa.plan-<slug>.md`
   - `status: planning`, `type: sa.plan`
2. Delegate to `tool-planner`:
   ```
   Goal: <goal>
   Directory: <working directory>
   Constraints: <constraints>
   todo_file: <session file path>
   ```
3. tool-planner explores the codebase and writes the plan to the artifact file:
   - `<session-basename>-plan.md`
4. Read the plan artifact
5. Update session file: paste plan summary into `## Plan`, set `status: planned`
6. Present the plan to the user
7. If the user wants changes, re-delegate to tool-planner with feedback

## Session File Format

```markdown
# <Goal one-liner>

branch: <branch>
worktree: <worktree>
created: <date>
status: planning | planned
type: sa.plan

## Plan

Structured plan from tool-planner (pasted from artifact).
```

## Output

- Session file in `.kiro/cli_todos/` with status `planned`
- Plan artifact: `<session-basename>-plan.md`
- The plan artifact is the source of truth — tool-dev agents read it directly

{context?}
