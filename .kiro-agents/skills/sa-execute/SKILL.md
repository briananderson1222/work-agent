---
name: "sa-execute"
description: "Parallel execution primitive — plan artifact path to implemented code via tool-dev (x4). Reads plan directly. Updates session file between waves."
---

# Execute

Plan artifact in, implemented code out. Fans out to tool-dev subagents in parallel waves.

## Agents

| Agent | Role |
|---|---|
| tool-dev | Implementation per task spec (up to 4 parallel) |

## Orchestrator Rule

You do not write source files. You read the plan artifact, fan out tasks to tool-dev, and update the session file between waves.

## Input

- **Plan artifact path**: path to the `-plan.md` file in `.kiro/cli_todos/`
- **Session file path**: the session file to update with progress

## Workflow

1. Read the plan artifact directly
2. Set session file `status: executing`
3. **Frontend design check:** If any tasks involve UI, CSS, layouts, components, or visual design, read the `frontend-design` skill and include its aesthetics guidelines in the tool-dev prompts for those tasks
4. Fan out each wave to tool-dev subagents (up to 4 parallel):
   ```
   Each tool-dev gets:
   - Task description from plan
   - Files to create/modify
   - Acceptance criteria
   - Context from plan + prior wave results
   - Plan artifact path (so it can read full context directly)
   ```
5. Between waves:
   - Collect results from all tool-dev subagents
   - Check for conflicts before next wave
   - Feed completed wave context forward
   - **Checkpoint**: update session file with completed tasks and next wave
6. After all waves: set session file `status: executed`

## Session File Updates

Between each wave, append to the session file:

```markdown
## Execution Progress

### Wave 1 (completed)
- [x] Task A — done
- [x] Task B — done

### Wave 2 (in progress)
- [ ] Task C
- [ ] Task D
```

This is the recovery point. If context is lost, a new session reads this and knows which waves are done.

## Output

- Implemented code in the working directory
- Session file updated with execution progress and `status: executed`

{context?}
