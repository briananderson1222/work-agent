---
name: "sa-build"
description: "Build orchestrator — goal to delivered code. Chains sa-plan → sa-execute → sa-verify → loop on failure. No ideation, no resume."
---

# Build

Takes a goal, chains the three primitives, loops until done. The orchestrator coordinates — it never touches source files.

## Agents

Inherited from primitives:

| Agent | Used by |
|---|---|
| tool-planner | sa-plan |
| tool-dev (x4) | sa-execute |
| tool-code-reviewer | sa-build (review step) |
| tool-security-reviewer | sa-build (conditional — security-sensitive changes) |
| tool-verifier | sa-verify |
| tool-playwright | sa-verify |

## Orchestrator Rule

You never use `read`, `glob`, `grep`, or `code` on source files. You only read/write the session file and artifact files in `.kiro/cli_todos/`.

## Input

- **Goal**: what to build (from conversation context or explicit instruction)
- **Directory**: working directory

## TDD Mode

If the user requests test-driven development, activate the `tdd-workflow` skill instead. It wraps the same plan → execute → verify chain with test-first constraints and git checkpoints. sa-build is for standard (implementation-first) workflows.

## Session File

Filename: `<branch>--sa.build-<slug>.md`

```markdown
# <Goal one-liner>

branch: <branch>
worktree: <worktree>
created: <date>
status: planning | executing | reviewing | verifying | delivered
type: sa.build
iteration: 0

## Workflow Rules (re-read at each phase transition)

- Reviewers and verifiers are REPORT ONLY — they never fix code
- Any code change requires re-review + re-verify before delivery
- Loop exits only when review + verify are both clean in same iteration
- CRITICAL/HIGH → re-plan → execute → review → verify
- MEDIUM/FAIL → execute fix pass → review → verify

## Plan

(populated by sa-plan)

## Execution Progress

(populated by sa-execute)

## Verification Report

(populated by sa-verify)

## History

- iteration 1: partial — auth routes done, form validation missing
- iteration 2: pass — all acceptance criteria met
```

## Workflow

### 1. Create session file

Create the session file with `status: planning`, `iteration: 0`.

### 2. Plan (sa-plan)

Invoke sa-plan with the goal, directory, and session file path. Present the plan to the user. Get approval before proceeding.

### 3. Execute (sa-execute)

Re-read the session file `## Workflow Rules` section before proceeding. Then invoke sa-execute with the plan artifact path and session file path.

### 4. Review (REPORT ONLY — tool-code-reviewer + conditional security)

Reviewers produce findings. **They NEVER fix code.** No writes, no patches, no "found and fixed."

1. Delegate to tool-code-reviewer for quality review. It returns a findings report with severity levels.
2. **Security review trigger** — if changed files touch auth, user input handling, DB queries, file system ops, API endpoints, crypto, or payment code, also delegate to tool-security-reviewer. It returns a security findings report.

### 5. Verify (REPORT ONLY — sa-verify)

Invoke sa-verify with the session file path. Verifiers run checks and report status. **They NEVER fix code.** No format fixes, no lint auto-fixes, no patches.

### 6. Route on findings

Combine review findings + verification verdict:

- **Clean** (no issues, all PASS) → deliver
- **CRITICAL or HIGH review findings** → re-plan (step 7a)
- **MEDIUM review findings needing code changes** → fix pass (step 7b)
- **Any verification FAIL** → fix pass (step 7b)
- **Any NOT_VERIFIED** → surface to user, they decide

### 7. Loop (mandatory re-verify)

**Any code change requires a subsequent clean review + verify pass. No exceptions.**

#### 7a. Re-plan (CRITICAL/HIGH issues)

1. Increment `iteration` in session file
2. Re-invoke sa-plan with: original goal + failure summary → updated plan
3. Back to step 3 (Execute) → then step 4 (Review) → step 5 (Verify)

#### 7b. Fix pass (MEDIUM issues / verification failures)

1. Increment `iteration` in session file
2. Back to step 3 (Execute) with the specific findings to fix
3. Then step 4 (Review) → step 5 (Verify)

**The loop exits ONLY when review + verify both produce zero findings and all PASS in the same iteration.** Not when fixes are applied — when fixes are *verified clean*.

### 8. Deliver

1. Include the verification report verbatim in your delivery message
2. `git diff --stat`
3. Summarize: what was built, iterations taken, issues resolved
4. Set `status: delivered`

{context?}
