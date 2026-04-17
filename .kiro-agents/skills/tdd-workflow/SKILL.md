---
name: "tdd-workflow"
description: "Test-driven development — RED → GREEN → REFACTOR with git checkpoints. Wraps sa-plan → sa-execute → sa-verify with test-first constraints and coverage gates."
---

# TDD Workflow

Test-driven development orchestrator. Wraps the standard plan → execute → verify chain with test-first constraints.

## When to Activate

- User says "use TDD", "test-driven", "write tests first", "TDD"
- User asks to build something and mentions test coverage requirements

## Agents

Same as sa-build (inherited from primitives):

| Agent | Used by |
|---|---|
| tool-planner | sa-plan (with TDD constraints) |
| tool-dev (x4) | sa-execute (tests first, then implementation) |
| tool-verifier | sa-verify (with coverage check) |
| tool-playwright | sa-verify (if UI) |

## Orchestrator Rule

Same as sa-build: you never touch source files. You coordinate the primitives with TDD-specific context.

## Workflow

### 1. Create session file

Filename: `<branch>--tdd-<slug>.md`
Set `status: planning`, `type: tdd`, `iteration: 0`

### 2. Plan (sa-plan with TDD constraint)

Invoke sa-plan with additional constraint:
```
Constraint: TEST-FIRST DEVELOPMENT
- Plan MUST include test files as separate tasks in Wave 1
- Each feature task must have a corresponding test task that precedes it
- Test tasks specify: test file path, test cases to write, expected failures
- Implementation tasks specify: which tests they make pass
- Include a final "coverage check" task
```

Present plan to user. Get approval.

### 3. Execute RED phase

Invoke sa-execute for Wave 1 only (test tasks):
- tool-dev writes test files
- After Wave 1 completes, run the tests — they MUST fail (RED)
- If tests pass (no RED state), the tests are wrong — flag to user
- Git checkpoint: `test: add failing tests for <feature>`

### 4. Execute GREEN phase

Invoke sa-execute for Wave 2 (implementation tasks):
- tool-dev writes minimal code to make tests pass
- After Wave 2 completes, run the tests — they MUST pass (GREEN)
- If tests still fail, loop: re-invoke sa-execute with failure context
- Git checkpoint: `feat: implement <feature> (tests passing)`

### 5. Execute REFACTOR phase

Invoke sa-execute for Wave 3 (refactor tasks, if any):
- tool-dev improves code quality while keeping tests green
- After Wave 3, run tests again — must still pass
- Git checkpoint: `refactor: clean up <feature>`

### 6. Verify (sa-verify with coverage gate)

Invoke sa-verify with additional context:
```
Additional verification: Check test coverage.
Run coverage command and verify >= 80% on changed files.
Include coverage % in the verification report.
If coverage < 80%, verdict is FAIL with coverage gap details.
```

### 7. Route on verdict

Same as sa-build:
- **All PASS + coverage >= 80%** → deliver
- **Any FAIL or coverage < 80%** → loop (re-plan failing items)
- **NOT_VERIFIED** → surface to user

### 8. Deliver

Same as sa-build, plus:
- Report TDD cycle summary: RED → GREEN → REFACTOR with checkpoint SHAs
- Report final coverage %

## Session File Format

```markdown
# TDD: <Goal one-liner>

branch: <branch>
created: <date>
status: planning | red | green | refactor | verifying | delivered
type: tdd
iteration: 0
coverage_target: 80

## Plan
(from sa-plan)

## RED Phase
- Tests written: <list>
- All failing: YES/NO
- Checkpoint: <SHA>

## GREEN Phase
- Implementation: <list>
- All passing: YES/NO
- Checkpoint: <SHA>

## REFACTOR Phase
- Changes: <list>
- Tests still passing: YES/NO
- Checkpoint: <SHA>

## Verification Report
(from sa-verify)

## History
- iteration 1: RED ✓, GREEN ✓, REFACTOR ✓, coverage 85%
```

{context?}
