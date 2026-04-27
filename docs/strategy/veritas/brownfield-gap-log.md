# Veritas Brownfield Gap Log

This log tracks what work-agent reveals about introducing Veritas into an existing application with custom verification, complex CI, existing instruction files, and adjacent "guidance" terminology.

## Findings

### 2026-04-26: Published package lagged the local Veritas iteration

- **Category:** brownfield init/onboarding gap
- **Evidence:** `@kontourai/veritas@0.2.0` from npm did not include local commit `a348ce0` (`Support reviewed agent-led initialization`), while the work-agent migration needs the reviewed init behavior and updated adapter fixtures.
- **Decision:** use the local `../../kontourai/veritas` file dependency during this proving-ground migration.
- **Follow-up:** publish the next Veritas package before using this migration as a public installation example.

### 2026-04-26: The old convergence verifier was too monolithic for evidence

- **Category:** proof-lane routing gap
- **Evidence:** `scripts/verify-convergence.mjs` combined framework checks with many product-specific structural assertions.
- **Decision:** rename the broad guardrail as `proof:repo-guardrails`, make it a Veritas proof lane, and decompose later once equivalence is measured.
- **Follow-up:** consider structured proof-output ingestion so Veritas can display subcheck families without absorbing repo-specific assertions into generic policy.

### 2026-04-26: Brownfield migration should evaluate usefulness, not preserve every old check

- **Category:** brownfield init/onboarding gap
- **Evidence:** the old proof script contains hundreds of exact string and source-shape assertions. Some guide AI well, but others only preserve historical refactor decisions.
- **Decision:** keep the broad lane only as a transitional safety net and add `docs/strategy/veritas/guardrail-usefulness-inventory.md`.
- **Follow-up:** Veritas brownfield init should produce a guardrail usefulness inventory automatically when it detects existing custom verification scripts.

### 2026-04-26: Useful checks need a Veritas abstraction decision

- **Category:** proof-lane abstraction gap
- **Evidence:** `proof:repo-guardrails` still catches useful AI regression patterns, but many individual checks are exact work-agent implementation facts.
- **Decision:** Veritas should support reusable verification shapes such as proof-lane routing, structured subcheck output, candidate proof lanes, and freshness/evidence records. Work-agent should retain repo-specific assertions as local proof-lane content until they prove generally reusable.
- **Follow-up:** add Veritas support for classifying custom checks as `reusable-pattern`, `repo-local-fact`, `product-test-candidate`, or `retire`, then use that classification during brownfield init.

### 2026-04-26: Required gate shrank to governance first

- **Category:** proof-lane right-sizing gap
- **Evidence:** `proof:repo-guardrails` had become a 6,872-line default blocker. That made Veritas look like a wrapper around bespoke lint and risked over-checking docs-only or narrow code changes.
- **Decision:** add `.veritas/proof-families/repo-guardrails.families.json`, introduce `proof:repo-governance` as the required/default lane, keep `proof:repo-guardrails` as a compatibility aggregator, and report candidate/advisory families through native Veritas proof-family evidence.
- **Follow-up:** use native `proof_family_results` and `verification_budget` to decide which candidate/advisory families earn promotion and which command-level sidecar details can be retired.

### 2026-04-26: Proof-family results became native report evidence

- **Category:** evidence/reporting gap
- **Evidence:** work-agent needed a durable way to show required, candidate, advisory, move-to-test, retiring, and upstream-abstraction families without making all of them blockers.
- **Decision:** declare `.veritas/proof-families/repo-guardrails.families.json` in the adapter with `evidence.proofFamilyManifests`; upstream Veritas now emits `proof_family_results` and `verification_budget`.
- **Follow-up:** use the generated verification budget during review before promoting more families to required.
