# Guardrail Usefulness Inventory

Date: 2026-04-26

This inventory explains how work-agent should treat the old `verify:convergence` checks while moving to Veritas.

The goal is not to preserve every historical assertion. The goal is to keep the checks that help AI agents make safer changes, convert product behavior checks into proper tests where possible, and retire brittle or migration-only checks when they stop carrying useful evidence.

## Current State

The old convergence script has been renamed into the transitional `proof:repo-guardrails` lane. It remains useful as a temporary safety net because it captures many prior regressions, but it is too broad and too string-based to be the final Veritas abstraction.

The required default gate is now `proof:repo-governance`. It checks the repo trust contract and feeds Veritas' native proof-family reporting. The broad `proof:repo-guardrails` lane remains available as a compatibility aggregator while decomposed family lanes prove equivalence.

## Veritas Support Threshold

If a guardrail is truly useful, Veritas should support the shape of the verification, but not necessarily own the repo-specific assertion.

Veritas should absorb reusable capabilities:

- proof-lane routing based on changed surfaces,
- policy packs with owners, severity, rollback switches, and promotion status,
- structured proof output that can expose subcheck families,
- brownfield init that inventories existing custom checks and recommends where each belongs,
- freshness and evidence records that make a verification result inspectable later.

The repo should keep local assertions when the content depends on work-agent's current architecture:

- exact module names,
- temporary migration tombstones,
- product-specific file boundaries,
- refactor-shape checks that may become obsolete after tests improve.

The migration rule is: useful repeated pattern goes into Veritas; useful local fact stays in a proof lane; useful product behavior becomes a test; no-longer-useful historical shape gets retired.

## Current Family Disposition

The source of truth is `.veritas/proof-families/repo-guardrails.families.json`.

| Family | Current Disposition | Why |
| --- | --- | --- |
| `repo-governance` | required | Protects `.veritas`, CI, instruction, and report wiring. |
| `architecture-boundaries` | candidate | High severity if real, but needs catch evidence before blocking by default. |
| `ui-data-access` | candidate | Useful AI guidance, but raw-fetch and SDK-hook expectations should become AST rules or tests before promotion. |
| `runtime-contracts` | move-to-test / advisory | `test:connected-agents` is the behavioral proof; Veritas route-selection tests now prove runtime/server changes select that replacement lane. |
| `product-route-and-schema-behavior` | move-to-test | Route/schema behavior belongs in Vitest or E2E tests. |
| `retired-surfaces` | candidate | Tombstones are useful during migration but need expiry. |
| `refactor-shape-tombstones` | retire | Helper-name and must-not-inline locks have high false-positive risk. |
| `upstream-veritas-abstractions` | upstream-abstraction | Reusable shape belongs in Veritas, not in work-agent assertions. |

## Decision Categories

### Keep As Veritas Policy

Use policy for checks that describe the repo's trust contract rather than implementation shape:

- required `.veritas` artifacts,
- required CI workflows and issue/PR templates,
- required AI instruction files,
- presence of a brownfield gap log,
- high-level governance expectations with owners and rollback switches.

These are understandable before reading product code and should appear directly in Veritas policy results.

### Keep As Work-Agent Proof Lanes

Use proof lanes for repo-specific implementation invariants that are still valuable but not generally reusable:

- "UI code should use SDK hooks rather than raw fetch" while the SDK boundary is being hardened,
- "shared package root imports are forbidden" while contract ownership is being enforced,
- "runtime/ACP/Codex adapter event mapping stays delegated" while those modules are actively refactored,
- "deleted standalone layout surfaces stay deleted" while the product model has just changed.

These should become smaller lanes over time, for example:

- `proof:ui-data-access`
- `proof:sdk-contracts`
- `proof:runtime-contracts`
- `proof:retired-surfaces`

### Convert To Normal Tests

Move checks into unit/integration/e2e tests when they express product behavior rather than AI guidance:

- scheduler route schemas,
- route request/response validation,
- SDK query hooks,
- ACP event mapping,
- runtime event projection,
- plugin install behavior.

Veritas should select and report these tests as proof lanes, not become the only place those behaviors are asserted.

### Retire Or Soften

Retire checks when they only lock a temporary refactor shape:

- exact helper function names after a migration stabilizes,
- string snippets that only prove code is arranged in one specific file,
- "must not inline" checks once a real module boundary test exists,
- duplicate tombstones for deleted files once routes/imports/tests prove they cannot be used.

If a check is kept only because agents repeatedly reintroduce a bad pattern, keep it as a proof-lane warning first and promote only after eval evidence shows it catches real regressions without noise.

## Veritas Product Learnings

This migration suggests Veritas should support:

- native proof-family evidence so a broad proof lane can report subcheck families,
- brownfield init that inventories existing custom verification scripts before generating `.veritas`,
- a "candidate proof lane" concept for checks that are useful but not yet required,
- guidance for retiring temporary guardrails after evidence improves.

Work-agent now declares `.veritas/proof-families/repo-guardrails.families.json` through `evidence.proofFamilyManifests`, so Veritas reports native `proof_family_results` and `verification_budget` fields. The local sidecar evidence under `.veritas/evidence/proof-families/` remains useful for command-level details, not as the primary cross-repo contract.

## Current Migration Stance

`proof:repo-guardrails` is transitional. It is allowed because it protects current behavior while equivalence is measured, but it should not be treated as the final Veritas story for work-agent. Required status now belongs to smaller trust-contract proof, and candidate/advisory families must earn promotion with catch evidence.

## Runtime-Contracts Reduction

`runtime-contracts` has been demoted from candidate blocking posture to advisory move-to-test posture. The replacement proof is:

- `npm run test:connected-agents` for provider/orchestration/event-store behavior,
- Veritas route-selection coverage that ensures runtime/server changes select both `proof:runtime-contracts` and `test:connected-agents`,
- the native Veritas verification budget fields that show this family as move-to-test instead of required.

Remaining source-string runtime assertions should be retired only when connected-agent tests fail for the same representative regressions.
