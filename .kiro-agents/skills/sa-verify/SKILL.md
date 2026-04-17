---
name: "sa-verify"
description: "Verification primitive — session file path to structured verdict via tool-verifier + tool-playwright. Reads acceptance criteria from plan artifact."
---

# Verify

Session file in, structured verdict out. Delegates to tool-verifier and tool-playwright.

## Agents

| Agent | Role |
|---|---|
| tool-verifier | Code verification, acceptance criteria checking, structured verdicts |
| tool-playwright | Visual verification, screenshots, accessibility checks |

## Orchestrator Rule

You do not review source files. You delegate to tool-verifier and tool-playwright, then read the verdict artifact.

## Read-Only Rule (STRICT)

**Verifiers NEVER modify source code.** tool-verifier and tool-playwright are read-only reporters:
- They may run commands (build, test, lint) but NEVER apply fixes
- No format fixes, no lint auto-fixes, no "1 format fix applied"
- No code patches, no "found and fixed" — report findings only
- If a fix is needed, report it as a finding. The orchestrator routes it back to sa-execute.

## Input

- **Session file path**: the session file in `.kiro/cli_todos/` (preferred)
- The session file references the plan artifact (which has acceptance criteria) and execution progress (which has modified files)
- If NO session file exists, delegate to tool-verifier directly (see Standalone Verification below)

## Standalone Verification (no session file)

When invoked without a session file (e.g., user says "verify this project" or "run verification"):

1. Delegate to tool-verifier with:
   - The user's verification request
   - The current working directory
   - Modified files from `git diff --name-only` (if available)
2. Delegate to tool-playwright in parallel if UI changes are mentioned
3. Read the verdict and report to the user

Skip session file lookup — go straight to delegation.

## Workflow (with session file)

1. Read the session file to find the plan artifact path and modified files
2. Set session file `status: verifying`
3. Delegate in parallel:
   ```
   tool-verifier:
   - Acceptance criteria from plan artifact
   - Modified files from execution progress
   - Build/test commands from AGENTS.md or plan
   - todo_file path for writing verdict artifact

   tool-playwright (if UI changes exist):
   - Pages/components to check
   - Expected visual state
   ```
4. Read the verdict artifact: `<session-basename>-review.md`
5. Update session file: paste verdict summary into `## Verification Report`
6. Route on verdicts:
   - **All PASS** → set `status: verified`
   - **Any FAIL** → set `status: failed`, list failures
   - **Any NOT_VERIFIED** → set `status: needs-decision`, surface to user

## Verification Phases

tool-verifier runs these phases in order. If a phase fails critically (build), subsequent phases are skipped.

| Phase | What | Auto-detected via |
|-------|------|-------------------|
| Build | Compile/bundle the project | package.json scripts, Makefile, Cargo.toml, go.mod |
| Types | Static type checking | tsconfig.json → tsc, pyrightconfig.json → pyright, mypy.ini → mypy |
| Lint | Style and quality checks | .eslintrc* → eslint, ruff.toml → ruff, .golangci.yml → golangci-lint |
| Tests | Run test suite with coverage | package.json test script, pytest.ini, go test |
| Security | Secrets scan + dependency audit | grep for API keys/tokens, npm audit / pip-audit |
| Diff Review | Semantic review of changed files | git diff --stat against acceptance criteria |

Phases 1-5 are automated (shell commands). Phase 6 is the existing semantic review.

If a tool isn't available for a phase, mark it NOT_VERIFIED with explanation — don't skip silently.

## Structured Report Format

tool-verifier writes the verdict artifact with this structure:

```
---
role: review
parent: <session basename>
created: <ISO date>
verdict: PASS | PARTIAL | FAIL
---

## Verification Report

Build:     [PASS/FAIL]          <command, exit code>
Types:     [PASS/FAIL/SKIP]     <X errors, or "no type checker detected">
Lint:      [PASS/FAIL/SKIP]     <X warnings, or "no linter detected">
Tests:     [PASS/FAIL/SKIP]     <X/Y passed, Z% coverage>
Security:  [PASS/FAIL/SKIP]     <X issues found>
Diff:      [X files changed]

### Acceptance Criteria
- [PASS] <criterion> — <evidence>
- [FAIL] <criterion> — <what's wrong>

### Verdict: PASS | PARTIAL | FAIL
<summary>
```

## Verdict Rules

- You do not override verdicts. FAIL is FAIL until re-verified.
- NOT_VERIFIED items are surfaced to the user — they decide: accept, fix, or skip.

## Output

- Verdict artifact: `<session-basename>-review.md`
- Session file updated with verification report and status
