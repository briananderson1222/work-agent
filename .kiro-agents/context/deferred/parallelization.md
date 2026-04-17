# Parallelization with tool-dev

You have access to `tool-dev` — an autonomous coding subagent with full `@builtin` tool access (read, write, shell, code, grep, glob). Use it to parallelize implementation work.

## When to Delegate to tool-dev

- **Independent file changes** — multiple files that don't depend on each other can be written in parallel
- **Long-running tasks** — implementation that would take many turns can run in the background while you handle other work
- **Code Generation phase** (aidlc) — fan out unit implementations to parallel tool-dev instances
- **Test writing** — delegate test creation while you continue with implementation
- **Repetitive changes** — applying the same pattern across multiple files/modules

## When NOT to Delegate

- Tasks requiring user interaction or clarification
- Changes with tight dependencies on each other (file A must exist before file B)
- Exploratory work where the approach isn't clear yet

## How to Delegate

Provide tool-dev with a self-contained prompt including:
1. **Clear scope** — exactly which files to create/modify
2. **Acceptance criteria** — what "done" looks like
3. **Context** — relevant code patterns, conventions, types/interfaces it needs to follow
4. **Working directory** — if different from current

tool-dev manages its own TODO files in `.kiro/cli_todos/` and tracks `modified_files` to detect conflicts with other parallel workers. It will end its turn immediately if instructions are insufficient rather than guessing.

## Conflict Avoidance

- tool-dev checks `.kiro/cli_todos/` for in-progress work from other instances
- If file overlap is detected, it flags the conflict and may use `git worktree` isolation
- When spawning multiple tool-dev instances, ensure their file scopes don't overlap
