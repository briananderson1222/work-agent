# Coding Layout Step 1 Verification Prep

## Scope

This note maps the smallest verification surface for **RALPLAN Step 1: visible plan artifacts in the current coding workflow**.

Step 1 constraints from the plan:
- UI-first view over **existing session/runtime/cached plan data** only
- no new persisted plan domain object in core
- coding layout is the first consumer, but the primitive should stay reusable

## Current Step 1 Surface Map

### Likely implementation files

| File | Why it matters |
| --- | --- |
| `src-ui/src/components/CodingLayout.tsx` | Primary coding surface that will likely host or compose the plan artifact panel |
| `src-ui/src/components/coding-layout/*` | Existing coding-layout subpanels and utilities are the most likely home for a shared plan panel |
| `src-ui/src/components/chat-dock/useChatDockViewModel.ts` | Already derives project/layout/session state that may feed plan visibility |
| `src-ui/src/components/chat-dock/ChatDockProjectContext.tsx` | Existing project-context strip; relevant only if plan status leaks into the dock context |
| `src-ui/src/utils/execution.ts` | Existing session/runtime summary helpers; likely extension point only if plan visibility depends on orchestration/session summaries |

### Existing nearby unit coverage

| File | Existing coverage | Step 1 relevance |
| --- | --- | --- |
| `src-ui/src/__tests__/execution.test.ts` | session execution summary + runtime selection helpers | Good target only if Step 1 adds pure plan/status derivation helpers |
| `src-ui/src/__tests__/chat-progress.test.ts` | tool progress summary derivation | Good pattern reference for plan-status summary derivation |
| `src-ui/src/__tests__/coding-layout-utils.test.ts` | coding-layout utility coverage | Best existing colocated test location if Step 1 extracts a pure plan utility |
| `src-ui/src/__tests__/new-chat-modal-utils.test.ts` | project/runtime UI state logic | Secondary fallback if plan state is threaded through chat session helpers |

### Existing E2E baselines

| File | Existing coverage | Step 1 relevance |
| --- | --- | --- |
| `tests/project-architecture.spec.ts` | route-mocked project/layout rendering, coding layout smoke coverage | Best starting point for plan-panel visibility assertions |
| `tests/android/desktop-regression.spec.ts` | desktop coding-layout grid smoke | Use only as a layout guard if Step 1 changes panel structure or grid behavior |
| `tests/dock-mode-preference.spec.ts` | coding layout navigation/dock behavior | Relevant only if Step 1 accidentally changes dock/layout behavior |

## Gaps Found

- There is **no existing plan-artifact component or Step 1-specific test surface yet** in the current tree.
- Current nearby tests cover runtime summaries, chat progress, and coding-layout helpers, but **not**:
  - active vs completed plan-step rendering,
  - full markdown/content view,
  - save/copy/export affordances,
  - coding-layout plan visibility.

## Smallest Verification Slice To Add When Step 1 Lands

### 1) Focused unit coverage

Prefer a **new pure helper** (or a very small extension to an existing helper) for plan normalization rather than testing plan state only through a large React component.

Minimum assertions:
1. raw cached/runtime plan data normalizes into ordered steps,
2. active step is distinguished from completed steps,
3. markdown/full-content fallback is preserved when step metadata is partial,
4. copy/export labels or payload builders remain deterministic if extracted into helpers.

Recommended write targets:
- `src-ui/src/__tests__/coding-layout-utils.test.ts` if the helper lands under coding-layout utils
- otherwise a new colocated test beside the new plan helper

### 2) Focused Playwright coverage

Add one route-mocked browser flow that proves the user-visible contract:
1. open a project with a coding layout,
2. surface a plan artifact in the coding workflow,
3. show active + completed step distinction,
4. open or reveal the full markdown/content view,
5. verify copy/export affordance is visible when plan data exists.

Recommended write target:
- extend `tests/project-architecture.spec.ts` if the same route fixtures are enough,
- otherwise add a narrow new spec next to it rather than broadening unrelated orchestration specs.

### 3) Regression-only layout guard

Only touch `tests/android/desktop-regression.spec.ts` if Step 1 changes the coding layout grid enough that an additional desktop guard is necessary.

## Verification Commands For Step 1

Use the smallest focused commands first, then the repo-wide safety net:

```bash
npx biome lint src-ui/src/components/CodingLayout.tsx src-ui/src/components/coding-layout src-ui/src/__tests__ tests
npx tsc --noEmit --skipLibCheck
npx vitest run src-ui/src/__tests__/execution.test.ts src-ui/src/__tests__/chat-progress.test.ts src-ui/src/__tests__/coding-layout-utils.test.ts
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test tests/project-architecture.spec.ts
```

If Step 1 introduces a dedicated spec or test file, swap the focused file list above to the newly added files before falling back to broader suites.

## Lane Guidance

- Prefer adding **new focused tests** over editing broad shared specs unless the existing fixture already matches the Step 1 route shape.
- Avoid touching worker-owned implementation files until the plan artifact UI shape stabilizes.
- The clean handoff for the verification lane is: implementation lands -> add/assert focused Vitest coverage -> add/assert one route-mocked Playwright flow -> run lint/typecheck/focused tests.
