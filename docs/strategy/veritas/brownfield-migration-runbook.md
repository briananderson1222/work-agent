# Veritas Brownfield Migration Runbook

This runbook is for older repos that already have custom AI guidance, convergence scripts, or repo-specific verification before adopting Veritas.

## 1. Inventory Existing Guidance

Collect:

- instruction files such as `AGENTS.md`, `CLAUDE.md`, `.cursor/**`, or repo-local prompts,
- old guidance directories such as `.ai-guidance/**`,
- custom verification scripts,
- CI jobs that already enforce AI or architecture behavior,
- docs that describe trust, evidence, policy, or proof expectations.

Do not copy old checks into Veritas one-to-one.

## 2. Classify Checks Before Migrating

For every check family, record:

- recent catch evidence,
- regression severity,
- false-positive risk,
- replacement test availability,
- owner,
- expiry or review trigger,
- default disposition.

Use these dispositions:

- `required`: protects a current trust contract and has an owner plus review trigger,
- `candidate`: useful but not proven enough to block by default,
- `advisory`: informative but not a blocker,
- `move-to-test`: product behavior that should be covered by unit/integration/e2e tests,
- `upstream-abstraction`: reusable verification shape that belongs in Veritas,
- `retire`: stale historical shape or helper-name lock.

Unknown catch evidence defaults to `candidate` or `advisory`, not `required`.

## 3. Create The Veritas Surface

Add:

- `.veritas/repo.adapter.json`,
- `.veritas/policy-packs/default.policy-pack.json`,
- `.veritas/GOVERNANCE.md`,
- `.veritas/README.md`,
- `.veritas/proof-families/**` for brownfield check-family inventories,
- proof-lane scripts in `package.json`.

Use a small required default lane first. In work-agent that lane is `proof:repo-governance`.

## 4. Keep The Old Guardrail As Compatibility Only

If a broad legacy verifier exists, keep it as a compatibility aggregator while measuring equivalence. Do not make it the permanent default required gate.

The aggregator should have:

- an owner,
- a de-requirement trigger,
- candidate/advisory family output,
- replacement-test links for product behavior checks.

## 5. Move Product Behavior Into Tests

Route behavior through normal tests:

- schemas and request/response contracts -> unit/integration tests,
- runtime/provider behavior -> integration tests,
- user workflows -> E2E tests,
- docs rendering -> docs build and rendered review.

Veritas should select and report those proof lanes; it should not become the only place product behavior is asserted.

## 6. Promote Only Reusable Shapes Upstream

Promote abstractions such as:

- structured proof-family results,
- candidate/advisory proof lane status,
- proof freshness and expiry,
- forbidden import-owner policies,
- brownfield check inventory generation.

Do not upstream assertions that name a single repo's modules, helper functions, or historical file layout.

## 7. Publish Guidance Carefully

During proving-ground work, a repo may depend on a local Veritas checkout such as `file:../../kontourai/veritas`. Public docs should use the published package flow after the next Veritas release includes the needed features.

Before treating a migration as public guidance, verify:

- `npm run proof:repo-governance`,
- the old compatibility aggregator if it still exists,
- normal static/test/build lanes,
- `veritas report`,
- `veritas shadow run`,
- docs build and rendered review if the docs are published.

The Veritas report should include `proof_family_results` and `verification_budget` when a repo declares proof-family manifests. If those fields are missing, check `evidence.proofFamilyManifests` in the adapter before adding more local script output.
