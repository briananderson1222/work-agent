---
name: "sa-bug"
description: "Bug fix orchestrator — diagnose → sa-plan → sa-execute → sa-verify → loop. Diagnosis phase is unique to bugs, then chains the same primitives."
---

# Bug Fix

Diagnose a bug, then chain the same plan → execute → verify loop. The diagnosis phase is what makes this different from sa-build.

## Agents

Inherited from primitives + diagnosis:

| Agent | Used by |
|---|---|
| tool-planner | diagnosis + sa-plan |
| tool-dev (x4) | sa-execute |
| tool-code-reviewer | sa-bug (review step) |
| tool-security-reviewer | sa-bug (conditional — security-sensitive changes) |
| tool-verifier | sa-verify |
| tool-playwright | diagnosis (reproduce) + sa-verify |

## Orchestrator Rule

You never use `read`, `glob`, `grep`, or `code` on source files. All codebase analysis goes through tool-planner. All verification goes through tool-verifier or tool-playwright.

## Input

- **Bug report**: screenshot, error log, user description, or all three
- **Directory**: working directory

## Session File

Filename: `<branch>--sa.bug-<slug>.md`

```markdown
# BUG: <one-liner>

branch: <branch>
worktree: <worktree>
created: <date>
status: diagnosing | planning | fixing | verifying | resolved
type: sa.bug
iteration: 0

## Bug Report

Source: screenshot | error log | user description
<original report, pasted verbatim>

## Diagnosis

Root cause from tool-planner.

## Plan

(populated by sa-plan)

## Execution Progress

(populated by sa-execute)

## Verification Report

(populated by sa-verify)

## History

- iteration 1: partial — fix applied but regression in sidebar
- iteration 2: pass — bug fixed, no regressions
```

## Workflow

### 1. Create session file

Paste the bug report verbatim. Set `status: diagnosing`.

### 2. Diagnose (unique to bugs)

1. **Reproduce** (if visual) — delegate to tool-playwright to confirm the bug is visible. Screenshot the broken state.
2. **Find root cause** — delegate to tool-planner:
   ```
   Bug: <description>
   Reproduction: <steps or screenshot evidence>
   Directory: <working directory>
   todo_file: <session file path>
   Find the root cause and propose a fix plan.
   ```
3. Read the diagnosis from tool-planner's output
4. Paste into session file `## Diagnosis`
5. Present to user: "Here's what's broken and how I'd fix it. Agree?"
6. On approval → proceed to plan

### 3. Plan (sa-plan)

Invoke sa-plan with: diagnosis + fix goal, directory, session file path.

### 4. Execute (sa-execute)

Invoke sa-execute with the plan artifact path and session file path.

### 5. Review (tool-code-reviewer + conditional security)

1. Delegate to tool-code-reviewer for quality review of the fix. If CRITICAL issues, loop back to step 4 (Execute) with findings.
2. **Security review trigger** — if changed files touch auth, user input handling, DB queries, file system ops, API endpoints, crypto, or payment code, also delegate to tool-security-reviewer. CRITICAL security findings block — loop back to Execute.

### 6. Verify (sa-verify)

Invoke sa-verify with the session file path. tool-verifier must verify:
1. **Bug is fixed** — the specific issue from the report
2. **No regressions** — build passes, existing tests pass, related functionality works

### 7. Route on verdict

- **All PASS** → resolve
- **Any FAIL** → loop
- **Any NOT_VERIFIED** → surface to user

### 8. Loop (on failure)

1. Summarize what failed
2. Increment `iteration`
3. Re-invoke sa-plan with: original diagnosis + failure summary → updated fix plan
4. Back to step 4

### 9. Resolve

1. Include verification report verbatim
2. Show before/after evidence (screenshots if visual)
3. `git diff --stat`
4. Set `status: resolved`

{context?}
