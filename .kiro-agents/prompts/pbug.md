---
description: Diagnose → plan fix (tool-planner) → parallel fix (tool-dev) → verify fix + no regressions (tool-reviewer + tool-playwright) → loop until resolved. For bugs from screenshots, errors, or descriptions.
---
# Parallel Bug Fix

Diagnose a bug, plan a parallelized fix, execute, verify the fix AND no regressions. Same agent architecture as pbuild — orchestrator coordinates, specialists do the work.

## Agents

| Agent | Role | Tools |
|---|---|---|
| orchestrator (you) | Coordinator — diagnosis, delegation, decisions | knowledge, thinking, subagents |
| tool-planner | Root cause analysis → structured fix plan | read, glob, grep, code (read-only) |
| tool-dev | Implementation per task spec | all (read/write/shell) |
| tool-reviewer | Verification → structured verdicts | read, glob, grep, code, shell (no write) |
| tool-playwright | Visual reproduction + verification | browser automation |

## Orchestrator Rule

You never use `read`, `glob`, `grep`, or `code` on source files. All codebase analysis goes through tool-planner. All verification goes through tool-reviewer or tool-playwright.

## State: `.kiro/cli_todos/`

Filename: `<branch>--pbug-<slug>.md`.

```markdown
# BUG: <one-liner>

branch: main
worktree: main
created: 2026-03-22
status: diagnosing | planning | fixing | verifying | resolved | paused
type: pbug
iteration: 0

## Bug Report

Source: screenshot | error log | user description
<original report, pasted verbatim>

## Diagnosis

Root cause from tool-planner.
Reproduction steps if applicable.

## Fix Plan

Structured plan from tool-planner (pasted verbatim).

## Verification Report

Structured verdict from tool-reviewer (pasted verbatim).

## History

- iteration 1: partial — fix applied but regression in sidebar
- iteration 2: pass — bug fixed, no regressions
```

## Workflow

### Phase 0: RESUME

Check `.kiro/cli_todos/` for `type: pbug` files.

- Found? → List them. Ask: resume or start fresh?
- None? → Phase 1.

### Phase 1: DIAGNOSE

Goal: Understand the bug before touching code.

1. **Capture the report** — screenshot, error message, description, or all three. Paste verbatim into session file.
2. **Reproduce** (if visual) — delegate to `tool-playwright` to load the page and confirm the bug is visible. Screenshot the broken state.
3. **Find root cause** — delegate to `tool-planner`:

```
Bug: <description>
Reproduction: <steps or screenshot evidence>
Directory: <working directory>
Find the root cause and propose a fix plan.
```

tool-planner explores the codebase, traces the issue, and returns:
- Root cause explanation
- Structured fix plan (same wave/task format as pbuild)

4. Paste diagnosis + plan into session file
5. Present to user: "Here's what's broken and how I'd fix it. Agree?"
6. On approval → `status: fixing`

### Phase 2: FIX

Fan out fix tasks to `tool-dev` subagents per the plan's wave structure.

Same as pbuild Phase 3 — parallel waves, collect results between waves, feed context forward.

### Phase 3: VERIFY

Delegate in parallel:

```
InvokeSubagents(parallel):
  tool-reviewer: acceptance criteria + modified files + "confirm bug is fixed AND no regressions"
  tool-playwright: reproduce the original bug scenario — it should now work correctly (if visual)
```

tool-reviewer must verify two things:
1. **Bug is fixed** — the specific issue described in the report
2. **No regressions** — build passes, existing tests pass, related functionality still works

Paste verification report into session file. Route on verdicts:
- **All PASS** → Phase 4 (resolve)
- **Any FAIL** → Phase 4 (loop)
- **Any NOT_VERIFIED** → Show user, they decide

### Phase 4: LOOP / RESOLVE

**If looping:**
1. Summarize what failed
2. Re-delegate to tool-planner: original diagnosis + failure summary → updated fix plan
3. Increment `iteration`, back to Phase 2

**If resolving:**
1. Include verification report verbatim
2. Show before/after evidence (tool-playwright screenshots if visual)
3. `git diff --stat`
4. `status: resolved`

{context?}
